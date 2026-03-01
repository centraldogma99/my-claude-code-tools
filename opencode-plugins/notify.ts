import type { Plugin } from "@opencode-ai/plugin"
import * as path from "node:path"
import * as os from "node:os"

/**
 * Check if the iTerm2 tab is currently active/visible
 * Returns true if tab is active (skip notification), false otherwise (send notification)
 * Fails open: on any error, returns false (send notification)
 */
async function isTabActive(): Promise<boolean> {
	// Always notify over SSH
	if (process.env.SSH_TTY) {
		return false
	}

	try {
		// Check if iTerm2 is the frontmost application
		const frontmostProc = Bun.spawn(
			[
				"osascript",
				"-e",
				'tell application "System Events" to get name of first application process whose frontmost is true',
			],
			{ stdout: "pipe", stderr: "pipe" }
		)

		const [frontmostOutput] = await Promise.all([
			new Response(frontmostProc.stdout).text(),
			new Response(frontmostProc.stderr).text(),
			frontmostProc.exited,
		])

		const frontmost = frontmostOutput.trim()

		if (frontmost !== "iTerm2") {
			return false
		}

		// Extract our session ID from environment
		const ourSessionId = process.env.ITERM_SESSION_ID?.split(":")[1]
		if (!ourSessionId) {
			return false
		}

		// Get the active session ID from iTerm2
		const activeSessionProc = Bun.spawn(
			[
				"osascript",
				"-e",
				'tell application "iTerm2" to get unique ID of current session of current tab of current window',
			],
			{ stdout: "pipe", stderr: "pipe" }
		)

		const [activeSessionOutput] = await Promise.all([
			new Response(activeSessionProc.stdout).text(),
			new Response(activeSessionProc.stderr).text(),
			activeSessionProc.exited,
		])

		const activeSessionId = activeSessionOutput.trim()

		// If our session matches the active session, tab is visible
		if (ourSessionId === activeSessionId) {
			return true
		}

		return false
	} catch {
		// Fail open: on any error, send notification
		return false
	}
}

/**
 * Send a macOS system notification using terminal-notifier
 * Fire-and-forget: does not await the process
 */
function sendNotification(title: string, message: string): void {
	try {
		Bun.spawn(
			[
				"/opt/homebrew/opt/terminal-notifier/bin/terminal-notifier",
				"-title",
				title,
				"-message",
				message,
				"-timeout",
				"5",
			],
			{ stdout: "ignore", stderr: "ignore" }
		)
	} catch {
		// Silently ignore errors
	}
}

/**
 * Play an SCV sound effect using afplay
 * Fire-and-forget: does not await the process
 */
function playSound(category: "permission" | "completion"): void {
	try {
		const soundDir = path.join(os.homedir(), ".claude", "hooks", "assets", "sounds", "sc_scv")

		const sounds =
			category === "permission"
				? ["SomethingsInTheWay.mp3", "CantBuildThere.mp3"]
				: ["JobsFinished.mp3", "GoodToGoSir.mp3"]

		const selectedSound = sounds[Math.floor(Math.random() * sounds.length)]
		const fullPath = path.join(soundDir, selectedSound)

		Bun.spawn(["afplay", fullPath], { stdout: "ignore", stderr: "ignore" })
	} catch {
		// Silently ignore errors
	}
}

export const NotifyPlugin: Plugin = async (ctx) => {
	const { directory } = ctx

	return {
		event: async ({ event }) => {
			const projectName = path.basename(directory) || "unknown"

			switch (event.type) {
				case "permission.asked":
				case "permission.updated": {
					if (await isTabActive()) return
					sendNotification(`OpenCode - ${projectName}`, "권한 필요")
					playSound("permission")
					break
				}
				case "question.asked": {
					if (await isTabActive()) return
					sendNotification(`OpenCode - ${projectName}`, "질문 있음")
					playSound("permission")
					break
				}
				case "session.idle": {
					if (await isTabActive()) return
					sendNotification(`OpenCode - ${projectName}`, "완료")
					playSound("completion")
					break
				}
			}
		},
	}
}

export default NotifyPlugin
