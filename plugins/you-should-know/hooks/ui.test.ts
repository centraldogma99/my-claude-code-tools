import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.now()
const offer = { kind: 'offer', line: 'fnm에는 node 24만 설치돼 있어요.', explanation: '**fnm 버전**\n설명', shownAt: NOW }
const explained = { kind: 'explained', line: offer.line, text: '**fnm 버전**\n설명 본문', iteration: 0, shownAt: NOW }

function world(on: On, view: object) {
  mock.store(on, { sessions: [{ id: 'me', tag: 'Heads up', offeredTurn: 't1', view }] })
  mock.env(on, {})
  on('session.id', () => ({ value: 'me' }))
  on('session.surfaces', () => ({ value: ['terminal'] }) as never)
}

const BAND = { plugin: 'you-should-know', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 30, columns: 120, bodyColumns: 116 } } as never

const labels = async (ui: { findAll: (q: object) => Promise<{ text?: string }[]> }) =>
  (await ui.findAll({ type: 'Button' })).map((b) => b.text)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: 제안 카드의 태그와 선택지가 한글`, async ($, on) => {
    world(on, offer)
    const ui = await $.ui.mount({ ...(BAND as object), surface } as never)
    const all = JSON.stringify(await labels(ui))
    for (const l of ['자세히 보기', '이미 알아요', '닫기']) expect(all).toContain(l)
    expect(all).not.toMatch(/Learn more|Knew this|Dismiss/)
    expect(await ui.find({ type: 'Text', text: /주의/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Heads up/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`${surface}: 설명 카드의 선택지가 한글`, async ($, on) => {
    world(on, explained)
    const ui = await $.ui.mount({ ...(BAND as object), surface } as never)
    const all = JSON.stringify(await labels(ui))
    for (const l of ['이해했어요', '메인 세션에서 이어 묻기', '닫기']) expect(all).toContain(l)
    expect(all).not.toMatch(/Understood|Chat in main|Dismiss/)
    await ui.unmount()
  })
}
