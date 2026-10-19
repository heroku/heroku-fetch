import {describe, expect, it} from 'vitest'

import {RequestIdStore} from './request-id.js'

/** A deterministic generator yielding id-0, id-1, … */
function sequentialGenerator(): () => string {
  let n = 0
  return () => `id-${n++}`
}

describe('RequestIdStore', () => {
  it('create() prepends a new id and returns the accumulated list', () => {
    const store = new RequestIdStore(sequentialGenerator())
    expect(store.create()).toEqual(['id-0'])
    expect(store.create()).toEqual(['id-1', 'id-0'])
  })

  it('headerValue joins the ids with a comma and no space', () => {
    const store = new RequestIdStore(sequentialGenerator())
    store.create()
    store.create()
    expect(store.headerValue).toBe('id-1,id-0')
  })

  it('track() prepends only ids not already present (dedupe)', () => {
    const store = new RequestIdStore(sequentialGenerator())
    store.create() // id-0
    store.track('server-a', 'id-0', 'server-b')
    // id-0 is dropped as a duplicate; the two novel ids are prepended in order.
    expect(store.headerValue).toBe('server-a,server-b,id-0')
  })

  it('empty() resets the accumulated list', () => {
    const store = new RequestIdStore(sequentialGenerator())
    store.create()
    store.empty()
    expect(store.headerValue).toBe('')
  })

  describe('nextHeaderValue', () => {
    it('accumulates ids across calls and returns the joined string', () => {
      const store = new RequestIdStore(sequentialGenerator())
      expect(store.nextHeaderValue()).toBe('id-0')
      expect(store.nextHeaderValue()).toBe('id-1,id-0')
      expect(store.nextHeaderValue()).toBe('id-2,id-1,id-0')
    })

    it('resets to a single fresh id when the header would exceed 7KB', () => {
      // Each id is 4000 bytes, so the second accumulation (~8001 bytes) trips
      // the 7168-byte cap and resets to just the newest id.
      let n = 0
      const store = new RequestIdStore(() => `${String(n++).padStart(4, '0')}${'x'.repeat(3996)}`)

      const first = store.nextHeaderValue()
      expect(first).toHaveLength(4000) // '0000xxx…'

      const second = store.nextHeaderValue()
      // Reset happened: a single id, not two comma-joined ones.
      expect(second).toHaveLength(4000)
      expect(second).not.toContain(',')
      // It is a fresh id (the third generated: 0,1 were used, reset re-created with 2).
      expect(second.startsWith('0002')).toBe(true)
    })

    it('measures the cap in bytes, not characters', () => {
      // A 2-byte-per-char string: 3600 chars = 7200 bytes > 7168, so a single
      // id already overflows and is kept (reset then re-created, still one id).
      const store = new RequestIdStore(() => '✓'.repeat(3600))
      const value = store.nextHeaderValue()
      expect(value).not.toContain(',')
      expect(new TextEncoder().encode(value).length).toBeGreaterThan(7168)
    })
  })
})
