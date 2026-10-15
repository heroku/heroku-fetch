import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest'

import {getApiHost, getApiUrl} from './auth.js'

describe('Auth utilities', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment
    process.env = {...originalEnv}
    delete process.env.HEROKU_API_KEY
    delete process.env.HEROKU_HOST
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('getApiHost', () => {
    it('should return default api host', () => {
      const host = getApiHost()
      expect(host).toBe('api.heroku.com')
    })

    it('should return custom host from HEROKU_HOST environment variable', () => {
      process.env.HEROKU_HOST = 'api.custom.heroku.com'
      const host = getApiHost()
      expect(host).toBe('api.custom.heroku.com')
    })
  })

  describe('getApiUrl', () => {
    it('should return default api URL', () => {
      const url = getApiUrl()
      expect(url).toBe('https://api.heroku.com')
    })

    it('should return custom URL from HEROKU_HOST environment variable', () => {
      process.env.HEROKU_HOST = 'api.custom.heroku.com'
      const url = getApiUrl()
      expect(url).toBe('https://api.custom.heroku.com')
    })
  })
})
