import { expect, mock, test } from 'claude-code/testing'

import { apReadout, apSparkline, formatDuration, loadout, targetOf, weaponName } from './register'

const SURFACES = ['terminal', 'desktop'] as const

// Stands for the engine beneath the plugin: draws the props it was handed.
const engineDraws = ($: any, e: any) => {
  const { Text } = $.ui.resolve(e)
  if (e.component === 'Spinner') return <Text>{e.props.word}{e.props.suffix}</Text>
  return <Text>engine draws {e.component}</Text>
}

// The world a sortie needs beneath the plugin; `percents` is the context used after each turn.
function battlefield(on: any, percents: number[]) {
  on('ui.render', engineDraws)
  on('session.usage', () => ({ value: { context: { percent: percents.shift() ?? 0, window: 200000 } } }))
  on('tool.call', () => ({ result: { stdout: 'ok' } }))
  on('turn.complete', () => ({ text: '' }))
  return { clock: mock.clock(on) }
}

async function sortie($: any, clock: any, toolCalls: number, endsAt: number) {
  for (let i = 0; i < toolCalls; i++) await $.tool.call({ tool: 'Bash', input: { command: 'ls' } })
  await clock.set(endsAt)
  await $.turn.complete({})
}

test('AP gauge has three bands: nominal, warning, critical', async () => {
  expect(apReadout(10)).toMatchObject({ ap: 9000, tone: 'text', isCritical: false })
  expect(apReadout(60)).toMatchObject({ ap: 4000, tone: 'warning', isCritical: false })
  expect(apReadout(85)).toMatchObject({ ap: 1500, tone: 'error', isCritical: true })
  expect(apReadout(0).bar).toBe('████████')
  expect(apReadout(100).bar).toBe('░░░░░░░░')
})

test('helpers: sparkline, durations, weapon names, targets, loadout', async () => {
  expect(apSparkline([{ usedPercent: 0, arms: 0, seconds: 0 }, { usedPercent: null, arms: 0, seconds: 0 }, { usedPercent: 90, arms: 0, seconds: 0 }])).toBe('█▁')
  expect(formatDuration(3000)).toBe('3s')
  expect(formatDuration(64000)).toBe('1m 4s')
  expect(weaponName('mcp__context7__query-docs')).toBe('query-docs')
  expect(weaponName('Bash')).toBe('Bash')
  expect(targetOf({ command: 'npm   test\n --watch' }, 40)).toBe('npm test --watch')
  expect(targetOf({ command: 'abcdefghij' }, 5)).toBe('abcd…')
  expect(targetOf({ other: 'fallback', n: 1 }, 40)).toBe('fallback')
  expect(targetOf(null, 40)).toBe('')
  expect(loadout({ Read: 2, Bash: 9, Edit: 5, Grep: 1, Glob: 1 })).toEqual([
    { slot: 'R-ARM', tool: 'Bash', count: 9 },
    { slot: 'L-ARM', tool: 'Edit', count: 5 },
    { slot: 'R-BACK', tool: 'Read', count: 2 },
    { slot: 'L-BACK', tool: 'Grep', count: 1 },
  ])
})

test('spinner carries the combat label for its mode', async ($, on) => {
  on('ui.render', engineDraws)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'ac6-hud', surface, component: 'Spinner',
      props: { word: 'Calibrating', message: null, suffix: '…', mode: 'tool-use' },
    })
    expect(await ui.find({ type: 'Text', text: /FIRING ── Calibrating/ })).toBeDefined()
    await ui.unmount()
  }
})

test('turn end reads MISSION COMPLETE', async $ => {
  const ui = await $.ui.mount({
    plugin: 'ac6-hud', surface: 'terminal', component: 'TurnDuration',
    props: { word: 'Baked', durationMs: 64000 },
  })
  expect(await ui.find({ type: 'Text', text: /MISSION COMPLETE/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1m 4s/ })).toBeDefined()
})

test('pilot prompts read RAVEN; expanded rows and notifications keep the engine row', async ($, on) => {
  on('ui.render', engineDraws)
  const row = (props: any) => $.ui.mount({ plugin: 'ac6-hud', surface: 'terminal', component: 'UserMessage', props })

  const pilot = await row({ text: 'deploy it', origin: { kind: 'composer' }, isExpanded: false })
  expect(await pilot.find({ type: 'Text', text: /RAVEN/ })).toBeDefined()
  expect(await pilot.find({ type: 'Text', text: 'deploy it' })).toBeDefined()

  const expanded = await row({ text: 'deploy it', origin: { kind: 'composer' }, isExpanded: true })
  expect(await expanded.find({ type: 'Text', text: /engine draws/ })).toBeDefined()

  const notice = await row({ text: 'task done', origin: { kind: 'task-notification' }, isExpanded: false })
  expect(await notice.find({ type: 'Text', text: /engine draws/ })).toBeDefined()
})

test('tool rows read as weapon fire in each state; Agent keeps the engine row', async ($, on) => {
  on('ui.render', engineDraws)
  const row = (props: any) =>
    $.ui.mount({
      plugin: 'ac6-hud', surface: 'terminal', component: 'ToolUse',
      props: { tool_use_id: 't', tool: 'Bash', input: { command: 'npm test' }, isRunning: false, isErrored: false, isInterrupted: false, ...props },
      viewport: { columns: 100, rows: 40 },
    } as any)

  for (const [props, label] of [
    [{ isRunning: true }, /FIRING/],
    [{}, /FIRED/],
    [{ isErrored: true }, /JAMMED/],
    [{ isInterrupted: true, isErrored: true }, /ABORT/],
  ] as const) {
    const ui = await row(props)
    expect(await ui.find({ type: 'Text', text: label })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /npm test/ })).toBeDefined()
  }

  const agent = await row({ tool: 'Agent', input: { prompt: 'x' } })
  expect(await agent.find({ type: 'Text', text: /engine draws/ })).toBeDefined()
})

test('footer HUD: modes only before the first sortie, then AP and ARMS', async ($, on) => {
  const { clock } = battlefield(on, [85])
  const footer = { plugin: 'ac6-hud', surface: 'terminal', component: 'SessionMode', props: { modes: ['focus'] } } as const

  const before = await $.ui.mount(footer)
  expect(await before.find({ type: 'Text', text: /focus & COMBAT MODE/ })).toBeDefined()
  expect(await before.find({ type: 'Text', text: /AP/ })).toBeUndefined()
  await before.unmount()

  await sortie($, clock, 3, 12000)
  const after = await $.ui.mount(footer)
  expect(await after.find({ type: 'Text', text: /AP 1500 .* CRITICAL/ })).toBeDefined()
  expect(await after.find({ type: 'Text', text: /ARMS 3 .*LAST SORTIE 12s/ })).toBeDefined()
})

test('cockpit pane: standby before a sortie, then AP log and armament', async ($, on) => {
  const { clock } = battlefield(on, [30])
  const pane = {
    plugin: 'ac6-hud', surface: 'terminal', component: 'Pane', requestId: 'cockpit',
    props: { title: 'COCKPIT', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as any

  const before = await $.ui.mount(pane)
  expect(await before.find({ type: 'Text', text: /awaiting first sortie/ })).toBeDefined()
  expect(await before.find({ type: 'Text', text: /no weapons fired yet/ })).toBeDefined()
  await before.unmount()

  await sortie($, clock, 2, 5000)
  const after = await $.ui.mount(pane)
  expect(await after.find({ type: 'Text', text: /AP {2}7000 \/ 10000/ })).toBeDefined()
  expect(await after.find({ type: 'Text', text: /R-ARM/ })).toBeDefined()
  expect(await after.find({ type: 'Text', text: '×2' })).toBeDefined()
  expect(await after.find({ type: 'Text', text: /SORTIES 1 {3}TOTAL ARMS 2/ })).toBeDefined()
})

test('/cockpit toggles the pane, and its close button shuts it', async ($, on) => {
  const open = new Set<string>()
  on('ui.render', engineDraws)
  on('ui.panes', () => ({ value: [...open].map(id => ({ id, title: id })) }) as any)
  on('ui.open', ($: any, e: any) => { open.add(e.id); return { value: { isPlaced: true } } } )
  on('ui.close', ($: any, e: any) => { open.delete(e.id); return { value: undefined } })
  on('command.run', () => ({ text: '' }))

  expect((await $.command.run({ command: 'cockpit', args: '' } as any)).text).toMatch(/online/)
  expect(open.has('cockpit')).toBe(true)
  expect((await $.command.run({ command: 'cockpit', args: '' } as any)).text).toMatch(/offline/)
  expect(open.has('cockpit')).toBe(false)

  await $.command.run({ command: 'cockpit', args: '' } as any)
  const pane = await $.ui.mount({
    plugin: 'ac6-hud', surface: 'terminal', component: 'Pane', requestId: 'cockpit',
    props: { title: 'COCKPIT', isFocused: true, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as any)
  await pane.press({ key: 'close' })
  expect(open.has('cockpit')).toBe(false)
})
