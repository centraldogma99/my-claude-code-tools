// @ts-nocheck
import * as crypto from "node:crypto"
import * as fsSync from "node:fs"
import * as os from "node:os"

export function escapeBash(str: string): string {
	if (str.includes("\x00")) {
		throw new Error("Bash argument contains null bytes")
	}
	return str
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\$/g, "\\$")
		.replace(/`/g, "\\`")
		.replace(/!/g, "\\!")
		.replace(/\n/g, " ")
		.replace(/\r/g, " ")
}

export function escapeAppleScript(str: string): string {
	if (str.includes("\x00")) {
		throw new Error("AppleScript argument contains null bytes")
	}
	return str
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, " ")
		.replace(/\r/g, " ")
}

export function isInsideTmux(): boolean {
	return !!process.env.TMUX
}

export function getTempDir(): string {
	return fsSync.realpathSync.native(os.tmpdir())
}

function hashPath(projectRoot: string): string {
	return crypto.createHash("sha256").update(projectRoot).digest("hex").slice(0, 16)
}

export async function getProjectId(projectRoot: string): Promise<string> {
	if (!projectRoot) throw new Error("projectRoot is required")

	try {
		const proc = Bun.spawn(["git", "rev-list", "--max-parents=0", "--all"], {
			cwd: projectRoot,
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined },
		})
		const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
		if (code === 0) {
			const roots = stdout
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
				.sort()
			if (roots[0] && /^[a-f0-9]{40}$/i.test(roots[0])) return roots[0]
		}
	} catch {
		// fall through to hash fallback
	}

	return hashPath(projectRoot)
}

export class Mutex {
	private locked = false
	private queue: Array<() => void> = []

	async acquire(): Promise<void> {
		if (!this.locked) {
			this.locked = true
			return
		}
		return new Promise((resolve) => this.queue.push(resolve))
	}

	release(): void {
		const next = this.queue.shift()
		if (next) next()
		else this.locked = false
	}

	async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire()
		try {
			return await fn()
		} finally {
			this.release()
		}
	}
}
