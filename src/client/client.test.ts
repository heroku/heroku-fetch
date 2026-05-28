import {describe, expect, it} from 'vitest'

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
      await expect(pending).rejects.toThrow()
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
      await expect(pending).rejects.toThrow()
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
