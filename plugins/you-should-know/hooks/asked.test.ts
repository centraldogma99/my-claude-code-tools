import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.now()
const LINE = 'fnm에는 node 24만 설치돼 있어요.'
const askedAfterExplain = { kind: 'asked', line: LINE, iteration: 1, text: '**fnm 버전**\n어려운 설명', shownAt: NOW }
const askedAfterOffer = { kind: 'asked', line: LINE, shownAt: NOW }

function world(on: On, view: object, prompts: string[]) {
  mock.store(on, { sessions: [{ id: 'me', tag: 'Heads up', offeredTurn: 't1', view }] })
  mock.env(on, {})
  on('session.id', () => ({ value: 'me' }))
  on('session.surfaces', () => ({ value: ['terminal'] }) as never)
  on('model.fork', (_$, e) => {
    prompts.push(e.prompt)
    return { value: { isAnswered: true, text: '**쉬운 설명**\n본문', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } } as never
  })
}

const BAND = { plugin: 'you-should-know', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 30, columns: 120, bodyColumns: 116 } } as never

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: 설명 뒤 '이해가 안 돼요'는 이전 설명을 더 쉬운 말로 다시 쓴다`, async ($, on) => {
    const prompts: string[] = []
    world(on, askedAfterExplain, prompts)
    const ui = await $.ui.mount({ ...(BAND as object), surface } as never)
    const buttons = await ui.findAll({ type: 'Button' })
    const labels = JSON.stringify(buttons.map((b) => b.text))
    expect(labels).toContain('이해가 안 돼요')
    expect(labels).not.toContain('관련 없어요')
    const btn = buttons.find((b) => b.text?.includes('이해가 안 돼요'))!
    await ui.press({ key: btn.key! })
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('in simpler words')
    expect(prompts[0]).toContain('어려운 설명')
    expect((await ui.find({ type: 'Markdown' }))?.props).toMatchObject({ text: expect.stringContaining('쉬운 설명') })
    await ui.unmount()
  })

  test(`${surface}: 제안만 보고 '이해하지 못했어요'는 첫 설명을 띄우고 '관련 없어요'는 없다`, async ($, on) => {
    const prompts: string[] = []
    world(on, askedAfterOffer, prompts)
    const ui = await $.ui.mount({ ...(BAND as object), surface } as never)
    const buttons = await ui.findAll({ type: 'Button' })
    const labels = JSON.stringify(buttons.map((b) => b.text))
    expect(labels).toContain('이해하지 못했어요')
    expect(labels).not.toContain('관련 없어요')
    const btn = buttons.find((b) => b.text?.includes('이해하지 못했어요'))!
    await ui.press({ key: btn.key! })
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).not.toContain('You already showed them this')
    expect((await ui.find({ type: 'Markdown' }))?.props).toMatchObject({ text: expect.stringContaining('쉬운 설명') })
    await ui.unmount()
  })
}
