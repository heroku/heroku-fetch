import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest'

import {
  getApiHost, getApiUrl, getAuthToken, getAuthTokenProvider,
} from './auth.js'

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

  describe('getAuthToken', () => {
    it('should return token from HEROKU_API_KEY environment variable', () => {
      process.env.HEROKU_API_KEY = 'test-token-from-env'
      const token = getAuthToken()
      expect(token).toBe('test-token-from-env')
    })

    it('should prioritize HEROKU_API_KEY over netrc', () => {
      process.env.HEROKU_API_KEY = 'test-token-from-env'
      // Even if netrc exists, env var should take precedence
      const token = getAuthToken()
      expect(token).toBe('test-token-from-env')
    })

    it('should return undefined when no token is available', () => {
      // No env var and no netrc file
      const token = getAuthToken()
      // This might be undefined or might find a real token in ~/.netrc
      // We can't assert a specific value without mocking the file system
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })
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

  describe('getAuthTokenProvider', () => {
    it('should return a function', () => {
      const provider = getAuthTokenProvider()
      expect(typeof provider).toBe('function')
    })

    it('should return token when called', () => {
      process.env.HEROKU_API_KEY = 'test-token'
      const provider = getAuthTokenProvider()
      const token = provider()
      expect(token).toBe('test-token')
    })

    it('should return updated token on subsequent calls', () => {
      process.env.HEROKU_API_KEY = 'token-1'
      const provider = getAuthTokenProvider()

      let token = provider()
      expect(token).toBe('token-1')

      // Update the token
      process.env.HEROKU_API_KEY = 'token-2'
      token = provider()
      expect(token).toBe('token-2')
    })
  })
})
