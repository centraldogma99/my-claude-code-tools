import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const PANE = 'pin'
const pins = atom({ plugin: 'pin', key: 'pins' } as const, [], { shape: 'pins-1' })

async function unpin($: EngineInterface, i: number) {
  await update($, pins, list => list.filter((_, j) => j !== i))
  if (!(await read($, pins)).length) await $.ui.close({ id: PANE })
}

async function addPin($: EngineInterface, text: string) {
  await update($, pins, list => [...list, { text }])
  await $.ui.open({ id: PANE, title: 'Pinned' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pin',
      description: 'Pin the Nth last reply (/pin 2) to a pane; /pin clear empties it',
    })
    await $.command.register({
      name: 'unpin',
      description: 'Remove pin #N from the pane (/unpin 2); the last one when N is left out',
    })
    if ((await read($, pins)).length) void $.ui.open({ id: PANE, title: 'Pinned' })

    return next(e)
  })

  on('command.run', { command: 'pin' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'clear') {
      await update($, pins, () => [])
      await $.ui.close({ id: PANE })
      return { text: 'Pins cleared.' }
    }

    const n = Number(arg || 1)
    if (!Number.isInteger(n) || n < 1) return { text: 'Usage: /pin [N|clear]' }
    const replies = (await $.session.messages()).filter(m => m.role === 'assistant' && m.text.trim())
    const text = replies.at(-n)?.text.trim()
    if (!text) return { text: `No reply #${n} to pin.` }

    await addPin($, text)
    return { text: `Pinned ${text.length} chars.` }
  })

  on('command.run', { command: 'unpin' }, async ($, e) => {
    const count = (await read($, pins)).length
    const n = e.args.trim() ? Number(e.args.trim()) : count
    if (!Number.isInteger(n) || n < 1 || n > count) return { text: count ? `Usage: /unpin [1-${count}]` : 'Nothing pinned.' }
    await unpin($, n - 1)
    return { text: `Unpinned #${n}.` }
  })

  // Draws the reply as the engine would, plus a pin button revealed on hover.
  // Only where a mouse reaches the transcript: the terminal's fullscreen layout.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !e.viewport?.isFullscreen || e.props.isSummary || !e.props.text.trim()) return next(e)
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const text = e.props.text.trim()

    return (
      <Box key={`reply-${e.requestId}`} flexDirection="row">
        <Box width={2}><Text>{e.props.isFirstOfReply ? '⏺' : ' '}</Text></Box>
        <Box flexGrow={1}><Markdown text={e.props.text} /></Box>
        <Box position="absolute" top={0} right={0} display="none" hover={{ display: 'flex' }}>
          <Button key={`pin-${e.requestId}`} label="📌 pin" onPress={() => addPin($, text)} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, pins)

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>Nothing pinned. /pin</Text>}
        {list.map((pin, i) => (
          <Box flexDirection="column" marginBottom={1}>
            <Box>
              <Text dimColor>── #{i + 1} </Text>
              <Button key={`unpin-${i}`} label="Unpin" onPress={() => unpin($, i)} />
            </Box>
            <Text>{pin.text}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
