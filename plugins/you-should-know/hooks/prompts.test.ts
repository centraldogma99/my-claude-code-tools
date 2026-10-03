import { test, expect } from 'claude-code/testing'
import { proposePrompt, explainPrompt } from './register'

const RULE = 'Write everything the human reads in Korean'

test('제안 프롬프트: 한국어 지시가 붙고 파서용 라벨은 영어로 유지', () => {
  const p = proposePrompt([], [])
  expect(p).toContain(RULE)
  expect(p.trimEnd().endsWith('keep code, commands and file names as they are.')).toBe(true)
  expect(p).toContain('learn: none')
  expect(p).toContain('tag: <You should know or Heads up>')
})

test('설명 프롬프트: 첫 설명과 다시 쓰기 둘 다 한국어 지시 포함', () => {
  expect(explainPrompt('주제', undefined)).toContain(RULE)
  expect(explainPrompt('주제', { direction: 'first', previous: '이전 설명' })).toContain(RULE)
})
