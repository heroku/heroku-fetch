import {createServer, type Server} from 'node:http'
import {type AddressInfo} from 'node:net'
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest'

import {HerokuApiClient} from './index.js'

describe('default token scoping (HEROKU_API_KEY)', () => {
  // The environment default token goes only to named Heroku services. A
  // `custom` client may target a host outside Heroku, so it authenticates only
  // with a token passed explicitly.
  let server: Server
  let baseUrl: string
  let receivedAuth: string | undefined
  const originalApiKey = process.env.HEROKU_API_KEY

  beforeEach(async () => {
    process.env.HEROKU_API_KEY = 'env-token'
    receivedAuth = undefined
    server = createServer((request, response) => {
      receivedAuth = request.headers.authorization
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
    if (originalApiKey === undefined) delete process.env.HEROKU_API_KEY
    else process.env.HEROKU_API_KEY = originalApiKey
    await new Promise<void>(resolve => {
      server.close(() => resolve())
    })
  })

  it('does not send HEROKU_API_KEY from a custom client with no token', async () => {
    await new HerokuApiClient({baseUrl, service: 'custom'}).get('/a')
    expect(receivedAuth).toBeUndefined()
  })

  it('treats an explicit undefined token on a custom client as no token', async () => {
    await new HerokuApiClient({baseUrl, service: 'custom', token: undefined}).get('/a')
    expect(receivedAuth).toBeUndefined()
  })

  it('does not send HEROKU_API_KEY when streaming from a custom client', async () => {
    await new HerokuApiClient({baseUrl, service: 'custom'}).stream('/a')
    expect(receivedAuth).toBeUndefined()
  })

  it('sends an explicit token from a custom client', async () => {
    await new HerokuApiClient({baseUrl, service: 'custom', token: 'explicit'}).get('/a')
    expect(receivedAuth).toBe('Bearer explicit')
  })

  it('sends an explicit token provider from a custom client', async () => {
    await new HerokuApiClient({baseUrl, service: 'custom', token: async () => 'provided'}).get('/a')
    expect(receivedAuth).toBe('Bearer provided')
  })

  it('reads HEROKU_API_KEY for a named service with no token', async () => {
    await new HerokuApiClient({baseUrl, service: 'platform'}).get('/a')
    expect(receivedAuth).toBe('Bearer env-token')
  })

  it('sends no Authorization header for a named service given an empty token', async () => {
    await new HerokuApiClient({baseUrl, service: 'platform', token: ''}).get('/a')
    expect(receivedAuth).toBeUndefined()
  })

  it('lets setOption add a token to a custom client', async () => {
    const client = new HerokuApiClient({baseUrl, service: 'custom'})
    client.setOption('token', 'later')
    await client.get('/a')
    expect(receivedAuth).toBe('Bearer later')
  })
})
