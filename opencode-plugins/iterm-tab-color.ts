import type { Plugin } from "@opencode-ai/plugin"
import { writeFileSync } from "node:fs"

function isITerm(): boolean {
  return (
    process.env.TERM_PROGRAM === "iTerm.app" ||
    process.env.LC_TERMINAL === "iTerm2" ||
    !!process.env.ITERM_SESSION_ID
  )
}

function setTabColor(color: "yellow" | "red" | "green" | "reset"): void {
  if (!isITerm()) return
  if (process.env.SSH_TTY) return

  const colors: Record<string, string> = {
    yellow: "ffc800",
    red: "ff3232",
    green: "32c832",
    reset: "default",
  }

  const seq = `\x1b]1337;SetColors=tab=${colors[color]}\x07`
  const output = process.env.TMUX
    ? `\x1bPtmux;${seq.replace(/\x1b/g, "\x1b\x1b")}\x1b\\`
    : seq

  try {
    writeFileSync("/dev/tty", output)
  } catch {}
}

export default (async () => {
  return {
    event: async ({ event }) => {
      switch (event.type) {
        case "session.status": {
          const status = (event as any).properties?.status?.type
          if (status === "busy") setTabColor("yellow")
          if (status === "idle") setTabColor("green")
          break
        }
        case "permission.asked":
        case "permission.updated":
          setTabColor("red")
          break
        case "permission.replied":
          setTabColor("yellow")
          break
      }
    },
  }
}) satisfies Plugin
