import { expect, test } from 'claude-code/testing'
import { commonPrefix, pathToken } from './register'

// fs.list can't be mocked in this kit (it refuses array results), so listing
// and the band are covered by the live tmux check; parsing is covered here.
test('pathToken: only ~/ tokens ending at the cursor', () => {
  expect(pathToken('see ~/open-source/pl', 20)).toEqual({ dir: 'open-source/', prefix: 'pl' })
  expect(pathToken('~/', 2)).toEqual({ dir: '', prefix: '' })
  expect(pathToken('a~/x', 4)).toBe(null)
  expect(pathToken('./src/a', 7)).toBe(null)
  expect(pathToken('/usr/lo', 7)).toBe(null)
  expect(pathToken('~/a b', 5)).toBe(null)
  expect(pathToken('~/a/b tail', 5)).toEqual({ dir: 'a/', prefix: 'b' })
})

test('commonPrefix: what ctrl+f fills', () => {
  expect(commonPrefix(['planet/', 'plannotator/'])).toBe('plan')
  expect(commonPrefix(['plannotator/'])).toBe('plannotator/')
  expect(commonPrefix(['ccusage/', 'claude/'])).toBe('c')
  expect(commonPrefix([])).toBe('')
})
