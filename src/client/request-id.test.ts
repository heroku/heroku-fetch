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

    it('drops the oldest ids (keeping the newest) when the header would exceed 7KB', () => {
      // Each id is 4000 bytes, so the second accumulation (~8001 bytes) trips
      // the 7168-byte cap; the oldest id is dropped to make it fit, leaving the
      // newest one rather than resetting to a brand-new id.
      let n = 0
      const store = new RequestIdStore(() => `${String(n++).padStart(4, '0')}${'x'.repeat(3996)}`)

      const first = store.nextHeaderValue()
      expect(first).toHaveLength(4000) // '0000xxx…'

      const second = store.nextHeaderValue()
      // Truncated to fit: a single id, not two comma-joined ones.
      expect(second).toHaveLength(4000)
      expect(second).not.toContain(',')
      // It is the newest id kept (the second generated), not a fresh reset — the
      // just-created id is retained and the older '0000…' is dropped.
      expect(second.startsWith('0001')).toBe(true)
    })

    it('keeps the most recent ids that still fit under the cap', () => {
      // Ids are ~2867 bytes; two fit (~5735 < 7168) but three don't (~8603),
      // so the chain settles at the two newest, dropping the oldest.
      let n = 0
      const store = new RequestIdStore(() => `${String(n++).padStart(4, '0')}${'y'.repeat(2863)}`)

      store.nextHeaderValue() // 0000
      store.nextHeaderValue() // 0001,0000
      const third = store.nextHeaderValue()

      const ids = third.split(',')
      expect(ids).toHaveLength(2)
      // Newest-first: the fresh id leads, the immediately-prior one follows; the
      // oldest ('0000…') is evicted.
      expect(ids[0].startsWith('0002')).toBe(true)
      expect(ids[1].startsWith('0001')).toBe(true)
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
