import {createServer, type Server} from 'node:http'
import {type AddressInfo} from 'node:net'
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest'

import {
  getDefaultDispatcher, getDefaultFetch, getDefaultTokenProvider, getUserAgentComment,
} from './node-environment-defaults.js'

describe('getDefaultTokenProvider', () => {
  const originalApiKey = process.env.HEROKU_API_KEY

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.HEROKU_API_KEY
    else process.env.HEROKU_API_KEY = originalApiKey
  })

  it('returns the HEROKU_API_KEY env var', async () => {
    process.env.HEROKU_API_KEY = 'env-token'
    const provider = getDefaultTokenProvider() as () => string | undefined
    expect(await provider()).toBe('env-token')
  })

  it('returns undefined (no throw) when HEROKU_API_KEY is not set', async () => {
    delete process.env.HEROKU_API_KEY
    const provider = getDefaultTokenProvider() as () => string | undefined
    expect(provider()).toBeUndefined()
  })
})

describe('getUserAgentComment', () => {
  it('reports the running platform, arch, and Node version', () => {
    expect(getUserAgentComment()).toBe(`(${process.platform}; ${process.arch}) Node.js/${process.versions.node}`)
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

describe('getDefaultFetch', () => {
  // These drive a REAL request end-to-end (not a stubbed fetch) because the
  // bug this guards against — handing an npm-undici dispatcher to Node's
  // built-in global fetch, which throws `invalid onRequestStart method` — only
  // reproduces when a request is actually made.
  const PROXY_VARS = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy']
  const saved: Record<string, string | undefined> = {}
  let server: Server
  let serverUrl: string
  let received: {
    body: string;
    headers?: Record<string, string | string[] | undefined>;
    method?: string;
    url?: string;
  }

  beforeEach(async () => {
    for (const name of PROXY_VARS) {
      saved[name] = process.env[name]
      delete process.env[name]
    }

    received = {body: ''}
    // Doubles as both an origin server and a forward proxy: a plain-HTTP
    // forward proxy receives the absolute request URL in `req.url`, which is
    // exactly what we assert to prove the request was proxied.
    server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', chunk => {
        chunks.push(chunk as Buffer)
      })
      request.on('end', () => {
        received = {
          body: Buffer.concat(chunks).toString(),
          headers: request.headers,
          method: request.method,
          url: request.url,
        }
        response.writeHead(200, {'content-type': 'application/json'})
        response.end(JSON.stringify({ok: true}))
      })
    })
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const {port} = server.address() as AddressInfo
    serverUrl = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    for (const name of PROXY_VARS) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }

    await new Promise<void>(resolve => {
      server.close(() => resolve())
    })
  })

  it('returns a working fetch (global, no dispatcher) when no proxy is set', async () => {
    const fetchImpl = await getDefaultFetch()
    const response = await fetchImpl(`${serverUrl}/apps`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ok: true})
    expect(received.url).toBe('/apps')
  })

  it('drives a real request through the proxy dispatcher when a proxy is set (cross-undici regression)', async () => {
    process.env.HTTP_PROXY = serverUrl
    const fetchImpl = await getDefaultFetch()

    const response = await fetchImpl('http://api.heroku.example/account', {
      headers: {authorization: 'Bearer abc123', 'request-id': 'req-1'},
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ok: true})
    // A proxied plain-HTTP request carries the absolute URL — proof it went
    // through the proxy rather than straight to the origin.
    expect(received.url).toBe('http://api.heroku.example/account')
    // `init` headers reach the origin through the dispatcher, not just the URL.
    expect(received.headers?.authorization).toBe('Bearer abc123')
    expect(received.headers?.['request-id']).toBe('req-1')
  })

  it('decomposes a body-bearing Request through the proxy dispatcher, preserving headers', async () => {
    process.env.HTTP_PROXY = serverUrl
    const fetchImpl = await getDefaultFetch()

    const request = new Request('http://api.heroku.example/apps', {
      body: JSON.stringify({name: 'my-app'}),
      headers: {
        authorization: 'Bearer abc123',
        'content-type': 'application/json',
        'request-id': 'req-1',
      },
      method: 'POST',
    })
    const response = await fetchImpl(request)

    expect(response.status).toBe(200)
    expect(received.method).toBe('POST')
    expect(received.url).toBe('http://api.heroku.example/apps')
    expect(JSON.parse(received.body)).toEqual({name: 'my-app'})
    // The decomposition copies the Request's headers onto the undici call, so
    // auth, correlation, and content-type all survive — a drop here would send
    // the request unauthenticated or unparseable.
    expect(received.headers?.authorization).toBe('Bearer abc123')
    expect(received.headers?.['content-type']).toBe('application/json')
    expect(received.headers?.['request-id']).toBe('req-1')
  })
})
