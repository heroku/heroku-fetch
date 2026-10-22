import {describe, expect, it} from 'vitest'

import {getUserAgentComment} from './browser-environment-defaults.js'

describe('getUserAgentComment (browser)', () => {
  it('is empty, so a browser User-Agent degrades to the bare product token', () => {
    expect(getUserAgentComment()).toBe('')
  })
})
