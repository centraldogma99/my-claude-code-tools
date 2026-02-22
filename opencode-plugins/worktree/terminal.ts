// @ts-nocheck
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { escapeAppleScript, escapeBash, getTempDir, isInsideTmux, Mutex } from "./utils"

function wrapWithSelfCleanup(script: string): string {
	return `#!/bin/bash
trap 'rm -f "$0"' EXIT INT TERM
${script}`
}

export type TerminalType = "tmux" | "iterm"

export interface TerminalResult {
	success: boolean
	error?: string
}

const tmuxMutex = new Mutex()
const STABILIZATION_DELAY_MS = 150

export function detectTerminalType(): TerminalType {
	if (isInsideTmux()) return "tmux"
	return "iterm"
}

export async function openTmuxWindow(options: {
	sessionName?: string
	windowName: string
	cwd: string
	command?: string
}): Promise<TerminalResult> {
	const { sessionName, windowName, cwd, command } = options
	return tmuxMutex.runExclusive(async () => {
		try {
			const tmuxArgs = ["new-window", "-n", windowName, "-c", cwd, "-P", "-F", "#{pane_id}"]
			if (sessionName) tmuxArgs.splice(1, 0, "-t", sessionName)
			if (command) {
				const scriptPath = path.join(getTempDir(), `worktree-${Bun.randomUUIDv7()}.sh`)
				const scriptContent = wrapWithSelfCleanup(
					`cd "${escapeBash(cwd)}" || exit 1
${escapeBash(command)}
exec $SHELL`,
				)
				await Bun.write(scriptPath, scriptContent)
				Bun.spawnSync(["chmod", "+x", scriptPath])
				tmuxArgs.push("--", "bash", scriptPath)
			}
			const result = Bun.spawnSync(["tmux", ...tmuxArgs])
			if (result.exitCode !== 0) {
				return { success: false, error: `Failed to create tmux window: ${result.stderr.toString()}` }
			}
			await Bun.sleep(STABILIZATION_DELAY_MS)
			return { success: true }
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) }
		}
	})
}

export async function openITermTerminal(cwd: string, command?: string): Promise<TerminalResult> {
	if (!cwd) return { success: false, error: "Working directory is required" }

	const scriptContent = wrapWithSelfCleanup(
		command
			? `cd "${escapeBash(cwd)}" && ${escapeBash(command)}\nexec bash`
			: `cd "${escapeBash(cwd)}"\nexec bash`,
	)

	let scriptPath: string | null = null
	try {
		scriptPath = path.join(getTempDir(), `worktree-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`)
		const scriptFile = scriptPath
		await Bun.write(scriptPath, scriptContent)
		await fs.chmod(scriptPath, 0o755)

		const appleScript = `
			tell application "iTerm"
				if not (exists window 1) then
					reopen
				else
					tell current window
						create tab with default profile
					end tell
				end if
				activate
				tell first session of current tab of current window
					write text "${escapeAppleScript(scriptFile)}"
				end tell
			end tell
		`
		const result = Bun.spawnSync(["osascript", "-e", appleScript])
		if (result.exitCode !== 0) {
			return { success: false, error: `iTerm AppleScript failed: ${result.stderr.toString()}` }
		}
		scriptPath = null
		return { success: true }
	} catch (error) {
		if (scriptPath) await fs.rm(scriptPath).catch(() => {})
		return { success: false, error: error instanceof Error ? error.message : String(error) }
	}
}

export async function openTerminal(
	cwd: string,
	command?: string,
	windowName?: string,
): Promise<TerminalResult> {
	const terminalType = detectTerminalType()
	if (terminalType === "tmux") {
		return openTmuxWindow({ windowName: windowName || "worktree", cwd, command })
	}
	return openITermTerminal(cwd, command)
}
