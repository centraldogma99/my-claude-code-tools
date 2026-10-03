import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Card, View } from '../types'
import {
  COUNT_SH,
  EXPAND_PROMPT,
  INDEX_SH,
  READ_SH,
  EXTRACT_PROMPT,
  RANK_PROMPT,
  excerpt,
  injection,
  parseArgs,
  parseCounts,
  parseIndex,
  parseJson,
  parseTurns,
  projectDirName,
  sessionIdOf,
  terms,
  toCards,
} from './lib'
import type { Session } from './lib'

const PANE = 'recall'
const EMPTY: View = { query: '', status: '', cards: [], selected: [], isRecent: false }
const view = atom({ plugin: 'recall', key: 'view' } as const, EMPTY)

const MAX_SESSIONS = 3
const CHAR_CAP = 50_000
// ponytail: newest 500 sessions only; past that the grep and the ranking index grow without bound
const MAX_SCANNED = 500
const RECENT = 10

type $ = EngineInterface
let searchId = 0

async function listSessions($: $, all: boolean): Promise<Session[]> {
  const home = await $.env.get('HOME')
  const root = `${home}/.claude/projects`
  const me = await $.session.id()
  let sessions: Session[]
  if (all) {
    const found = await $.process.run(['find', root, '-maxdepth', '2', '-name', '*.jsonl', '-mtime', '-90'])
    const paths = found.stdout.split('\n').filter(Boolean)
    sessions = await Promise.all(
      paths.map(async path => ({ path, sessionId: sessionIdOf(path), mtimeMs: (await $.fs.stat(path)).mtimeMs })),
    )
  } else {
    const dir = `${root}/${projectDirName(await $.session.cwd())}`
    const entries = await $.fs.list(dir).catch(() => [])
    sessions = entries
      .filter(f => f.kind === 'file' && f.name.endsWith('.jsonl'))
      .map(f => ({ path: `${dir}/${f.name}`, sessionId: sessionIdOf(f.name), mtimeMs: f.mtimeMs }))
  }
  return sessions
    .filter(s => s.sessionId !== me)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_SCANNED)
}

const sh = ($: $, script: string, args: string[]) =>
  $.process.run(['sh', '-c', script, 'sh', ...args], { timeoutMs: 60_000 })

async function extract($: $, s: Session, title: string, query: string, ts: string[]): Promise<Card[]> {
  const key = `${s.sessionId}:${s.mtimeMs}:${query}`
  const cache = ((await $.store.get('cache')) ?? {}) as Record<string, Card[]>
  if (cache[key]) return cache[key]

  const turns = parseTurns((await sh($, READ_SH, [s.path])).stdout)
  if (turns.length === 0) return []
  const r = await $.model.complete({
    model: 'sonnet',
    prompt: EXTRACT_PROMPT(query, excerpt(turns, ts, CHAR_CAP)),
    maxTokens: 4000,
    timeoutMs: 180_000,
  })
  if (!r.isAnswered) return []
  const cards = toCards(r.text, s, title || (turns[0]?.user ?? '').slice(0, 40), turns.length)

  const latest = ((await $.store.get('cache')) ?? {}) as Record<string, Card[]>
  await $.store.set('cache', Object.fromEntries([...Object.entries(latest), [key, cards]].slice(-30)))
  return cards
}

async function search($: $, query: string, all: boolean, id: number) {
  const isCurrent = () => id === searchId
  const set = (fn: (v: View) => View) => (isCurrent() ? update($, view, fn) : Promise.resolve())
  const status = (text: string) => set(v => ({ ...v, status: text }))

  const sessions = await listSessions($, all)
  if (sessions.length === 0) return status('검색할 이전 세션이 없습니다.')
  const paths = sessions.map(s => s.path)

  await status('검색어 넓히는 중…')
  const expanded = await $.model.complete({ model: 'haiku', prompt: EXPAND_PROMPT(query), effort: 'low', timeoutMs: 30_000 })
  const extra = expanded.isAnswered ? (parseJson<string[]>(expanded.text) ?? []) : []
  const ts = terms([query, ...extra.filter(t => typeof t === 'string')].join(' '))

  await status('세션 찾는 중…')
  const [counted, indexed] = await Promise.all([
    sh($, COUNT_SH, [...ts.flatMap(t => ['-e', t]), '--', ...paths]),
    sh($, INDEX_SH, paths),
  ])
  const counts = parseCounts(counted.stdout)
  const index = parseIndex(indexed.stdout)
  const byHits = [...sessions].sort((a, b) => (counts.get(b.path) ?? 0) - (counts.get(a.path) ?? 0))
  const lines = byHits.slice(0, 150).map(s => {
    const e = index.get(s.path)
    const date = new Date(s.mtimeMs).toISOString().slice(0, 10)
    return `${s.sessionId} | ${date} | ${e?.title ?? ''} | ${counts.get(s.path) ?? 0} | ${(e?.prompts ?? []).join(' / ')}`
  })

  const ranked = await $.model.complete({ model: 'sonnet', prompt: RANK_PROMPT(query, lines.join('\n')), timeoutMs: 90_000 })
  const ids = ranked.isAnswered ? parseJson<string[]>(ranked.text) : undefined
  const picks = Array.isArray(ids)
    ? ids.flatMap(i => sessions.filter(s => s.sessionId === i)).slice(0, MAX_SESSIONS)
    : byHits.filter(s => counts.has(s.path)).slice(0, MAX_SESSIONS)
  if (picks.length === 0) return status('관련 세션을 찾지 못했습니다.')

  let done = 0
  await status(`관련 구간 요약 중 (0/${picks.length})`)
  const results = await Promise.all(
    picks.map(async s => {
      const cards = await extract($, s, index.get(s.path)?.title ?? '', query, ts).catch(() => [])
      done += 1
      await set(v => ({ ...v, status: `관련 구간 요약 중 (${done}/${picks.length})`, cards: [...v.cards, ...cards] }))
      return cards
    }),
  )
  const total = results.flat().length
  await status(total ? `카드 ${total}개` : '관련 구간을 찾지 못했습니다.')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'recall',
      description: '과거 세션에서 관련 구간을 찾아 요약 카드로 보여 줌 (--all: 전체 프로젝트 90일)',
      argumentHint: '[--all] [질문]',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'recall' }, async ($, e) => {
    const { all, query } = parseArgs(e.args)
    const id = ++searchId
    await $.ui.open({ id: PANE, title: 'recall' })

    if (!query) {
      const recent = ((await $.store.get('recent')) ?? []) as Card[]
      const status = recent.length ? '' : '최근 주입한 항목이 없습니다. /recall <질문>으로 검색하세요.'
      await update($, view, () => ({ ...EMPTY, status, cards: recent, isRecent: true }))
      return {}
    }

    await update($, view, () => ({ ...EMPTY, query, status: '검색 중…' }))
    $.clock.after(0, () => {
      search($, query, all, id).catch(err => {
        if (id === searchId) void update($, view, v => ({ ...v, status: `검색 실패: ${String(err).slice(0, 200)}` }))
      })
    })
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const v = await read($, view)

    const toggle = (id: string) =>
      update($, view, x => ({
        ...x,
        selected: x.selected.includes(id) ? x.selected.filter(s => s !== id) : [...x.selected, id],
      }))

    const inject = async () => {
      const cur = await read($, view)
      const picked = cur.cards.filter(c => cur.selected.includes(c.id))
      if (picked.length === 0) return
      const appended = await $.session
        .append({ message: { type: 'user', content: [{ type: 'text', text: injection(picked) }] } })
        .catch((err: unknown) => ({ deny: String(err) }))
      if ('deny' in appended && appended.deny) return $.ui.toast(`주입 실패: ${appended.deny}`)
      await update($, view, x => ({ ...x, selected: x.selected.filter(id => !picked.some(c => c.id === id)) }))
      const recent = ((await $.store.get('recent')) ?? []) as Card[]
      await $.store.set('recent', [...picked, ...recent.filter(r => !picked.some(c => c.id === r.id))].slice(0, RECENT))
      $.ui.log(`recall: 이전 세션 ${picked.length}건을 주입했습니다 · ${picked.map(c => `${c.title} (턴 ${c.from}–${c.to})`).join(', ')}`)
      await $.ui.close({ id: PANE })
    }

    return (
      <Box flexDirection="column">
        <Text bold color="claude">{v.isRecent ? '최근 주입한 항목' : `recall: ${v.query}`}</Text>
        {v.status !== '' && <Text dimColor italic>{v.status}</Text>}
        {v.cards.map(c => {
          const isOn = v.selected.includes(c.id)
          return (
            <Box key={`card-${c.id}`} flexDirection="column" marginTop={1}>
              <Box flexDirection="row" gap={1}>
                <Button key={`pick-${c.id}`} plain label={isOn ? '[x]' : '[ ]'} onPress={() => void toggle(c.id)} />
                <Text bold {...(isOn ? { color: 'success' } : {})} wrap="truncate-end">
                  {c.title}
                </Text>
              </Box>
              <Box flexDirection="column" paddingLeft={4}>
                <Text dimColor>{`${c.date} · 턴 ${c.from}–${c.to}`}</Text>
                <Text wrap="wrap">{c.summary}</Text>
              </Box>
            </Box>
          )
        })}
        <Box flexDirection="row" gap={1} marginTop={1}>
          {v.cards.length > 0 && (
            <Button key="inject" variant="primary" label={`선택 항목 주입 (${v.selected.length})`} onPress={() => void inject()} />
          )}
          <Button key="close" role="dismiss" label="닫기" onPress={() => void $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
