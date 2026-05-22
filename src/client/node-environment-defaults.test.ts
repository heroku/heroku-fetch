import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest'

import {getDefaultDispatcher} from './node-environment-defaults.js'

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
