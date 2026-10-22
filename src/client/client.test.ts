import {createServer, type Server} from 'node:http'
import {type AddressInfo} from 'node:net'
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest'

import type {ResponseMetadata} from '../types.js'

import {AuthenticationError, TwoFactorRequiredError} from '../errors.js'
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

    it('accepts the live-mutable warn, onResponseMetadata, and signal options', () => {
      // All three are re-read per request, so setOption takes effect rather than
      // throwing. The signal's effect is covered more strongly by the abort test
      // in 'AbortSignal forwarding'.
      const client = new HerokuApiClient()
      expect(() => client.setOption('warn', () => {})).not.toThrow()
      expect(() => client.setOption('onResponseMetadata', () => {})).not.toThrow()
      expect(() => client.setOption('signal', new AbortController().signal)).not.toThrow()
    })

    it('rejects options fixed at construction rather than silently no-opping', () => {
      // These are baked into the cached ky instance at construction, so a
      // post-construction change can't take effect — the client throws instead
      // of accepting a mutation that would never land.
      const client = new HerokuApiClient()
      expect(() => client.setOption('headers', {'X-Custom': 'v'})).toThrow(/fixed at construction/)
      expect(() => client.setOption('hooks', {})).toThrow(/fixed at construction/)
      expect(() => client.setOption('defaultAccept', 'application/json')).toThrow(/fixed at construction/)
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

    it('rejects an in-flight request when a client-level signal is aborted', async () => {
      const controller = new AbortController()
      const client = new HerokuApiClient({
        baseUrl: HANGING_URL,
        service: 'custom',
        signal: controller.signal,
        timeout: 60_000,
        token: 'test',
      })
      const pending = client.get('/never')
      controller.abort()
      await expect(pending).rejects.toMatchObject({name: 'AbortError'})
    })

    it('rejects an in-flight request when a signal set via setOption is aborted', async () => {
      const controller = new AbortController()
      const client = new HerokuApiClient({
        baseUrl: HANGING_URL,
        service: 'custom',
        timeout: 60_000,
        token: 'test',
      })
      client.setOption('signal', controller.signal)
      const pending = client.get('/never')
      controller.abort()
      await expect(pending).rejects.toMatchObject({name: 'AbortError'})
    })

    it('composes signals — the client-level signal aborts even when a per-request signal is also supplied', async () => {
      const clientController = new AbortController()
      const client = new HerokuApiClient({
        baseUrl: HANGING_URL,
        service: 'custom',
        signal: clientController.signal,
        timeout: 60_000,
        token: 'test',
      })
      // A separate, never-aborted per-request signal must not shadow the
      // client-level one.
      const requestController = new AbortController()
      const pending = client.get('/never', {signal: requestController.signal})
      clientController.abort()
      await expect(pending).rejects.toMatchObject({name: 'AbortError'})
    })

    it('composes signals — the per-request signal still aborts when a client-level signal is also set', async () => {
      const clientController = new AbortController()
      const client = new HerokuApiClient({
        baseUrl: HANGING_URL,
        service: 'custom',
        signal: clientController.signal,
        timeout: 60_000,
        token: 'test',
      })
      const requestController = new AbortController()
      const pending = client.get('/never', {signal: requestController.signal})
      requestController.abort()
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
      expect(seen[0].requestIds).toHaveLength(1)
      expect(seen[0].requestIds[0]).toMatch(/^[0-9a-f-]{36}$/i)
      expect(seen[0].warnings).toEqual(['plan changing.'])
    })
  })

  describe('two-factor retry (end-to-end)', () => {
    // A 2FA challenge (403 with a `two_factor` id) is retried with the prompted
    // code via ky's forced retry (`ky.retry`). The retry goes back through this
    // same client — reusing its proxy-aware fetch and the request's headers
    // (auth, Accept, Request-Id) — and its response flows through the
    // success-path hooks exactly once.
    let server: Server
    let baseUrl: string
    let requests: {body: string; requestId: string | undefined; twoFactorCode: string | undefined}[]

    beforeEach(async () => {
      requests = []
      server = createServer((request, response) => {
        const twoFactorCode = request.headers['heroku-two-factor-code'] as string | undefined
        const requestId = request.headers['request-id'] as string | undefined
        const chunks: Buffer[] = []
        request.on('data', chunk => chunks.push(chunk as Buffer))
        request.on('end', () => {
          const body = Buffer.concat(chunks).toString()
          requests.push({body, requestId, twoFactorCode})

          // Only the expected code is accepted; anything else (including no code)
          // is answered with a fresh 2FA challenge.
          if (twoFactorCode !== '123456') {
            response.writeHead(403, {'Content-Type': 'application/json'})
            response.end(JSON.stringify({id: 'two_factor', message: 'Two-factor code required.'}))
            return
          }

          response.writeHead(200, {'Content-Type': 'application/json', 'Request-Id': requestId ?? ''})
          response.end(JSON.stringify({ok: true}))
        })
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

    it('prompts for a code and retries through the client pipeline', async () => {
      const seen: ResponseMetadata[] = []
      const client = new HerokuApiClient({
        baseUrl,
        onResponseMetadata: metadata => seen.push(metadata),
        service: 'custom',
        token: 'test',
        twoFactor: {onChallenge: () => '123456'},
      })

      const response = await client.get('/account')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ok: true})
      // Two hits: the challenge, then the retry carrying the 2FA code.
      expect(requests).toHaveLength(2)
      expect(requests[0].twoFactorCode).toBeUndefined()
      expect(requests[1].twoFactorCode).toBe('123456')
      // The forced retry reuses the original request's headers, so it carries
      // the same Request-Id (ky doesn't re-run beforeRequest on a retry).
      expect(requests[1].requestId).toBeTruthy()
      expect(requests[1].requestId).toBe(requests[0].requestId)
      // Success-path metadata fired exactly once (for the retried 200): the
      // challenge response short-circuits the chain at the 2FA hook (it returns
      // ky.retry), so error/metadata only run on the retried response.
      expect(seen).toHaveLength(1)
      expect(seen[0].status).toBe(200)
    })

    it('retries a POST with its JSON body intact', async () => {
      // A forced retry of a non-idempotent method must re-send the original
      // body: ky hands the hook a retry clone whose body is still unread, so
      // the POST payload survives the challenge → retry round-trip.
      const client = new HerokuApiClient({
        baseUrl,
        service: 'custom',
        token: 'test',
        twoFactor: {onChallenge: () => '123456'},
      })

      const response = await client.post('/account', {name: 'example'})

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ok: true})
      expect(requests).toHaveLength(2)
      expect(requests[1].twoFactorCode).toBe('123456')
      // The retry carried the same JSON body as the original challenge attempt.
      expect(JSON.parse(requests[0].body)).toEqual({name: 'example'})
      expect(JSON.parse(requests[1].body)).toEqual({name: 'example'})
    })

    it('does not loop when the server rejects the submitted code', async () => {
      // The server never accepts the code, so every attempt is a 2FA challenge.
      // The retry carries `Heroku-Two-Factor-Code`, which is the loop guard: a
      // second challenge is thrown as TwoFactorRequiredError rather than
      // retried again.
      const client = new HerokuApiClient({
        baseUrl,
        service: 'custom',
        token: 'test',
        twoFactor: {onChallenge: () => 'wrong'},
      })

      await expect(client.get('/account')).rejects.toBeInstanceOf(TwoFactorRequiredError)
      // Exactly one retry: the original challenge plus the (still-rejected) retry.
      expect(requests).toHaveLength(2)
      expect(requests[1].twoFactorCode).toBe('wrong')
    })
  })

  describe('reauthorize retry (end-to-end)', () => {
    // A 401 is retried once when a `reauthorize` callback is configured: the
    // client awaits the callback (the consumer's chance to refresh credentials)
    // and re-issues the request through the full pipeline, so beforeRequest
    // re-resolves the token provider and the retry carries the refreshed token.
    // The server answers 200 only for `Bearer fresh`; anything else is a 401.
    let server: Server
    let baseUrl: string
    let requests: {auth: string | undefined; body: string}[]

    beforeEach(async () => {
      requests = []
      server = createServer((request, response) => {
        const auth = request.headers.authorization
        const chunks: Buffer[] = []
        request.on('data', chunk => chunks.push(chunk as Buffer))
        request.on('end', () => {
          requests.push({auth, body: Buffer.concat(chunks).toString()})
          // A dedicated path for the non-401 negative case.
          if (request.url === '/boom') {
            response.writeHead(500, {'Content-Type': 'application/json'})
            response.end(JSON.stringify({id: 'server_error', message: 'Boom.'}))
            return
          }

          if (auth === 'Bearer fresh') {
            response.writeHead(200, {'Content-Type': 'application/json'})
            response.end(JSON.stringify({ok: true}))
            return
          }

          response.writeHead(401, {'Content-Type': 'application/json'})
          response.end(JSON.stringify({id: 'unauthorized', message: 'Invalid credentials provided.'}))
        })
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

    it('refreshes credentials and retries once on a 401, then succeeds', async () => {
      let token = 'stale'
      let reauthorizeCalls = 0
      const client = new HerokuApiClient({
        baseUrl,
        reauthorize() {
          reauthorizeCalls++
          token = 'fresh'
        },
        service: 'custom',
        token: () => token,
      })

      const response = await client.get('/account')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ok: true})
      expect(reauthorizeCalls).toBe(1)
      // Two hits: the stale-token 401, then the retry carrying the refreshed
      // token re-resolved by beforeRequest.
      expect(requests).toHaveLength(2)
      expect(requests[0].auth).toBe('Bearer stale')
      expect(requests[1].auth).toBe('Bearer fresh')
    })

    it('retries a POST with its JSON body intact', async () => {
      let token = 'stale'
      const client = new HerokuApiClient({
        baseUrl,
        reauthorize() {
          token = 'fresh'
        },
        service: 'custom',
        token: () => token,
      })

      const response = await client.post('/account', {name: 'example'})

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ok: true})
      expect(requests).toHaveLength(2)
      expect(JSON.parse(requests[0].body)).toEqual({name: 'example'})
      expect(JSON.parse(requests[1].body)).toEqual({name: 'example'})
    })

    it('does not loop when the retry still returns 401', async () => {
      let reauthorizeCalls = 0
      const client = new HerokuApiClient({
        baseUrl,
        // The callback never actually produces an accepted token, so the retry
        // 401s again — it must surface rather than reauthorize a second time.
        reauthorize() {
          reauthorizeCalls++
        },
        service: 'custom',
        token: 'stale',
      })

      await expect(client.get('/account')).rejects.toBeInstanceOf(AuthenticationError)
      expect(reauthorizeCalls).toBe(1)
      expect(requests).toHaveLength(2)
    })

    it('throws AuthenticationError without retrying when no reauthorize is configured', async () => {
      const client = new HerokuApiClient({baseUrl, service: 'custom', token: 'stale'})

      await expect(client.get('/account')).rejects.toBeInstanceOf(AuthenticationError)
      expect(requests).toHaveLength(1)
    })

    it('propagates a rejection from reauthorize in place of the 401', async () => {
      const client = new HerokuApiClient({
        baseUrl,
        reauthorize() {
          throw new Error('login aborted')
        },
        service: 'custom',
        token: 'stale',
      })

      await expect(client.get('/account')).rejects.toThrow('login aborted')
      // The callback threw before any retry could go out.
      expect(requests).toHaveLength(1)
    })

    it('does not invoke reauthorize on a non-401 error', async () => {
      // The crux guard: only AuthenticationError (a 401) drives the retry. A
      // 500 must propagate untouched with the callback never called.
      let reauthorizeCalls = 0
      const client = new HerokuApiClient({
        baseUrl,
        reauthorize() {
          reauthorizeCalls++
        },
        service: 'custom',
        token: 'stale',
      })

      await expect(client.get('/boom')).rejects.toMatchObject({statusCode: 500})
      expect(reauthorizeCalls).toBe(0)
      expect(requests).toHaveLength(1)
    })

    it('refreshes and retries a stream on a 401', async () => {
      // stream() shares send() with request(); confirm the retry seam works on
      // the other public entry point too.
      let token = 'stale'
      let reauthorizeCalls = 0
      const client = new HerokuApiClient({
        baseUrl,
        reauthorize() {
          reauthorizeCalls++
          token = 'fresh'
        },
        service: 'custom',
        token: () => token,
      })

      const response = await client.stream('/account')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ok: true})
      expect(reauthorizeCalls).toBe(1)
      expect(requests).toHaveLength(2)
      expect(requests[1].auth).toBe('Bearer fresh')
    })

    it('awaits an async reauthorize callback before retrying', async () => {
      // The real consumer (heroku login) is async; exercise `await reauthorize()`
      // against a genuine promise rather than a sync void.
      let token = 'stale'
      const client = new HerokuApiClient({
        baseUrl,
        async reauthorize() {
          await new Promise<void>(resolve => {
            setTimeout(resolve, 10)
          })
          token = 'fresh'
        },
        service: 'custom',
        token: () => token,
      })

      const response = await client.get('/account')

      expect(response.status).toBe(200)
      expect(requests).toHaveLength(2)
      expect(requests[1].auth).toBe('Bearer fresh')
    })

    it('passes the request\'s combined abort signal to the callback', async () => {
      // A lone client-level signal (no per-call signal) passes through unwrapped,
      // so the callback receives that exact signal — letting an interactive
      // refresh bail when the caller aborts.
      const controller = new AbortController()
      let received: AbortSignal | undefined
      let token = 'stale'
      const client = new HerokuApiClient({
        baseUrl,
        reauthorize(context) {
          received = context.signal
          token = 'fresh'
        },
        service: 'custom',
        signal: controller.signal,
        token: () => token,
      })

      await client.get('/account')

      expect(received).toBe(controller.signal)
    })

    it('hands the callback the composite signal when a per-call signal is also set', async () => {
      // Client-level + per-call signals compose into one AbortSignal.any: the
      // callback receives the composite (neither source directly), and aborting
      // either source aborts it — so an interactive refresh still bails.
      const clientController = new AbortController()
      const callController = new AbortController()
      let received: AbortSignal | undefined
      let token = 'stale'
      const client = new HerokuApiClient({
        baseUrl,
        reauthorize(context) {
          received = context.signal
          token = 'fresh'
        },
        service: 'custom',
        signal: clientController.signal,
        token: () => token,
      })

      await client.get('/account', {signal: callController.signal})

      expect(received).toBeDefined()
      expect(received).not.toBe(clientController.signal)
      expect(received).not.toBe(callController.signal)
      // The composite tracks either source: aborting the per-call one aborts it.
      expect(received!.aborted).toBe(false)
      callController.abort()
      expect(received!.aborted).toBe(true)
    })

    it('skips the callback and does not retry when the signal has already aborted', async () => {
      // Documented guarantee: an already-aborted request never drives a refresh.
      // fetch rejects the aborted request before it reaches the 401 path, so the
      // callback never fires and nothing is sent.
      let reauthorizeCalls = 0
      const client = new HerokuApiClient({
        baseUrl,
        reauthorize() {
          reauthorizeCalls++
        },
        service: 'custom',
        token: 'stale',
      })

      await expect(client.get('/account', {signal: AbortSignal.abort()})).rejects.toThrow()
      expect(reauthorizeCalls).toBe(0)
      expect(requests).toHaveLength(0)
    })

    it('does not run the callback or retry when a request opts out with reauthorize: false', async () => {
      // Per-request escape hatch (legacy `retryAuth: false`): a 401 surfaces
      // untouched even though the client has a reauthorize callback configured.
      let reauthorizeCalls = 0
      const client = new HerokuApiClient({
        baseUrl,
        reauthorize() {
          reauthorizeCalls++
        },
        service: 'custom',
        token: 'stale',
      })

      await expect(client.get('/account', {reauthorize: false})).rejects.toBeInstanceOf(AuthenticationError)
      expect(reauthorizeCalls).toBe(0)
      expect(requests).toHaveLength(1)
    })

    it('attaches the original 401 as the cause of a reauthorize rejection', async () => {
      // The callback's failure propagates, but the 401 is preserved on `cause`
      // so consumers keep its statusCode/id and an AuthenticationError check on
      // the cause chain still works.
      const client = new HerokuApiClient({
        baseUrl,
        reauthorize() {
          throw new Error('login aborted')
        },
        service: 'custom',
        token: 'stale',
      })

      const error = await client.get('/account').catch((error_: unknown) => error_)

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('login aborted')
      expect((error as Error).cause).toBeInstanceOf(AuthenticationError)
      expect((error as Error).cause).toMatchObject({statusCode: 401})
    })

    it('coalesces concurrent 401s into a single reauthorize refresh', async () => {
      // Single-flight: three requests sharing a stale token 401 together, but the
      // callback (the interactive login) fires once, not once per request. The
      // refresh is async (as `heroku login` is), so the first 401 starts it and
      // the other two land during that window and await the same promise.
      let token = 'stale'
      let reauthorizeCalls = 0
      const client = new HerokuApiClient({
        baseUrl,
        async reauthorize() {
          reauthorizeCalls++
          await new Promise<void>(resolve => {
            setTimeout(resolve, 25)
          })
          token = 'fresh'
        },
        service: 'custom',
        token: () => token,
      })

      const responses = await Promise.all([
        client.get('/account'),
        client.get('/account'),
        client.get('/account'),
      ])

      for (const response of responses) {
        expect(response.status).toBe(200)
      }

      // One shared refresh, not three.
      expect(reauthorizeCalls).toBe(1)
      // Three stale-token 401s, then three retries carrying the refreshed token.
      expect(requests).toHaveLength(6)
      expect(requests.slice(0, 3).every(r => r.auth === 'Bearer stale')).toBe(true)
      expect(requests.slice(3).every(r => r.auth === 'Bearer fresh')).toBe(true)
    })

    it('starts a fresh refresh for a later 401 once the shared one has settled', async () => {
      // The coalesced promise is cleared when it settles, so a subsequent 401
      // (a sequential request, after the first refresh resolved) drives its own
      // refresh rather than reusing the earlier, now-stale one.
      let token = 'stale'
      let reauthorizeCalls = 0
      const client = new HerokuApiClient({
        baseUrl,
        reauthorize() {
          reauthorizeCalls++
          token = 'fresh'
        },
        service: 'custom',
        token: () => token,
      })

      await client.get('/account')
      // Force the next request to 401 again by reverting to a stale token.
      token = 'stale'
      await client.get('/account')

      expect(reauthorizeCalls).toBe(2)
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

    it('lets a per-call Accept override the client default (ky merges per-call over instance)', async () => {
      const client = new HerokuApiClient({
        baseUrl,
        service: 'platform',
        token: 'test',
      })

      await client.get('/apps', {headers: {Accept: 'application/vnd.heroku+json; version=3.sdk'}})

      expect(received).toBe('application/vnd.heroku+json; version=3.sdk')
    })
  })

  describe('userAgent option (end-to-end)', () => {
    // Capture the User-Agent the client actually puts on the wire, so these
    // exercise the constructor wiring rather than the assembly helper in
    // isolation.
    let server: Server
    let baseUrl: string
    let received: string | undefined

    beforeEach(async () => {
      server = createServer((request, response) => {
        received = request.headers['user-agent']
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

    it('sends a canonical User-Agent assembled from name/version plus the Node comment', async () => {
      const client = new HerokuApiClient({
        baseUrl,
        service: 'custom',
        token: 'test',
        userAgent: {name: 'heroku-cli', version: '11.4.0'},
      })

      await client.get('/apps')

      // Running under Node, so the platform/runtime comment is present.
      expect(received).toMatch(/^heroku-cli\/11\.4\.0 \(.+; .+\) Node\.js\/.+$/)
    })

    it('sets no heroku client User-Agent when the option is omitted', async () => {
      const client = new HerokuApiClient({
        baseUrl,
        service: 'custom',
        token: 'test',
      })

      await client.get('/apps')

      // The client contributed no managed User-Agent: whatever the default fetch
      // transport sends must carry none of our token's markers — no product
      // name, no Node.js comment, and crucially no `undefined` (which a broken
      // guard would emit as `undefined/undefined (…) Node.js/…`).
      const ua = received ?? ''
      expect(ua).not.toContain('heroku-cli')
      expect(ua).not.toContain('Node.js/')
      expect(ua).not.toContain('undefined')
    })

    it('sets no User-Agent when name or version is empty (avoids a malformed token)', async () => {
      const client = new HerokuApiClient({
        baseUrl,
        service: 'custom',
        token: 'test',
        userAgent: {name: 'heroku-cli', version: ''},
      })

      await client.get('/apps')

      // Same guard, exercised through an incomplete option: no partial or
      // malformed token (`heroku-cli/`, a bare `Node.js/` comment, or `undefined`)
      // should leak from the empty `version`.
      const ua = received ?? ''
      expect(ua).not.toContain('heroku-cli')
      expect(ua).not.toContain('Node.js/')
      expect(ua).not.toContain('undefined')
    })

    it('lets a per-call User-Agent override the client option (ky merges per-call over instance)', async () => {
      const client = new HerokuApiClient({
        baseUrl,
        service: 'custom',
        token: 'test',
        userAgent: {name: 'heroku-cli', version: '11.4.0'},
      })

      await client.get('/apps', {headers: {'User-Agent': 'custom-agent/9.9.9'}})

      expect(received).toBe('custom-agent/9.9.9')
    })

    it('lets a client-level User-Agent header win over the structured option', async () => {
      const client = new HerokuApiClient({
        baseUrl,
        headers: {'User-Agent': 'custom-agent/1.0.0'},
        service: 'custom',
        token: 'test',
        userAgent: {name: 'heroku-cli', version: '11.4.0'},
      })

      await client.get('/apps')

      expect(received).toBe('custom-agent/1.0.0')
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
