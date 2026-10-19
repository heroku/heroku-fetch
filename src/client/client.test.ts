import {createServer, type Server} from 'node:http'
import {type AddressInfo} from 'node:net'
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest'

import type {ResponseMetadata} from '../types.js'

import {AuthenticationError} from '../errors.js'
import {HerokuApiClient} from './index.js'
import {SERVICE_CONFIGS} from './service-configurations.js'

describe('HerokuApiClient', () => {
  describe('constructor', () => {
    it('should create a client with default options', () => {
      const client = new HerokuApiClient()
      expect(client).toBeInstanceOf(HerokuApiClient)
    })

    it('should create a client for platform service', () => {
      const client = new HerokuApiClient({service: 'platform'})
      expect(client).toBeInstanceOf(HerokuApiClient)
    })

    it('should create a client for data service', () => {
      const client = new HerokuApiClient({service: 'data'})
      expect(client).toBeInstanceOf(HerokuApiClient)
    })

    it('should create a client with static token', () => {
      const client = new HerokuApiClient({
        service: 'platform',
        token: 'test-token',
      })
      expect(client).toBeInstanceOf(HerokuApiClient)
    })

    it('should create a client with token function', () => {
      const client = new HerokuApiClient({
        service: 'platform',
        token: async () => 'test-token',
      })
      expect(client).toBeInstanceOf(HerokuApiClient)
    })

    it('should throw error when custom service without baseUrl', () => {
      expect(() => {
        new HerokuApiClient({service: 'custom'})
      }).toThrow('baseUrl is required when service is "custom"')
    })

    it('should create a client with custom baseUrl', () => {
      const client = new HerokuApiClient({
        baseUrl: 'https://custom.example.com',
        service: 'custom',
      })
      expect(client).toBeInstanceOf(HerokuApiClient)
    })

    it('should support region for data service', () => {
      const client = new HerokuApiClient({
        region: 'eu',
        service: 'data',
      })
      expect(client).toBeInstanceOf(HerokuApiClient)
    })

    it('should support custom headers', () => {
      const client = new HerokuApiClient({
        headers: {
          'X-Custom-Header': 'test',
        },
        service: 'platform',
      })
      expect(client).toBeInstanceOf(HerokuApiClient)
    })
  })

  describe('setOption', () => {
    it('should update token', () => {
      const client = new HerokuApiClient()
      client.setOption('token', 'new-token')
      // Token is updated internally
    })

    it('should update timeout', () => {
      const client = new HerokuApiClient()
      client.setOption('timeout', 5000)
      // Timeout is updated internally
    })
  })

  describe('HTTP methods', () => {
    it('should have get method', () => {
      const client = new HerokuApiClient({token: 'test'})
      expect(typeof client.get).toBe('function')
    })

    it('should have post method', () => {
      const client = new HerokuApiClient({token: 'test'})
      expect(typeof client.post).toBe('function')
    })

    it('should have put method', () => {
      const client = new HerokuApiClient({token: 'test'})
      expect(typeof client.put).toBe('function')
    })

    it('should have patch method', () => {
      const client = new HerokuApiClient({token: 'test'})
      expect(typeof client.patch).toBe('function')
    })

    it('should have delete method', () => {
      const client = new HerokuApiClient({token: 'test'})
      expect(typeof client.delete).toBe('function')
    })

    it('should have stream method', () => {
      const client = new HerokuApiClient({token: 'test'})
      expect(typeof client.stream).toBe('function')
    })
  })

  describe('AbortSignal forwarding', () => {
    // Use an unroutable address so the request hangs in the connect
    // phase, giving us a deterministic window in which to fire the
    // abort. RFC 5737 reserves 192.0.2.0/24 for documentation; nothing
    // listens there and connect attempts won't resolve quickly.
    const HANGING_URL = 'http://192.0.2.1'

    it('rejects an in-flight request when the signal is aborted', async () => {
      const client = new HerokuApiClient({
        baseUrl: HANGING_URL,
        service: 'custom',
        timeout: 60_000,
        token: 'test',
      })
      const controller = new AbortController()
      const pending = client.get('/never', {signal: controller.signal})
      controller.abort()
      await expect(pending).rejects.toMatchObject({name: 'AbortError'})
    })

    it('rejects an in-flight stream when the signal is aborted', async () => {
      const client = new HerokuApiClient({
        baseUrl: HANGING_URL,
        service: 'custom',
        timeout: 60_000,
        token: 'test',
      })
      const controller = new AbortController()
      const pending = client.stream('/never', {signal: controller.signal})
      controller.abort()
      await expect(pending).rejects.toMatchObject({name: 'AbortError'})
    })
  })

  describe('unauthenticated requests (no token configured)', () => {
    // With no token and HEROKU_API_KEY unset, the default provider resolves to
    // undefined: the request goes out with no Authorization header, and an
    // auth-required endpoint's 401 surfaces as AuthenticationError. This is the
    // transport's "don't throw locally, let the server decide" contract.
    let server: Server
    let baseUrl: string
    let receivedAuth: string | undefined
    const originalApiKey = process.env.HEROKU_API_KEY

    beforeEach(async () => {
      delete process.env.HEROKU_API_KEY
      receivedAuth = undefined
      server = createServer((request, response) => {
        receivedAuth = request.headers.authorization
        response.writeHead(401, {'Content-Type': 'application/json'})
        response.end(JSON.stringify({id: 'unauthorized', message: 'Invalid credentials provided.'}))
      })
      await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', resolve)
      })
      const {port} = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${port}`
    })

    afterEach(async () => {
      if (originalApiKey === undefined) delete process.env.HEROKU_API_KEY
      else process.env.HEROKU_API_KEY = originalApiKey
      await new Promise<void>(resolve => {
        server.close(() => resolve())
      })
    })

    it('sends no Authorization header and surfaces a 401 as AuthenticationError', async () => {
      const client = new HerokuApiClient({baseUrl, service: 'custom'})

      await expect(client.get('/apps')).rejects.toBeInstanceOf(AuthenticationError)
      expect(receivedAuth).toBeUndefined()
    })

    it('promotes the error body id onto the AuthenticationError', async () => {
      const client = new HerokuApiClient({baseUrl, service: 'custom'})

      await expect(client.get('/apps')).rejects.toMatchObject({
        id: 'unauthorized',
        name: 'AuthenticationError',
        statusCode: 401,
      })
    })
  })

  describe('proxy routing (end-to-end through ky)', () => {
    // Regression: ky calls the global fetch, which on Node 22 is backed by a
    // different undici than our dispatcher and rejects it. The client must
    // drive ky through getDefaultFetch()'s matched fetch so a proxied request
    // actually succeeds. A plain-HTTP forward proxy receives the absolute URL.
    const PROXY_VARS = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy']
    const saved: Record<string, string | undefined> = {}
    let proxy: Server
    let proxyUrl: string
    let proxiedUrl: string | undefined

    beforeEach(async () => {
      for (const name of PROXY_VARS) {
        saved[name] = process.env[name]
        delete process.env[name]
      }

      proxiedUrl = undefined
      proxy = createServer((request, response) => {
        proxiedUrl = request.url
        response.writeHead(200, {'content-type': 'application/json'})
        response.end(JSON.stringify({routed: true}))
      })
      await new Promise<void>(resolve => {
        proxy.listen(0, '127.0.0.1', resolve)
      })
      const {port} = proxy.address() as AddressInfo
      proxyUrl = `http://127.0.0.1:${port}`
    })

    afterEach(async () => {
      for (const name of PROXY_VARS) {
        if (saved[name] === undefined) delete process.env[name]
        else process.env[name] = saved[name]
      }

      await new Promise<void>(resolve => {
        proxy.close(() => resolve())
      })
    })

    it('routes a GET through an HTTP_PROXY-configured dispatcher', async () => {
      process.env.HTTP_PROXY = proxyUrl
      const client = new HerokuApiClient({
        baseUrl: 'http://api.heroku.example',
        service: 'custom',
        token: 'test',
      })

      const response = await client.get('/account')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({routed: true})
      expect(proxiedUrl).toBe('http://api.heroku.example/account')
    })
  })

  describe('Request-Id correlation (end-to-end)', () => {
    // The client accumulates a Request-Id chain and sends it on every request so
    // related calls can be correlated server-side. Capture what the server
    // actually receives and echo it back so we can observe accumulation.
    let server: Server
    let baseUrl: string
    let received: string[]

    beforeEach(async () => {
      received = []
      server = createServer((request, response) => {
        const id = request.headers['request-id'] as string | undefined
        received.push(id ?? '')
        response.writeHead(200, {'Content-Type': 'application/json', 'Request-Id': id ?? ''})
        response.end('{}')
      })
      await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', resolve)
      })
      const {port} = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${port}`
    })

    afterEach(async () => {
      await new Promise<void>(resolve => {
        server.close(() => resolve())
      })
    })

    it('sends a Request-Id and accumulates the chain across requests', async () => {
      const client = new HerokuApiClient({baseUrl, service: 'custom', token: 'test'})

      await client.get('/a')
      await client.get('/b')

      expect(received).toHaveLength(2)
      const [first, second] = received
      // The first request carries a single UUID.
      expect(first).toMatch(/^[0-9a-f-]{36}$/i)
      // The second carries a fresh id prepended to the (deduped) prior chain.
      expect(second.split(',')).toHaveLength(2)
      expect(second.endsWith(first)).toBe(true)
    })

    it('isolates the chain between separate clients', async () => {
      await new HerokuApiClient({baseUrl, service: 'custom', token: 'test'}).get('/a')
      await new HerokuApiClient({baseUrl, service: 'custom', token: 'test'}).get('/a')

      // A second, independent client starts its own chain of length one.
      expect(received[1].split(',')).toHaveLength(1)
    })
  })

  describe('warning header surfacing (end-to-end)', () => {
    // Server warning headers are forwarded to the injected `warn` callback,
    // deduped per client over its lifetime.
    let server: Server
    let baseUrl: string
    let warningHeaders: Record<string, string>

    beforeEach(async () => {
      warningHeaders = {}
      server = createServer((request, response) => {
        response.writeHead(200, {'Content-Type': 'application/json', ...warningHeaders})
        response.end('{}')
      })
      await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', resolve)
      })
      const {port} = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${port}`
    })

    afterEach(async () => {
      await new Promise<void>(resolve => {
        server.close(() => resolve())
      })
    })

    it('forwards x-heroku-warning to the warn callback, deduped', async () => {
      warningHeaders = {'x-heroku-warning': 'Warning: your plan is changing.'}
      const warnings: string[] = []
      const client = new HerokuApiClient({
        baseUrl,
        service: 'custom',
        token: 'test',
        warn: message => warnings.push(message),
      })

      await client.get('/a')
      await client.get('/b')

      // Prefix stripped, trimmed, and surfaced once despite two responses.
      expect(warnings).toEqual(['your plan is changing.'])
    })

    it('drops warnings when no warn callback is configured', async () => {
      warningHeaders = {'x-heroku-warning': 'nobody is listening'}
      const client = new HerokuApiClient({baseUrl, service: 'custom', token: 'test'})

      // Must not throw despite the warning header being present.
      await expect(client.get('/a')).resolves.toBeDefined()
    })
  })

  describe('delinquency warnings (end-to-end)', () => {
    // Opt-in: a qualifying GET triggers a one-time Particleboard side-call whose
    // delinquency payload is surfaced via `warn`. Two real servers stand in for
    // the platform API and Particleboard.
    let api: Server
    let apiBaseUrl: string
    let pb: Server
    let pbBaseUrl: string
    let pbPaths: string[]
    let pbStatus: number
    let pbBody: unknown
    let warnings: string[]

    beforeEach(async () => {
      pbPaths = []
      pbStatus = 200
      pbBody = {}
      warnings = []

      api = createServer((_request, response) => {
        response.writeHead(200, {'Content-Type': 'application/json'})
        response.end('{}')
      })
      pb = createServer((request, response) => {
        pbPaths.push(request.url ?? '')
        response.writeHead(pbStatus, {'Content-Type': 'application/json'})
        response.end(JSON.stringify(pbBody))
      })
      await Promise.all([
        new Promise<void>(resolve => {
          api.listen(0, '127.0.0.1', resolve)
        }),
        new Promise<void>(resolve => {
          pb.listen(0, '127.0.0.1', resolve)
        }),
      ])
      apiBaseUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`
      pbBaseUrl = `http://127.0.0.1:${(pb.address() as AddressInfo).port}`
    })

    afterEach(async () => {
      await Promise.all([
        new Promise<void>(resolve => {
          api.close(() => resolve())
        }),
        new Promise<void>(resolve => {
          pb.close(() => resolve())
        }),
      ])
    })

    function makeClient(): HerokuApiClient {
      return new HerokuApiClient({
        baseUrl: apiBaseUrl,
        delinquencyWarnings: true,
        particleboardBaseUrl: pbBaseUrl,
        service: 'custom',
        token: 'test',
        warn: message => warnings.push(message),
      })
    }

    it('surfaces a delinquency warning for a qualifying GET, once per client', async () => {
      pbBody = {scheduled_suspension_time: '2999-01-01T00:00:00.000Z'}
      const client = makeClient()

      await client.get('/account')
      await client.get('/account')

      expect(pbPaths).toEqual(['/account']) // side-call fired once, then the guard
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toMatch(/^This account is delinquent with payment and we'll suspend it on /)
    })

    it('does not trigger the side-call for a non-qualifying path', async () => {
      const client = makeClient()

      await client.get('/apps')

      expect(pbPaths).toEqual([])
      expect(warnings).toEqual([])
    })

    it('swallows a Particleboard error and still resolves the main request', async () => {
      pbStatus = 500
      pbBody = {id: 'server_error'}
      const client = makeClient()

      const response = await client.get('/account')

      expect(response.status).toBe(200)
      expect(pbPaths).toEqual(['/account'])
      expect(warnings).toEqual([])
    })

    it('is off by default (no side-call without the opt-in)', async () => {
      const client = new HerokuApiClient({
        baseUrl: apiBaseUrl,
        particleboardBaseUrl: pbBaseUrl,
        service: 'custom',
        token: 'test',
        warn: message => warnings.push(message),
      })

      await client.get('/account')

      expect(pbPaths).toEqual([])
    })
  })

  describe('onResponseMetadata (end-to-end)', () => {
    // The success-path metadata side channel: request-id + warnings surfaced
    // structurally, while get() still returns the bare Response.
    let server: Server
    let baseUrl: string

    beforeEach(async () => {
      server = createServer((request, response) => {
        response.writeHead(200, {
          'Content-Type': 'application/json',
          'Request-Id': (request.headers['request-id'] as string | undefined) ?? '',
          'x-heroku-warning': 'Warning: plan changing.',
        })
        response.end('{}')
      })
      await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', resolve)
      })
      const {port} = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${port}`
    })

    afterEach(async () => {
      await new Promise<void>(resolve => {
        server.close(() => resolve())
      })
    })

    it('surfaces structured metadata on the success path', async () => {
      const seen: ResponseMetadata[] = []
      const client = new HerokuApiClient({
        baseUrl,
        onResponseMetadata: metadata => seen.push(metadata),
        service: 'custom',
        token: 'test',
      })

      const response = await client.get('/account')

      // The bare Response is still returned unchanged.
      expect(response.status).toBe(200)
      expect(seen).toHaveLength(1)
      expect(seen[0].status).toBe(200)
      expect(seen[0].url).toBe(`${baseUrl}/account`)
      expect(seen[0].requestId).toMatch(/^[0-9a-f-]{36}$/i)
      expect(seen[0].warnings).toEqual(['plan changing.'])
    })
  })

  describe('consumer hooks (options.hooks)', () => {
    // Consumer hooks are merged after the built-ins. beforeRequest hooks see the
    // fully-prepared request; afterResponse hooks run on the resolved response.
    let server: Server
    let baseUrl: string

    beforeEach(async () => {
      server = createServer((_request, response) => {
        response.writeHead(200, {'Content-Type': 'application/json'})
        response.end(JSON.stringify({original: true}))
      })
      await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', resolve)
      })
      const {port} = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${port}`
    })

    afterEach(async () => {
      await new Promise<void>(resolve => {
        server.close(() => resolve())
      })
    })

    it('runs a consumer beforeRequest hook after the built-ins', async () => {
      let seenAuth: null | string = null
      let seenRequestId: null | string = null
      const client = new HerokuApiClient({
        baseUrl,
        hooks: {
          beforeRequest: [({request}) => {
            // The built-in hooks have already attached auth and the Request-Id.
            seenAuth = request.headers.get('Authorization')
            seenRequestId = request.headers.get('Request-Id')
          }],
        },
        service: 'custom',
        token: 'test',
      })

      await client.get('/a')

      expect(seenAuth).toBe('Bearer test')
      expect(seenRequestId).toBeTruthy()
    })

    it('runs a consumer afterResponse hook and lets it replace the response', async () => {
      const client = new HerokuApiClient({
        baseUrl,
        hooks: {
          afterResponse: [() => new Response(JSON.stringify({replaced: true}), {
            headers: {'Content-Type': 'application/json'},
            status: 200,
          })],
        },
        service: 'custom',
        token: 'test',
      })

      const response = await client.get('/a')

      expect(await response.json()).toEqual({replaced: true})
    })
  })

  describe('defaultAccept option', () => {
    // Capture the Accept header the client actually puts on the wire, so
    // these exercise the constructor wiring rather than the hook in isolation.
    let server: Server
    let baseUrl: string
    let received: string | undefined

    beforeEach(async () => {
      server = createServer((request, response) => {
        received = request.headers.accept
        response.writeHead(200, {'Content-Type': 'application/json'})
        response.end('{}')
      })
      await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', resolve)
      })
      const {port} = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${port}`
    })

    afterEach(async () => {
      await new Promise<void>(resolve => {
        server.close(() => resolve())
      })
    })

    it('sends the per-client override in place of the service default', async () => {
      const client = new HerokuApiClient({
        baseUrl,
        defaultAccept: 'application/vnd.heroku+json; version=3.sdk',
        service: 'platform',
        token: 'test',
      })

      await client.get('/apps')

      expect(received).toBe('application/vnd.heroku+json; version=3.sdk')
    })

    it('falls back to the service default when no override is given', async () => {
      const client = new HerokuApiClient({
        baseUrl,
        service: 'platform',
        token: 'test',
      })

      await client.get('/apps')

      expect(received).toBe('application/vnd.heroku+json; version=3')
    })
  })
})

describe('SERVICE_CONFIGS', () => {
  const HEROKU_V3_ACCEPT = 'application/vnd.heroku+json; version=3'

  it('should have platform config', () => {
    expect(SERVICE_CONFIGS.platform).toEqual({
      baseUrl: 'https://api.heroku.com',
      defaultAccept: HEROKU_V3_ACCEPT,
    })
  })

  it('should have data config', () => {
    expect(SERVICE_CONFIGS.data).toEqual({
      baseUrl: 'https://postgres-api.heroku.com',
      defaultAccept: HEROKU_V3_ACCEPT,
    })
  })

  it('should have particleboard config', () => {
    expect(SERVICE_CONFIGS.particleboard).toEqual({
      baseUrl: 'https://particleboard.heroku.com',
      defaultAccept: HEROKU_V3_ACCEPT,
    })
  })

  it('should have custom config without a default Accept', () => {
    expect(SERVICE_CONFIGS.custom).toEqual({
      baseUrl: '',
    })
  })
})
