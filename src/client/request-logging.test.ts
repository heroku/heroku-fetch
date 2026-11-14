import {createServer, type Server} from 'node:http'
import {type AddressInfo} from 'node:net'
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest'

import * as debugLoggers from '../debug-loggers.js'
import {HerokuApiClient} from './index.js'

describe('request logging (heroku:fetch:request)', () => {
  // Answers 412 (a 2FA challenge) until a request carries a code, so tests can
  // drive the 2FA replay.
  let server: Server
  let baseUrl: string
  let debugRequestSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    debugRequestSpy = vi.spyOn(debugLoggers, 'debugRequest').mockImplementation(() => true)
    Object.assign(debugRequestSpy, {enabled: true})

    server = createServer((request, response) => {
      const status = request.headers['heroku-two-factor-code'] ? 200 : 412
      response.writeHead(status, {'Content-Type': 'application/json'})
      response.end(status === 200 ? '{}' : '{"id":"two_factor","message":"2FA required"}')
    })
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const {port} = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await new Promise<void>(resolve => {
      server.close(() => resolve())
    })
  })

  const loggedHeaders = () => debugRequestSpy.mock.calls
    .filter(([format]) => format === 'Headers: %O')
    .map(([, headers]) => headers as Record<string, string>)

  it('logs the request as sent, including Request-Id and headers set by consumer hooks', async () => {
    const client = new HerokuApiClient({
      baseUrl,
      hooks: {beforeRequest: [({request}) => request.headers.set('X-Trace', 'trace-1')]},
      token: 'secret-token',
      twoFactor: {onChallenge: () => '123456'},
    })

    await client.get('/apps')

    const [first] = loggedHeaders()
    expect(first['x-trace']).toBe('trace-1')
    expect(first['request-id']).toBeTruthy()
    expect(first.authorization).toBe('[REDACTED]')
  })

  it('logs the 2FA replay with its code redacted', async () => {
    const client = new HerokuApiClient({baseUrl, token: 'secret-token', twoFactor: {onChallenge: () => '123456'}})

    await client.get('/apps')

    const logged = loggedHeaders()
    expect(logged).toHaveLength(2)
    expect(logged[0]['heroku-two-factor-code']).toBeUndefined()
    expect(logged[1]['heroku-two-factor-code']).toBe('[REDACTED]')
    expect(JSON.stringify(logged)).not.toContain('123456')
    expect(JSON.stringify(logged)).not.toContain('secret-token')
  })

  it('logs only the origin for a custom client, whose path can be a credential', async () => {
    const debugResponseSpy = vi.spyOn(debugLoggers, 'debugResponse').mockImplementation(() => true)
    Object.assign(debugResponseSpy, {enabled: true})
    const client = new HerokuApiClient({baseUrl, service: 'custom', twoFactor: {onChallenge: () => '123456'}})

    await client.stream('/sessions/session-secret?srv=1')

    const urls = [...debugRequestSpy.mock.calls, ...debugResponseSpy.mock.calls]
      .filter(([format]) => String(format).startsWith('%s %s'))
      .map(call => call[2])
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url).toBe(`${baseUrl}/[REDACTED]`)
  })

  it('logs only the origin of a custom client\'s base URL at setup', () => {
    const debugAuthSpy = vi.spyOn(debugLoggers, 'debugAuth').mockImplementation(() => true)

    new HerokuApiClient({baseUrl: `${baseUrl}/sessions/session-secret`, service: 'custom'})

    expect(debugAuthSpy).toHaveBeenCalledWith(expect.stringContaining('baseUrl'), 'custom', `${baseUrl}/[REDACTED]`)
  })

  it('keeps the path for a named service', async () => {
    const client = new HerokuApiClient({baseUrl, token: 'secret-token', twoFactor: {onChallenge: () => '123456'}})

    await client.get('/apps/my-app')

    expect(debugRequestSpy).toHaveBeenCalledWith('%s %s', 'GET', `${baseUrl}/apps/my-app`)
  })
})
