import {createServer, type Server, type ServerResponse} from 'node:http'
import {type AddressInfo} from 'node:net'
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest'

import {HerokuApiClient} from './index.js'

const INVALID_TIMEOUT = /timeout must be a number of milliseconds from 1 to 2147483647, or false for no timeout/

const timeoutOf = (c: HerokuApiClient) => (c as unknown as {options: {timeout: unknown}}).options.timeout

describe('timeout', () => {
  // The server waits `delay` ms before sending headers, then streams a second
  // chunk after `bodyDelay` ms, so tests can time out either phase.
  let server: Server
  let baseUrl: string
  let delay: number
  let bodyDelay: number

  beforeEach(async () => {
    delay = 0
    bodyDelay = 0
    const respond = (response: ServerResponse) => {
      response.writeHead(200, {'Content-Type': 'text/plain'})
      response.write('a')
      setTimeout(() => response.end('b'), bodyDelay)
    }

    server = createServer((_request, response) => {
      setTimeout(() => respond(response), delay)
    })
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const {port} = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => {
      server.close(() => resolve())
    })
  })

  const client = (timeout?: false | number) => new HerokuApiClient({baseUrl, service: 'custom', timeout})

  it('times out a response that starts later than the client timeout', async () => {
    delay = 200
    await expect(client(50).get('/a')).rejects.toMatchObject({name: 'TimeoutError'})
  })

  it('uses the per-request timeout over the client timeout', async () => {
    delay = 200
    await expect(client(5000).get('/a', {timeout: 50})).rejects.toMatchObject({name: 'TimeoutError'})
    await expect(client(50).get('/a', {timeout: 5000})).resolves.toBeInstanceOf(Response)
  })

  it('disables the timeout with false on the client or the request', async () => {
    delay = 100
    await expect(client(false).get('/a')).resolves.toBeInstanceOf(Response)
    await expect(client(20).get('/a', {timeout: false})).resolves.toBeInstanceOf(Response)
    await expect(client(20).stream('/a', {timeout: false})).resolves.toBeInstanceOf(Response)
  })

  it('does not limit reading the body of a returned response', async () => {
    bodyDelay = 150
    const response = await client(50).stream('/a')
    await expect(response.text()).resolves.toBe('ab')
  })

  it('keeps the 30s default when timeout is undefined, including via setOption', () => {
    // ky's own default is 10s. An explicit `undefined` must not erase ours.
    const c = new HerokuApiClient({baseUrl, service: 'custom', timeout: undefined})
    expect(timeoutOf(c)).toBe(30_000)
    c.setOption('timeout', 5000)
    c.setOption('timeout', undefined)
    expect(timeoutOf(c)).toBe(30_000)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648, '5000', null])('rejects %s where it is set', value => {
    const bad = value as unknown as number
    expect(() => client(bad)).toThrow(INVALID_TIMEOUT)
    expect(() => client().setOption('timeout', bad)).toThrow(INVALID_TIMEOUT)
  })

  it('accepts the largest timeout setTimeout can hold', () => {
    expect(timeoutOf(client(2_147_483_647))).toBe(2_147_483_647)
  })

  describe('a zero timeout', () => {
    it('throws from the constructor', () => {
      expect(() => client(0)).toThrow(INVALID_TIMEOUT)
    })

    it('throws from setOption', () => {
      expect(() => client().setOption('timeout', 0)).toThrow(INVALID_TIMEOUT)
    })

    it('rejects a request or stream that passes it', async () => {
      await expect(client().get('/a', {timeout: 0})).rejects.toThrow(INVALID_TIMEOUT)
      await expect(client().stream('/a', {timeout: 0})).rejects.toThrow(INVALID_TIMEOUT)
    })
  })

  it('applies a timeout set later with setOption', async () => {
    delay = 200
    const c = client(5000)
    c.setOption('timeout', 50)
    await expect(c.get('/a')).rejects.toMatchObject({name: 'TimeoutError'})
  })
})
