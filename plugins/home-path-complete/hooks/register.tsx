import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

const hits = atom({ plugin: 'home-path-complete', key: 'hits' } as const, [] as string[])

// `~/dir/sub/pre` ending at the cursor → the dir under $HOME and the partial name
export function pathToken(text: string, cursor: number) {
  const m = /(?:^|\s)(~\/\S*)$/.exec(text.slice(0, cursor))
  if (!m) return null
  const token = m[1]
  const slash = token.lastIndexOf('/')
  return { dir: token.slice(2, slash + 1), prefix: token.slice(slash + 1) }
}

async function candidates($: Engine, text: string, cursor: number) {
  const tok = pathToken(text, cursor)
  if (!tok) return null
  const home = await $.env.get('HOME')
  const entries = await $.fs.list(`${home}/${tok.dir}`).catch(() => [])
  const names = entries
    .filter(f => f.name.startsWith(tok.prefix) && (tok.prefix.startsWith('.') || !f.name.startsWith('.')))
    .map(f => (f.kind === 'dir' ? `${f.name}/` : f.name))
    .sort()
  return { ...tok, names }
}

async function refresh($: Engine, text: string, cursor: number) {
  const c = await candidates($, text, cursor)
  await update($, hits, () => c?.names ?? [])
}

export function commonPrefix(names: string[]) {
  let p = names[0] ?? ''
  for (const n of names) while (!n.startsWith(p)) p = p.slice(0, -1)
  return p
}

// shell-style: extend the partial name before the cursor by what all matches share
async function accept($: Engine) {
  const box = await $.prompt.read()
  const c = await candidates($, box.text, box.cursor)
  if (!c?.names.length) return
  const rest = commonPrefix(c.names).slice(c.prefix.length)
  if (!rest) return
  await $.prompt.fill({ text: rest, mode: 'insert' })
  const after = await $.prompt.read()
  await refresh($, after.text, after.cursor)
}

export const register: Register = on => {
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    await refresh($, r.text, r.cursor)
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, hits, () => [])
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const names = await read($, hits)
    if (e.props.hasSurvey || !names.length) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    // ponytail: first 12 shown, keep typing to narrow
    const more = names.length > 12 ? `  +${names.length - 12}` : ''
    return (
      <Box flexDirection="row" columnGap={1}>
        {/* the keybinding (ctrl+f) for this unused action presses it from the prompt */}
        <Button key="accept" label="ctrl+f" action="app:cycleDiffBase" onPress={() => accept($)} />
        <Text dimColor wrap="truncate-end">{names.slice(0, 12).join('  ')}{more}</Text>
      </Box>
    )
  })
}
