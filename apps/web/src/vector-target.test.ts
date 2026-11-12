import { expect, it } from 'vitest'
import { defaultLocalIndex } from './vector-store-api'

it('an unrelated alphabetically earlier index cannot silently change the default collection', () => {
  expect(defaultLocalIndex([{ name: 'guide-user-index', compatible: true }, { name: 'local-e5', compatible: true }])).toBe('local-e5')
  expect(defaultLocalIndex([{ name: 'local-e5', compatible: false }, { name: 'custom', compatible: true }])).toBe('custom')
  expect(defaultLocalIndex([])).toBe('')
})
