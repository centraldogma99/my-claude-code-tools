import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Sortie } from '../types'

const sorties = atom({ plugin: 'ac6-hud', key: 'sorties' } as const, [])
const weapons = atom({ plugin: 'ac6-hud', key: 'weapons' } as const, {})

const COCKPIT = 'cockpit'

const MODE_LABEL = {
  thinking: 'SCAN',
  requesting: 'UPLINK',
  responding: 'COMMS',
  'tool-input': 'LOCK-ON',
  'tool-use': 'FIRING',
} as const

const SLOTS = ['R-ARM', 'L-ARM', 'R-BACK', 'L-BACK'] as const

// Rows whose engine drawing carries more than a header line keep it.
const KEEP_ENGINE_ROW = new Set(['Agent', 'Task'])

const SUMMARY_KEYS = ['command', 'file_path', 'notebook_path', 'pattern', 'url', 'query', 'skill', 'path', 'description', 'prompt']

const AP_MAX = 10000
const BAR_CELLS = 8
const SPARK = '▁▂▃▄▅▆▇█'

// AP is the context window left: a fresh window is a full-health frame.
export function apReadout(usedPercent: number) {
  const left = Math.max(0, Math.min(100, 100 - usedPercent))
  const ap = Math.round((left / 100) * AP_MAX)
  const filled = Math.round((left / 100) * BAR_CELLS)
  const bar = '█'.repeat(filled) + '░'.repeat(BAR_CELLS - filled)
  const tone = left <= 20 ? 'error' : left <= 50 ? 'warning' : 'text'
  return { ap, bar, tone, isCritical: left <= 20 } as const
}

export function apSparkline(history: readonly Sortie[]) {
  return history
    .filter(one => one.usedPercent !== null)
    .map(one => SPARK[Math.min(7, Math.floor(((100 - (one.usedPercent ?? 0)) / 100) * 8))])
    .join('')
}

export function formatDuration(ms: number) {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function weaponName(tool: string) {
  return tool.startsWith('mcp__') ? (tool.split('__').at(-1) ?? tool) : tool
}

export function targetOf(input: unknown, width: number) {
  if (typeof input !== 'object' || input === null) return ''
  const record = input as Record<string, unknown>
  const key = SUMMARY_KEYS.find(k => typeof record[k] === 'string') ?? Object.keys(record).find(k => typeof record[k] === 'string')
  const text = key === undefined ? '' : String(record[key]).replace(/\s+/g, ' ').trim()
  return text.length > width ? `${text.slice(0, Math.max(1, width - 1))}…` : text
}

export function loadout(counts: Readonly<Record<string, number>>) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SLOTS.length)
    .map(([tool, count], i) => ({ slot: SLOTS[i] ?? '', tool, count }))
}

export const register: Register = on => {
  let startedAt = 0
  let arms = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cockpit', description: 'Toggle the AC cockpit panel: AP log and armament', immediate: true })
    $.ui.toast('MAIN SYSTEM ── ACTIVATING COMBAT MODE')
    return next(e)
  })

  on('command.run', { command: 'cockpit' }, async $ => {
    const isOpen = (await $.ui.panes()).some(pane => pane.id === COCKPIT)
    if (isOpen) {
      await $.ui.close({ id: COCKPIT })
      return { text: 'Cockpit offline.' }
    }
    await $.ui.open({ id: COCKPIT, title: 'COCKPIT' })
    return { text: 'Cockpit online. /cockpit again to close.' }
  })

  on('prompt.submit', async ($, e, next) => {
    startedAt = await $.clock.now()
    arms = 0
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    arms += 1
    const name = weaponName(String(e.tool))
    await update($, weapons, all => ({ ...all, [name]: (all[name] ?? 0) + 1 }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const seconds = Math.round(((await $.clock.now()) - startedAt) / 1000)
    const { context } = await $.session.usage()
    const sortie: Sortie = { usedPercent: context.percent ?? null, arms, seconds }

    await update($, sorties, list => [...list, sortie].slice(-30))
    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    next({
      ...e,
      props: { ...e.props, word: `◢ ${MODE_LABEL[e.props.mode]} ── ${e.props.word}`, suffix: ' ▮' },
    }),
  )

  on('ui.render', { component: 'TurnDuration' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text color="claude" bold>◆ MISSION COMPLETE</Text>
        <Text dimColor> ── {formatDuration(e.props.durationMs)}</Text>
      </Box>
    )
  })

  // The pilot's own prompt reads as a transmission; ctrl+o still shows the engine's row.
  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    if (e.props.origin.kind !== 'composer' || e.props.isExpanded) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box backgroundColor="userMessageBackground" paddingX={1}>
        <Text color="claude" bold>RAVEN ▸ </Text>
        <Text>{e.props.text}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (KEEP_ENGINE_ROW.has(e.props.tool)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const status = e.props.isRunning
      ? { label: '◢ FIRING ', color: 'warning' }
      : e.props.isInterrupted
        ? { label: '■ ABORT  ', color: 'inactive' }
        : e.props.isErrored
          ? { label: '✕ JAMMED ', color: 'error' }
          : { label: '▶ FIRED  ', color: 'claude' }
    const name = weaponName(e.props.tool)
    const width = (e.viewport?.columns ?? 100) - name.length - 16
    const target = targetOf(e.props.input, width)
    return (
      <Box>
        <Text color={status.color}>{status.label}</Text>
        <Text bold>{name}</Text>
        {target && <Text dimColor> ── {target}</Text>}
      </Box>
    )
  })

  // The HUD lives in the footer under the prompt, where the mode labels sit.
  on('ui.render', { component: 'SessionMode' }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const last = (await read($, sorties)).at(-1)
    const hud = last?.usedPercent == null ? null : apReadout(last.usedPercent)
    const modes = [...e.props.modes, 'COMBAT MODE'].join(' & ')
    return (
      <Box>
        <Text dimColor>{modes}</Text>
        {hud && (
          <Text color={hud.tone} bold={hud.isCritical}>
            {'  ┃ '}AP {hud.ap} {hud.bar}{hud.isCritical ? ' ⚠ CRITICAL' : ''}
          </Text>
        )}
        {last && <Text dimColor>{'  ┃ '}ARMS {last.arms}  ┃ LAST SORTIE {last.seconds}s</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: COCKPIT }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const history = await read($, sorties)
    const slots = loadout(await read($, weapons))
    const last = history.at(-1)
    const hud = last?.usedPercent == null ? null : apReadout(last.usedPercent)
    const totalArms = history.reduce((sum, one) => sum + one.arms, 0)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text color="claude" bold>◢ CORE STATUS ── C4-621 "RAVEN"</Text>
            <Button key="close" label="close" hotkey="x" role="dismiss" onPress={() => $.ui.close({ id: COCKPIT })} />
          </Box>
          {hud ? (
            <Text color={hud.tone} bold={hud.isCritical}>
              AP  {hud.ap} / {AP_MAX}  {hud.bar}{hud.isCritical ? '  ⚠ CRITICAL' : ''}
            </Text>
          ) : (
            <Text dimColor>AP  ── awaiting first sortie</Text>
          )}
          <Text dimColor>AP LOG  {apSparkline(history) || '─'}</Text>
          <Text dimColor>SORTIES {history.length}   TOTAL ARMS {totalArms}</Text>
        </Box>
        <Box flexDirection="column" borderStyle="single" borderColor="promptBorder" paddingX={1}>
          <Text color="claude" bold>ARMAMENT</Text>
          {slots.length === 0 && <Text dimColor>no weapons fired yet</Text>}
          {slots.map(one => (
            <Box>
              <Text dimColor>{one.slot.padEnd(7)}</Text>
              <Text bold>{one.tool.padEnd(14)}</Text>
              <Text color="claude">×{one.count}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
