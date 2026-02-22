// @ts-nocheck
import { mkdir } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { getProjectId } from "./utils"

export interface Session { id: string; branch: string; path: string; createdAt: string }
export interface PendingDelete { branch: string; path: string }
interface State { sessions: Session[]; pendingDelete?: PendingDelete }

export async function getStatePath(projectRoot: string): Promise<string> {
	const projectId = await getProjectId(projectRoot)
	return path.join(os.homedir(), ".local", "share", "opencode", "plugins", "worktree", `${projectId}.json`)
}

export async function loadState(projectRoot: string): Promise<State> {
	const file = Bun.file(await getStatePath(projectRoot))
	if (!(await file.exists())) return { sessions: [] }
	try {
		const parsed = (await file.json()) as Partial<State>
		const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : []
		const pendingDelete =
			parsed.pendingDelete && typeof parsed.pendingDelete.branch === "string" && typeof parsed.pendingDelete.path === "string"
				? parsed.pendingDelete
				: undefined
		return { sessions, pendingDelete }
	} catch {
		return { sessions: [] }
	}
}

export async function saveState(projectRoot: string, state: State): Promise<void> {
	const statePath = await getStatePath(projectRoot)
	await mkdir(path.dirname(statePath), { recursive: true })
	await Bun.write(statePath, JSON.stringify(state, null, 2))
}

export async function getWorktreePath(projectRoot: string, branch: string): Promise<string> {
	return path.join(os.homedir(), ".local", "share", "opencode", "worktree", await getProjectId(projectRoot), branch)
}

export async function addSession(projectRoot: string, session: Session): Promise<void> {
	const state = await loadState(projectRoot)
	state.sessions = [...state.sessions.filter((s) => s.id !== session.id), session]
	await saveState(projectRoot, state)
}

export async function getSession(projectRoot: string, sessionId: string): Promise<Session | null> {
	if (!sessionId) return null
	return (await loadState(projectRoot)).sessions.find((s) => s.id === sessionId) ?? null
}

export async function removeSession(projectRoot: string, branch: string): Promise<void> {
	const state = await loadState(projectRoot)
	state.sessions = state.sessions.filter((s) => s.branch !== branch)
	await saveState(projectRoot, state)
}

export async function setPendingDelete(projectRoot: string, del: PendingDelete): Promise<void> {
	const state = await loadState(projectRoot)
	state.pendingDelete = del
	await saveState(projectRoot, state)
}

export async function getPendingDelete(projectRoot: string): Promise<PendingDelete | null> {
	return (await loadState(projectRoot)).pendingDelete ?? null
}

export async function clearPendingDelete(projectRoot: string): Promise<void> {
	const state = await loadState(projectRoot)
	delete state.pendingDelete
	await saveState(projectRoot, state)
}
