import type { Card } from '../types'

export type Turn = { n: number; user: string; assistant: string }
export type Session = { path: string; sessionId: string; mtimeMs: number }
export type IndexEntry = { title: string; prompts: string[] }

// Shell pipelines over session JSONL: conversation rows only (no tool I/O, thinking or meta rows).
const CONVERSATION = `grep -e '"type":"user"' -e '"type":"assistant"' | grep -v -e '"tool_result"' -e '"type":"tool_use"' -e '"type":"thinking"' -e '"isMeta":true'`
export const COUNT_SH = `grep -i -F -H "$@" 2>/dev/null | ${CONVERSATION} | cut -d: -f1 | sort | uniq -c`
export const INDEX_SH = `grep -H -e '"type":"ai-title"' -e '"type":"user","message":{"role":"user","content":"' "$@" 2>/dev/null | grep -v '"isMeta":true' | cut -c1-800`
export const READ_SH = `cat "$1" | ${CONVERSATION}`

// ~/.claude/projects/<dir>: the session's cwd with every non-alphanumeric as '-'
export const projectDirName = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-')

export const sessionIdOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.jsonl$/, '')

export function parseArgs(args: string): { all: boolean; query: string } {
  const all = /(^|\s)--all(\s|$)/.test(args)
  return { all, query: args.replace(/(^|\s)--all(?=\s|$)/g, ' ').trim() }
}

export function terms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\s+/).filter(t => t.length >= 2))]
}

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.filter(b => b?.type === 'text').map(b => b.text).join('\n')
      : ''

const isToolResult = (content: unknown) =>
  Array.isArray(content) && content.some(b => b?.type === 'tool_result')

// Prompt + reply pairs, tool results, meta rows, command echoes ('<command-name>…') and subagent rows left out.
export function parseTurns(jsonl: string): Turn[] {
  const turns: Turn[] = []
  for (const line of jsonl.split('\n')) {
    let o: any
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    if (o.isSidechain || o.isMeta || !o.message) continue
    const content = o.message.content
    if (o.type === 'user') {
      if (isToolResult(content)) continue
      const text = textOf(content).trim()
      if (!text || text.startsWith('<') || text.startsWith('[Request interrupted')) continue
      turns.push({ n: turns.length + 1, user: text, assistant: '' })
    } else if (o.type === 'assistant') {
      const last = turns.at(-1)
      const text = textOf(content).trim()
      if (last && text) last.assistant += (last.assistant ? '\n' : '') + text
    }
  }
  return turns
}

// A JSON string field from a line `cut` may have truncated: the value up to the cut.
function field(line: string, name: string): string | undefined {
  const m = line.match(new RegExp(`"${name}":"((?:[^"\\\\]|\\\\.)*)`))
  if (m?.[1] === undefined) return undefined
  try {
    return JSON.parse(`"${m[1].replace(/\\u?[0-9a-fA-F]{0,3}$|\\$/, '')}"`)
  } catch {
    return undefined
  }
}

// `grep -H` output of ai-title and typed-prompt lines → per-file title and first prompts.
export function parseIndex(stdout: string): Map<string, IndexEntry> {
  const index = new Map<string, IndexEntry>()
  for (const line of stdout.split('\n')) {
    const cut = line.indexOf('.jsonl:')
    if (cut < 0) continue
    const path = line.slice(0, cut + 6)
    const rest = line.slice(cut + 7)
    const entry = index.get(path) ?? { title: '', prompts: [] }
    index.set(path, entry)
    const title = field(rest, 'aiTitle')
    if (title !== undefined) {
      entry.title = title
      continue
    }
    const prompt = field(rest, 'content')?.trim()
    if (prompt && !prompt.startsWith('<') && entry.prompts.length < 6) entry.prompts.push(prompt.slice(0, 100))
  }
  return index
}

// `grep | cut | sort | uniq -c` output → per-file count of matching conversation lines.
export function parseCounts(stdout: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(.+)$/)
    if (m?.[1] && m[2]) counts.set(m[2], Number(m[1]))
  }
  return counts
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)
const render = (t: Turn, n: number) => `[턴 ${t.n}]\n사용자: ${clip(t.user, n)}\n어시스턴트: ${clip(t.assistant, n)}`

// The turns as model input within `cap` characters: turns that hit a term (±2 around them)
// keep the most text, the rest shrink first and drop out last.
export function excerpt(turns: Turn[], ts: string[], cap: number): string {
  const hits = turns.flatMap((t, i) =>
    ts.some(term => `${t.user}\n${t.assistant}`.toLowerCase().includes(term)) ? [i] : [],
  )
  const near = new Set(hits.flatMap(i => [i - 2, i - 1, i, i + 1, i + 2]))
  const steps: [number, number][] = [
    [Infinity, Infinity],
    [1500, 300],
    [1500, 120],
    [1500, 60],
    [1500, 0],
    [600, 0],
    [250, 0],
  ]
  let text = ''
  for (const [nearLimit, farLimit] of steps) {
    const parts: string[] = []
    let skipped = 0
    turns.forEach((t, i) => {
      const n = hits.length === 0 ? Math.max(farLimit, 25) : near.has(i) ? nearLimit : farLimit
      if (n === 0) return void skipped++
      if (skipped) parts.push(`… (${skipped}턴 생략)`)
      skipped = 0
      parts.push(render(t, n))
    })
    if (skipped) parts.push(`… (${skipped}턴 생략)`)
    text = parts.join('\n\n')
    if (text.length <= cap) return text
  }
  return text.slice(0, cap)
}

// The first JSON array or object in a model reply (it may wrap it in prose or a fence).
export function parseJson<T>(text: string): T | undefined {
  const start = text.search(/[[{]/)
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'))
  if (start < 0 || end < start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
}

type Span = { from: number; to: number; summary: string; decisions?: string[]; files?: string[]; open?: string[] }

export function toCards(reply: string, s: Session, title: string, turnCount: number): Card[] {
  const spans = parseJson<Span[]>(reply)
  if (!Array.isArray(spans)) return []
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
  return spans
    .filter(sp => Number.isInteger(sp.from) && Number.isInteger(sp.to) && sp.from >= 1 && sp.to >= sp.from && sp.to <= turnCount && sp.summary)
    .map(sp => ({
      id: `${s.sessionId}:${sp.from}-${sp.to}`,
      sessionId: s.sessionId,
      path: s.path,
      date: new Date(s.mtimeMs).toISOString().slice(0, 10),
      title,
      from: sp.from,
      to: sp.to,
      summary: String(sp.summary),
      decisions: list(sp.decisions),
      files: list(sp.files),
      open: list(sp.open),
    }))
}

const bullets = (label: string, items: string[]) => `- ${label}: ${items.length ? items.join('; ') : '없음'}`

export function injection(cards: Card[]): string {
  return cards
    .map(c =>
      [
        `참고: 이전 세션 요약 (${c.date}, "${c.title}" 턴 ${c.from}–${c.to})`,
        c.summary,
        bullets('결정 사항', c.decisions),
        bullets('바뀐 파일', c.files),
        bullets('미해결 항목', c.open),
        `원문: ${c.path} (세부가 필요하면 이 파일의 해당 턴을 읽을 것)`,
      ].join('\n'),
    )
    .join('\n\n')
}

export const EXPAND_PROMPT = (query: string) =>
  `과거 개발 세션 기록을 문자열 검색하려 한다. 아래 질문에 대해, 그 대화에 실제로 등장했을 법한 검색어를 최대 10개 만들어라.
동의어, 영어/한국어 표기, 관련 식별자(에러 코드, 라이브러리명, 함수명)를 포함한다. 각 검색어는 1~3단어.
JSON 문자열 배열만 출력한다.

질문: ${query}`

export const RANK_PROMPT = (query: string, index: string) =>
  `아래는 과거 Claude Code 세션 목록이다. 각 줄: id | 날짜 | 제목 | 검색어 일치 수 | 사용자 프롬프트 일부.
질문과 가장 관련 있는 세션을 최대 3개 골라 관련도 순으로 id의 JSON 배열만 출력한다. 관련 세션이 없으면 [].

질문: ${query}

${index}`

export const EXTRACT_PROMPT = (query: string, transcript: string) =>
  `아래는 과거 Claude Code 세션의 대화다(도구 결과 제외, 턴 번호 표시). 질문과 관련된 구간을 찾아라.
구간은 연속된 턴 묶음이며 여러 턴에 걸칠 수 있다. 서로 다른 주제면 구간을 나눈다. 관련 없으면 [].
각 구간을 JSON 객체로, 전체를 JSON 배열로만 출력한다:
{"from": 시작 턴, "to": 끝 턴, "summary": "카드에 보일 한두 줄 요약", "decisions": ["결정 사항"], "files": ["바뀐 파일 경로"], "open": ["미해결 항목"]}
한국어로 쓴다. 대화에 없는 내용은 지어내지 않는다.

질문: ${query}

${transcript}`
