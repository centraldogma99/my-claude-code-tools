// @ts-nocheck
import { access, copyFile, cp, mkdir, rm, stat, symlink } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { type Plugin, tool } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { parse as parseJsonc } from "jsonc-parser"
import {
	addSession,
	clearPendingDelete,
	getPendingDelete,
	getSession,
	getWorktreePath,
	removeSession,
	setPendingDelete,
} from "./worktree/state"
import { openTerminal } from "./worktree/terminal"
import { getProjectId } from "./worktree/utils"

type OpencodeClient = ReturnType<typeof createOpencodeClient>
const MAX_SESSION_CHAIN_DEPTH = 10
type GitResult = { ok: boolean; stdout: string; stderr: string }

interface WorktreeConfig {
	sync: { copyFiles: string[]; symlinkDirs: string[]; exclude: string[] }
	hooks: { postCreate: string[]; preDelete: string[] }
}

const defaultConfig: WorktreeConfig = {
	sync: { copyFiles: [], symlinkDirs: [], exclude: [] },
	hooks: { postCreate: [], preDelete: [] },
}

function validateBranch(name: string): string | null {
	if (!name) return "Branch name cannot be empty"
	if (name.length > 255) return "Branch name too long"
	if (name.startsWith("-")) return "Cannot start with '-'"
	if (name.startsWith("/") || name.endsWith("/")) return "Cannot start/end with '/'"
	if (name.includes("//")) return "Cannot contain '//'"
	if (name.includes("@{")) return "Cannot contain '@{'"
	if (name.includes("..")) return "Cannot contain '..'"
	if (name.startsWith(".") || name.endsWith(".")) return "Cannot start/end with '.'"
	if (name.endsWith(".lock")) return "Cannot end with '.lock'"
	if (/[\x00-\x1f\x7f~^:?*[\]\\;&|`$()]/.test(name)) return "Contains invalid characters"
	return null
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath)
		return true
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false
		throw error
	}
}

async function copyIfExists(src: string, dest: string): Promise<boolean> {
	if (!(await pathExists(src))) return false
	await copyFile(src, dest)
	return true
}

async function copyDirIfExists(src: string, dest: string): Promise<boolean> {
	if (!(await pathExists(src))) return false
	await cp(src, dest, { recursive: true })
	return true
}

async function getRootSessionId(client: OpencodeClient, sessionId: string): Promise<string> {
	let currentId = sessionId
	for (let i = 0; i < MAX_SESSION_CHAIN_DEPTH; i++) {
		const session = await client.session.get({ path: { id: currentId } })
		if (!session.data?.parentID) return currentId
		currentId = session.data.parentID
	}
	return currentId
}

async function forkWithContext(client: OpencodeClient, sessionId: string, projectId: string): Promise<{ id: string }> {
	if (!sessionId) throw new Error("sessionID is required")
	const rootSessionId = await getRootSessionId(client, sessionId)
	const forked = (await client.session.fork({ path: { id: sessionId }, body: {} })).data
	if (!forked?.id) throw new Error("Failed to fork session")

	const workspaceBase = path.join(os.homedir(), ".local", "share", "opencode", "workspace")
	const delegationsBase = path.join(os.homedir(), ".local", "share", "opencode", "delegations")
	const srcPlan = path.join(workspaceBase, projectId, rootSessionId, "plan.md")
	const srcDelegations = path.join(delegationsBase, projectId, rootSessionId)
	const destWorkspace = path.join(workspaceBase, projectId, forked.id)
	const destDelegations = path.join(delegationsBase, projectId, forked.id)

	try {
		await mkdir(destWorkspace, { recursive: true })
		await mkdir(destDelegations, { recursive: true })
		await copyIfExists(srcPlan, path.join(destWorkspace, "plan.md"))
		await copyDirIfExists(srcDelegations, destDelegations)
		return { id: forked.id }
	} catch (error) {
		await rm(destWorkspace, { recursive: true, force: true }).catch(() => {})
		await rm(destDelegations, { recursive: true, force: true }).catch(() => {})
		await client.session.delete({ path: { id: forked.id } }).catch(() => {})
		throw error
	}
}

async function git(args: string[], cwd: string): Promise<GitResult> {
	try {
		const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
		const [stdout, stderr, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		])
		return { ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() }
	} catch (error) {
		return { ok: false, stdout: "", stderr: error instanceof Error ? error.message : String(error) }
	}
}

async function branchExists(cwd: string, branch: string): Promise<boolean> {
	return (await git(["rev-parse", "--verify", branch], cwd)).ok
}

async function createWorktree(repoRoot: string, branch: string, baseBranch?: string): Promise<{ ok: boolean; path?: string; error?: string }> {
	const worktreePath = await getWorktreePath(repoRoot, branch)
	await mkdir(path.dirname(worktreePath), { recursive: true })
	const result = await (await branchExists(repoRoot, branch)
		? git(["worktree", "add", worktreePath, branch], repoRoot)
		: git(["worktree", "add", "-b", branch, worktreePath, baseBranch ?? "HEAD"], repoRoot))
	if (!result.ok) return { ok: false, error: result.stderr || result.stdout }
	return { ok: true, path: worktreePath }
}

async function removeWorktree(repoRoot: string, worktreePath: string): Promise<GitResult> {
	return git(["worktree", "remove", "--force", worktreePath], repoRoot)
}

function isPathSafe(relPath: string, baseDir: string): boolean {
	if (path.isAbsolute(relPath) || relPath.includes("..")) return false
	const resolved = path.resolve(baseDir, relPath)
	return resolved === baseDir || resolved.startsWith(`${baseDir}${path.sep}`)
}

async function copyFiles(sourceDir: string, targetDir: string, files: string[], log: (level: string, msg: string) => Promise<void>) {
	for (const file of files) {
		if (!isPathSafe(file, sourceDir)) continue
		const src = path.join(sourceDir, file)
		const dest = path.join(targetDir, file)
		try {
			const source = Bun.file(src)
			if (!(await source.exists())) continue
			await mkdir(path.dirname(dest), { recursive: true })
			await Bun.write(dest, source)
		} catch (error) {
			await log("warn", `[worktree] Failed to copy ${file}: ${error}`)
		}
	}
}

async function symlinkDirs(sourceDir: string, targetDir: string, dirs: string[], log: (level: string, msg: string) => Promise<void>) {
	for (const dir of dirs) {
		if (!isPathSafe(dir, sourceDir)) continue
		const src = path.join(sourceDir, dir)
		const dest = path.join(targetDir, dir)
		try {
			const fileStat = await stat(src).catch(() => null)
			if (!fileStat?.isDirectory()) continue
			await mkdir(path.dirname(dest), { recursive: true })
			await rm(dest, { recursive: true, force: true })
			await symlink(src, dest, "dir")
		} catch (error) {
			await log("warn", `[worktree] Failed to symlink ${dir}: ${error}`)
		}
	}
}

async function runHooks(cwd: string, commands: string[], log: (level: string, msg: string) => Promise<void>) {
	for (const command of commands) {
		const result = Bun.spawnSync(["bash", "-c", command], { cwd, stdout: "inherit", stderr: "pipe" })
		if (result.exitCode !== 0) {
			const stderr = result.stderr.toString().trim()
			await log("warn", `[worktree] Hook failed: ${command}${stderr ? `\n${stderr}` : ""}`)
		}
	}
}

function parseStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
}

async function loadWorktreeConfig(directory: string): Promise<WorktreeConfig> {
	const configPath = path.join(directory, ".opencode", "worktree.jsonc")
	const file = Bun.file(configPath)
	if (!(await file.exists())) {
		await mkdir(path.dirname(configPath), { recursive: true })
		await Bun.write(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`)
		return defaultConfig
	}
	try {
		const parsed = parseJsonc(await file.text()) as Record<string, unknown> | undefined
		const sync = (parsed?.sync as Record<string, unknown> | undefined) ?? {}
		const hooks = (parsed?.hooks as Record<string, unknown> | undefined) ?? {}
		return {
			sync: { copyFiles: parseStringArray(sync.copyFiles), symlinkDirs: parseStringArray(sync.symlinkDirs), exclude: parseStringArray(sync.exclude) },
			hooks: { postCreate: parseStringArray(hooks.postCreate), preDelete: parseStringArray(hooks.preDelete) },
		}
	} catch {
		return defaultConfig
	}
}

export const WorktreePlugin: Plugin = async (ctx) => {
	const { directory, client } = ctx
	const log = (level: string, message: string) => client.app.log({ body: { service: "worktree", level, message } }).catch(() => {})

	return {
		tool: {
			worktree_create: tool({
				description: "Create a new git worktree for isolated development. A new terminal will open with OpenCode in the worktree.",
				args: {
					branch: tool.schema.string().optional().describe(
						"Branch name for the worktree (e.g., 'feature/dark-mode'). " +
						"Infer a concise, descriptive branch name from the current conversation context. " +
						"Use kebab-case. If the conversation lacks sufficient context, ask the user for a name.",
					),
					baseBranch: tool.schema.string().optional().describe("Base branch to create from (defaults to HEAD)"),
				},
				async execute(args, toolCtx) {
					if (!args.branch) return "Please provide a branch name for the worktree. Example: 'feature/dark-mode'"
					const branchError = validateBranch(args.branch)
					if (branchError) return `❌ Invalid branch name: ${branchError}`
					if (args.baseBranch) {
						const baseError = validateBranch(args.baseBranch)
						if (baseError) return `❌ Invalid base branch name: ${baseError}`
					}

					const created = await createWorktree(directory, args.branch, args.baseBranch)
					if (!created.ok || !created.path) return `Failed to create worktree: ${created.error}`
					const worktreePath = created.path

					const config = await loadWorktreeConfig(directory)
					if (config.sync.copyFiles.length) await copyFiles(directory, worktreePath, config.sync.copyFiles, log)
					if (config.sync.symlinkDirs.length) await symlinkDirs(directory, worktreePath, config.sync.symlinkDirs, log)
					if (config.hooks.postCreate.length) await runHooks(worktreePath, config.hooks.postCreate, log)

					const projectId = await getProjectId(directory)
					const forkedSession = await forkWithContext(client, toolCtx.sessionID, projectId)
					const terminalResult = await openTerminal(worktreePath, `opencode --session ${forkedSession.id}`, args.branch)
					if (!terminalResult.success) await log("warn", `[worktree] Failed to open terminal: ${terminalResult.error}`)

					await addSession(directory, {
						id: forkedSession.id,
						branch: args.branch,
						path: worktreePath,
						createdAt: new Date().toISOString(),
					})
					return `Worktree created at ${worktreePath}\n\nA new terminal has been opened with OpenCode.`
				},
			}),

			worktree_delete: tool({
				description: "Delete the current worktree and clean up. Changes will be committed before removal.",
				args: { reason: tool.schema.string().describe("Brief explanation of why you are calling this tool") },
				async execute(_args, toolCtx) {
					const session = await getSession(directory, toolCtx?.sessionID ?? "")
					if (!session) return "No worktree associated with this session"
					await setPendingDelete(directory, { branch: session.branch, path: session.path })
					return "Worktree marked for cleanup. It will be removed when this session ends."
				},
			}),
		},

		event: async ({ event }: { event: Event }): Promise<void> => {
			if (event.type !== "session.idle") return
			const pendingDelete = await getPendingDelete(directory)
			if (!pendingDelete) return

			const { path: worktreePath, branch } = pendingDelete
			const config = await loadWorktreeConfig(directory)
			if (config.hooks.preDelete.length) await runHooks(worktreePath, config.hooks.preDelete, log)

			const addResult = await git(["add", "-A"], worktreePath)
			if (!addResult.ok) await log("warn", `[worktree] git add failed: ${addResult.stderr}`)

			const commitResult = await git(["commit", "-m", "chore(worktree): session snapshot", "--allow-empty"], worktreePath)
			if (!commitResult.ok) await log("warn", `[worktree] git commit failed: ${commitResult.stderr}`)

			const removeResult = await removeWorktree(directory, worktreePath)
			if (!removeResult.ok) await log("warn", `[worktree] Failed to remove worktree: ${removeResult.stderr}`)

			await clearPendingDelete(directory)
			await removeSession(directory, branch)
		},
	}
}

export default WorktreePlugin
