import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { COUNT_SH, INDEX_SH, READ_SH, excerpt, injection, parseArgs, parseTurns, toCards } from '../hooks/lib'

const DIR = '/h/.claude/projects/-w-proj'
const A = `${DIR}/aaa.jsonl`
const row = (o: object) => JSON.stringify(o)
const SESSION = [
  row({ type: 'user', message: { role: 'user', content: '로그인 401이 간헐적으로 떠' } }),
  row({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '만료 시각을 로그로 찍어 보죠' }] } }),
  row({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'SECRET TOOL OUTPUT' }] } }),
  row({ type: 'user', isMeta: true, message: { role: 'user', content: 'meta row' } }),
  row({ type: 'user', message: { role: 'user', content: '<command-name>/clear</command-name>' } }),
  row({ type: 'user', message: { role: 'user', content: '서버 시계가 2분 빨라' } }),
  row({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'leeway 30초로 합시다' }] } }),
].join('\n')

const SPANS = JSON.stringify([
  { from: 1, to: 2, summary: '서버 시계 오차로 401 → leeway 30초', decisions: ['leeway 30초'], files: ['auth.ts'], open: [] },
  { from: 5, to: 9, summary: '범위를 벗어난 구간', decisions: [], files: [], open: [] },
])

function world(on: On, opts: { rank: string; noHits?: boolean; store?: Record<string, unknown> }) {
  const calls = { model: [] as string[], toasts: [] as string[], logs: [] as string[], closed: 0 }
  mock.store(on, opts.store)
  mock.env(on, { HOME: '/h' })
  on('session.id', () => ({ value: 'me' }))
  on('session.cwd', () => ({ value: '/w/proj' }))
  on('command.register', () => ({ value: {} }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => (calls.closed++, { value: undefined }))
  on('ui.log', ($, e) => (calls.logs.push(e.text), { value: undefined }))
  on('ui.toast', ($, e) => (calls.toasts.push(e.text), { value: undefined }))
  on('fs.list', () => ({ value: [
    { name: 'aaa.jsonl', kind: 'file', size: 1, mtimeMs: Date.parse('2026-04-12'), isLink: false },
    { name: 'me.jsonl', kind: 'file', size: 1, mtimeMs: Date.parse('2026-10-03'), isLink: false },
  ] }))
  on('process.run', ($, e) => {
    const script = e.argv[2]
    const out =
      opts.noHits ? ''
      : script === COUNT_SH ? `   3 ${A}\n`
      : script === INDEX_SH ? `${A}:${row({ type: 'ai-title', aiTitle: '로그인 401 디버깅' })}\n`
      : script === READ_SH ? SESSION
      : ''
    return { value: { exitCode: out ? 0 : 1, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('model.complete', ($, e) => {
    calls.model.push(e.model)
    const text = e.model === 'haiku' ? '["token", "401"]' : e.prompt.includes('세션 목록') ? opts.rank : SPANS
    return { value: { isAnswered: true, text, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } } as never
  })
  return calls
}

const run = (args: string) =>
  ({ command: 'recall', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } }) as never

const PANE = { plugin: 'recall', surface: 'terminal', component: 'Pane', requestId: 'recall', props: { title: 'recall', isFocused: true, bodyColumns: 60 } } as const

test('/recall searches, shows only summary cards, and a failed inject keeps the pick', async ($, on) => {
  const calls = world(on, { rank: '["aaa"]' })
  const clock = mock.clock(on)

  await $.command.run(run('토큰 꼬였던 거'))
  await clock.advance(1)
  for (let i = 0; i < 50 && !(await mounted()).done; i++) await clock.advance(1)

  async function mounted() {
    const ui = await $.ui.mount(PANE as never)
    const text = JSON.stringify(await ui.drawn())
    await ui.unmount()
    return { done: text.includes('카드 1개'), text }
  }

  const { text } = await mounted()
  expect(text).toContain('서버 시계 오차로 401')
  expect(text).not.toContain('범위를 벗어난 구간')
  expect(text).not.toContain('leeway 30초로 합시다')
  expect(calls.model).toEqual(['haiku', 'sonnet', 'sonnet'])

  // The test kit has no row store beneath $.session.append (a plugin's append skips the test's hooks),
  // so here the append fails: the pick must stay selected and nothing lands in the recent list.
  const ui = await $.ui.mount(PANE as never)
  await ui.press({ key: 'pick-aaa:1-2' })
  await ui.press({ key: 'inject' })
  expect(calls.toasts.at(-1)).toContain('주입 실패')
  expect((await ui.find({ key: 'pick-aaa:1-2' }))?.text).toContain('[x]')
  expect(calls.closed).toBe(0)
  expect(calls.logs).toEqual([])
  await ui.unmount()

  await $.command.run(run(''))
  const recent = await $.ui.mount(PANE as never)
  expect(JSON.stringify(await recent.drawn())).toContain('최근 주입한 항목이 없습니다')
})

test('/recall with no matching session says so and calls no extraction', async ($, on) => {
  const calls = world(on, { rank: '[]', noHits: true })
  const clock = mock.clock(on)

  await $.command.run(run('없는 주제'))
  for (let i = 0; i < 20; i++) await clock.advance(1)
  const ui = await $.ui.mount(PANE as never)
  expect(JSON.stringify(await ui.drawn())).toContain('관련 세션을 찾지 못했습니다')
  expect(calls.model).toEqual(['haiku', 'sonnet'])
})

test('/recall with nothing injected yet says how to search', async ($, on) => {
  world(on, { rank: '[]' })
  await $.command.run(run(''))
  const ui = await $.ui.mount(PANE as never)
  expect(JSON.stringify(await ui.drawn())).toContain('최근 주입한 항목이 없습니다')
})

test('/recall with no query lists the recently injected cards', async ($, on) => {
  const card = toCards(SPANS, { path: A, sessionId: 'aaa', mtimeMs: Date.parse('2026-04-12') }, '로그인 401 디버깅', 2)
  world(on, { rank: '[]', store: { recent: card } })
  await $.command.run(run(''))
  const ui = await $.ui.mount(PANE as never)
  const text = JSON.stringify(await ui.drawn())
  expect(text).toContain('최근 주입한 항목')
  expect(text).toContain('서버 시계 오차로 401')
})

test('pane: bold title, dim meta, plain summary; a picked title turns green', async ($, on) => {
  const card = toCards(SPANS, { path: A, sessionId: 'aaa', mtimeMs: Date.parse('2026-04-12') }, '로그인 401 디버깅', 2)
  world(on, { rank: '[]', store: { recent: card } })
  await $.command.run(run(''))
  const ui = await $.ui.mount(PANE as never)
  const props = async (text: string) => (await ui.find({ type: 'Text', text }))?.props as Record<string, unknown> | undefined

  expect(await props('최근 주입한 항목')).toMatchObject({ bold: true, color: 'claude' })
  expect(await props('로그인 401 디버깅')).toMatchObject({ bold: true })
  expect((await props('로그인 401 디버깅'))?.color).toBeUndefined()
  expect(await props('2026-04-12 · 턴 1–2')).toMatchObject({ dimColor: true })
  expect((await props('서버 시계 오차로 401'))?.dimColor).toBeUndefined()
  expect((await ui.find({ key: 'pick-aaa:1-2' }))?.text).toBe('[ ]')

  await ui.press({ key: 'pick-aaa:1-2' })
  expect((await ui.find({ key: 'pick-aaa:1-2' }))?.text).toBe('[x]')
  expect(await props('로그인 401 디버깅')).toMatchObject({ bold: true, color: 'success' })
})

test('pane: 닫기 sits right of 주입 and closes the pane, with or without cards', async ($, on) => {
  const card = toCards(SPANS, { path: A, sessionId: 'aaa', mtimeMs: Date.parse('2026-04-12') }, 't', 2)
  const calls = world(on, { rank: '[]', store: { recent: card } })
  await $.command.run(run(''))
  const ui = await $.ui.mount(PANE as never)
  const keys = (await ui.findAll({ type: 'Button' })).map(b => b.key)
  expect(keys.slice(-2)).toEqual(['inject', 'close'])
  await ui.press({ key: 'close' })
  expect(calls.closed).toBe(1)
})

test('pane: 닫기 alone when there are no cards', async ($, on) => {
  const calls = world(on, { rank: '[]' })
  await $.command.run(run(''))
  const ui = await $.ui.mount(PANE as never)
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['close'])
  await ui.press({ key: 'close' })
  expect(calls.closed).toBe(1)
})

test('lib: turns drop tool results, meta and command rows', () => {
  const turns = parseTurns(SESSION)
  expect(turns.map(t => t.user)).toEqual(['로그인 401이 간헐적으로 떠', '서버 시계가 2분 빨라'])
  expect(turns[1]?.assistant).toBe('leeway 30초로 합시다')
  expect(JSON.stringify(turns)).not.toContain('SECRET')
})

test('lib: excerpt keeps hit turns and their neighbours within the cap', () => {
  const turns = Array.from({ length: 400 }, (_, i) => ({ n: i + 1, user: (i === 30 ? 'jwt 만료 ' : '') + 'x'.repeat(2000), assistant: 'y'.repeat(2000) }))
  const text = excerpt(turns, ['jwt'], 50_000)
  expect(text.length).toBeLessThanOrEqual(50_000)
  expect(text).toContain('[턴 31]\n사용자: jwt 만료')
  expect(text).toContain('턴 생략')
  const near = text.split('[턴 31]')[1]?.split('[턴 32]')[0] ?? ''
  expect(near.length).toBeGreaterThan(1000)

  const none = excerpt(turns, ['없음'], 50_000)
  expect(none.length).toBeLessThanOrEqual(50_000)
  expect(none).toContain('[턴 400]')

  const small = excerpt(turns.slice(0, 3), ['jwt'], 50_000)
  expect(small).not.toContain('…')
})

test('lib: args, out-of-range spans and the injection text', () => {
  expect(parseArgs('--all 토큰 문제')).toEqual({ all: true, query: '토큰 문제' })
  expect(parseArgs('토큰 --allx')).toEqual({ all: false, query: '토큰 --allx' })
  const cards = toCards(`결과:\n${SPANS}`, { path: A, sessionId: 'aaa', mtimeMs: Date.parse('2026-04-12') }, 't', 2)
  expect(cards.map(c => c.id)).toEqual(['aaa:1-2'])
  expect(injection(cards)).toContain('- 미해결 항목: 없음')
  expect(toCards('not json', { path: A, sessionId: 'aaa', mtimeMs: 0 }, 't', 2)).toEqual([])
})
