import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest'

import {getDefaultDispatcher, getDefaultTokenProvider} from './node-environment-defaults.js'

describe('getDefaultTokenProvider', () => {
  const originalApiKey = process.env.HEROKU_API_KEY

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.HEROKU_API_KEY
    else process.env.HEROKU_API_KEY = originalApiKey
  })

  it('returns the HEROKU_API_KEY env var', async () => {
    process.env.HEROKU_API_KEY = 'env-token'
    const provider = getDefaultTokenProvider() as () => string
    expect(await provider()).toBe('env-token')
  })

  it('throws when HEROKU_API_KEY is not set', async () => {
    delete process.env.HEROKU_API_KEY
    const provider = getDefaultTokenProvider() as () => string
    expect(() => provider()).toThrow(/No authentication token found/)
  })
})

describe('getDefaultDispatcher', () => {
  const PROXY_VARS = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy']
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const name of PROXY_VARS) {
      saved[name] = process.env[name]
      delete process.env[name]
    }
  })

  afterEach(() => {
    for (const name of PROXY_VARS) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  })

  it('returns undefined when no proxy env var is set', async () => {
    expect(await getDefaultDispatcher()).toBeUndefined()
  })

  it.each(PROXY_VARS)('returns a dispatcher when %s is set', async name => {
    process.env[name] = 'http://proxy.example.com:8080'
    const dispatcher = await getDefaultDispatcher()
    expect(dispatcher).toBeDefined()
  })
})
