import {describe, expect, it} from 'vitest'

import {formatUserAgent} from './user-agent.js'

describe('formatUserAgent', () => {
  it('appends the environment comment after the product token (Node build)', () => {
    expect(formatUserAgent({name: 'heroku-cli', version: '11.4.0'}, '(darwin; arm64) Node.js/22.21.0')).toBe('heroku-cli/11.4.0 (darwin; arm64) Node.js/22.21.0')
  })

  it('degrades to the bare product token when the comment is empty (browser build)', () => {
    expect(formatUserAgent({name: 'heroku-cli', version: '11.4.0'}, '')).toBe('heroku-cli/11.4.0')
  })
})
