import {describe, expect, it} from 'vitest'

import {formatUserAgent, resolveUserAgentHeader} from './user-agent.js'

describe('formatUserAgent', () => {
  it('appends the environment comment after the product token (Node build)', () => {
    expect(formatUserAgent({name: 'heroku-cli', version: '11.4.0'}, '(darwin; arm64) Node.js/22.21.0')).toBe('heroku-cli/11.4.0 (darwin; arm64) Node.js/22.21.0')
  })

  it('degrades to the bare product token when the comment is empty', () => {
    expect(formatUserAgent({name: 'heroku-cli', version: '11.4.0'}, '')).toBe('heroku-cli/11.4.0')
  })
})

describe('resolveUserAgentHeader', () => {
  it('formats the header when name and version are both present', () => {
    expect(resolveUserAgentHeader({name: 'heroku-cli', version: '11.4.0'}, '(darwin; arm64) Node.js/22.21.0')).toBe('heroku-cli/11.4.0 (darwin; arm64) Node.js/22.21.0')
  })

  it('returns undefined when the option is absent', () => {
    expect(resolveUserAgentHeader(undefined, '(darwin; arm64) Node.js/22.21.0')).toBeUndefined()
  })

  it('returns undefined when name or version is empty (avoids a malformed token)', () => {
    expect(resolveUserAgentHeader({name: 'heroku-cli', version: ''}, '(darwin; arm64) Node.js/22.21.0')).toBeUndefined()
    expect(resolveUserAgentHeader({name: '', version: '11.4.0'}, '(darwin; arm64) Node.js/22.21.0')).toBeUndefined()
  })

  it('returns undefined when the comment is undefined (browser opts out), even with a complete option', () => {
    // A browser `getUserAgentComment()` returns undefined; typed through a
    // variable to avoid a bare `undefined` literal argument.
    const browserComment: string | undefined = undefined
    expect(resolveUserAgentHeader({name: 'heroku-cli', version: '11.4.0'}, browserComment)).toBeUndefined()
  })
})
