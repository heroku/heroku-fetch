import type {AddressInfo} from 'node:net'

import {createServer, type Server} from 'node:http'
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest'

import {HerokuApiError, TwoFactorRequiredError} from '../errors.js'
import {HerokuApiClient} from './index.js'

// Network retries wait 300, 600 and 1200 ms, so tests that use all three take
// about 2.1 s.
const SLOW = 10_000

describe('network retries (end-to-end)', () => {
  let server: Server
  let baseUrl: string
  let attempts: {method: string; twoFactorCode: string | undefined}[]
  // The first `dropped` requests have their connection destroyed with no
  // response, which fetch reports as a network error.
  let dropped: number
  let respond: (twoFactorCode: string | undefined) => undefined | {body: unknown; status: number}

  beforeEach(async () => {
    attempts = []
    dropped = 0
    respond = () => ({body: {ok: true}, status: 200})
    server = createServer((request, response) => {
      const twoFactorCode = request.headers['heroku-two-factor-code'] as string | undefined
      attempts.push({method: request.method ?? '', twoFactorCode})
      if (attempts.length <= dropped) {
        request.socket.destroy()
        return
      }

      const reply = respond(twoFactorCode)
      if (!reply) return // never respond, so the request times out
      response.writeHead(reply.status, {'Content-Type': 'application/json'})
      response.end(JSON.stringify(reply.body))
    })
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve)
    })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => {
      server.close(() => resolve())
    })
  })

  const newClient = (options: ConstructorParameters<typeof HerokuApiClient>[0] = {}) => new HerokuApiClient({
    baseUrl, service: 'custom', token: 'test', ...options,
  })

  it('retries a GET up to 3 times after network errors', {timeout: SLOW}, async () => {
    dropped = 3

    const response = await newClient().get('/apps')

    expect(response.status).toBe(200)
    expect(attempts).toHaveLength(4)
  })

  it('gives up on a GET after 3 retries', {timeout: SLOW}, async () => {
    dropped = Infinity

    await expect(newClient().get('/apps')).rejects.toThrow()
    expect(attempts).toHaveLength(4)
  })

  it.each(['post', 'put', 'patch', 'delete'] as const)('does not retry a %s after a network error', async method => {
    dropped = Infinity
    const client = newClient()

    const request = method === 'delete' ? client.delete('/apps/a') : client[method]('/apps/a', {name: 'a'})

    await expect(request).rejects.toThrow()
    expect(attempts).toHaveLength(1)
  })

  it('does not retry an error response', async () => {
    respond = () => ({body: {id: 'unavailable', message: 'Service unavailable'}, status: 503})

    await expect(newClient().get('/apps')).rejects.toBeInstanceOf(HerokuApiError)
    expect(attempts).toHaveLength(1)
  })

  it('does not retry a timeout', async () => {
    respond = () => {}

    await expect(newClient({timeout: 50}).get('/apps')).rejects.toThrow()
    expect(attempts).toHaveLength(1)
  })

  it('still replays a 2FA challenge after 3 network retries', {timeout: SLOW}, async () => {
    dropped = 3
    respond = twoFactorCode => (twoFactorCode === '123456'
      ? {body: {ok: true}, status: 200}
      : {body: {id: 'two_factor', message: 'Two-factor code required.'}, status: 403})

    const response = await newClient({twoFactor: {onChallenge: () => '123456'}}).get('/account')

    expect(response.status).toBe(200)
    expect(attempts).toHaveLength(5)
    expect(attempts[4].twoFactorCode).toBe('123456')
  })

  it('does not replay a rejected 2FA code after network retries', {timeout: SLOW}, async () => {
    dropped = 3
    respond = () => ({body: {id: 'two_factor', message: 'Two-factor code required.'}, status: 403})

    await expect(newClient({twoFactor: {onChallenge: () => 'wrong'}}).get('/account'))
      .rejects.toBeInstanceOf(TwoFactorRequiredError)
    expect(attempts).toHaveLength(5)
  })
})
