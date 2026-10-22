import {describe, expect, it} from 'vitest'

import {getUserAgentComment} from './browser-environment-defaults.js'

describe('getUserAgentComment (browser)', () => {
  it('is undefined, so the browser build sends no managed User-Agent', () => {
    // Browser opts out entirely (a fetch-set User-Agent isn't CORS-safelisted);
    // resolveUserAgentHeader treats an undefined comment as "set no header".
    expect(getUserAgentComment()).toBeUndefined()
  })
})
