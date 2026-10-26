import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'pin', component: 'Pane', requestId: 'pin', surface: 'terminal',
  props: { title: 'Pinned', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const MESSAGES = [
  { role: 'user', text: 'q', toolUses: [] },
  { role: 'assistant', text: 'first reply', toolUses: [] },
  { role: 'assistant', text: '', toolUses: [] },
  { role: 'assistant', text: 'last reply', toolUses: [] },
]

function engine(on: any, onClose = () => {}) {
  on('command.register', () => ({ value: { command: 'pin' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => (onClose(), { value: undefined }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
}

async function texts($: any) {
  const ui = await $.ui.mount(PANE)
  const all = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text)
  await ui.unmount()
  return all
}

test('/pin pins the last reply, /pin 2 the one before, skipping empty ones', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ command: 'pin', args: '' })).text).toBe('Pinned 10 chars.')
  await $.command.run({ command: 'pin', args: '2' })
  const shown = await texts($)
  expect(shown).toContain('last reply')
  expect(shown).toContain('first reply')
})

test('bad N and out-of-range N are refused', async ($, on) => {
  engine(on)
  expect((await $.command.run({ command: 'pin', args: 'x' })).text).toBe('Usage: /pin [N|clear]')
  expect((await $.command.run({ command: 'pin', args: '9' })).text).toBe('No reply #9 to pin.')
})

test('/pin clear empties the pane', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'pin', args: '' })
  await $.command.run({ command: 'pin', args: 'clear' })
  expect(await texts($)).toContain('Nothing pinned. /pin')
})

test('/unpin N removes that pin, /unpin the last, and the pane closes when empty', async ($, on) => {
  let closed = 0
  engine(on, () => closed++)
  await $.command.run({ command: 'pin', args: '1' })
  await $.command.run({ command: 'pin', args: '2' })
  await $.command.run({ command: 'pin', args: '1' })
  expect((await $.command.run({ command: 'unpin', args: '1' })).text).toBe('Unpinned #1.')
  expect(await texts($)).toEqual(['── #1 ', 'first reply', '── #2 ', 'last reply'])
  expect((await $.command.run({ command: 'unpin', args: '5' })).text).toBe('Usage: /unpin [1-2]')
  expect((await $.command.run({ command: 'unpin', args: '' })).text).toBe('Unpinned #2.')
  expect(closed).toBe(0)
  await $.command.run({ command: 'unpin', args: '' })
  expect(closed).toBe(1)
  expect((await $.command.run({ command: 'unpin', args: '' })).text).toBe('Nothing pinned.')
})

test('the Unpin button removes its own pin', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'pin', args: '2' })
  await $.command.run({ command: 'pin', args: '1' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'unpin-0' })
  const left = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text)
  await ui.unmount()
  expect(left).toEqual(['── #1 ', 'last reply'])
})

const REPLY = (viewport: object, props: object = {}) => ({
  plugin: 'pin', component: 'AssistantMessage', requestId: 'm1', surface: 'terminal', viewport,
  props: { text: 'the problem is X', isFirstOfReply: true, ...props },
}) as any

test('fullscreen: a reply carries a pin button that pins its text', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(REPLY({ columns: 80, rows: 24, isFullscreen: true }))
  await ui.press({ key: 'pin-m1' })
  await ui.unmount()
  expect(await texts($)).toContain('the problem is X')
})

for (const [why, viewport, props] of [
  ['main screen', { columns: 80, rows: 24, isFullscreen: false }, {}],
  ['summary block', { columns: 80, rows: 24, isFullscreen: true }, { isSummary: true }],
  ['empty block', { columns: 80, rows: 24, isFullscreen: true }, { text: '  ' }],
] as const) {
  test(`${why}: the engine draws the reply as it is`, async ($, on) => {
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    const ui = await $.ui.mount(REPLY(viewport, props))
    expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await ui.unmount()
  })
}
