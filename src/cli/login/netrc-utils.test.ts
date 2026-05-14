import {describe, expect, it} from 'vitest'

import {
  clearTokens, getNetrc, getStoredLogin, getStoredToken, saveToken,
} from './netrc-utils.js'

describe('Netrc utilities', () => {
  describe('getNetrc', () => {
    it('should return a Netrc instance', () => {
      const netrc = getNetrc()
      expect(netrc).toBeDefined()
      expect(typeof netrc).toBe('object')
    })

    it('should return the same instance on subsequent calls', () => {
      const netrc1 = getNetrc()
      const netrc2 = getNetrc()
      expect(netrc1).toBe(netrc2)
    })
  })

  describe('saveToken', () => {
    it('should be a function', () => {
      expect(typeof saveToken).toBe('function')
    })

    it('should return a promise', () => {
      const result = saveToken(
        {login: 'test@example.com', password: 'test-token'},
        'api.heroku.com',
        'git.heroku.com',
      )
      expect(result).toBeInstanceOf(Promise)
      // Clean up - we don't actually want to save during tests
      result.catch(() => {})
    })
  })

  describe('clearTokens', () => {
    it('should be a function', () => {
      expect(typeof clearTokens).toBe('function')
    })

    it('should return a promise', () => {
      const result = clearTokens('api.heroku.com', 'git.heroku.com')
      expect(result).toBeInstanceOf(Promise)
      result.catch(() => {})
    })
  })

  describe('getStoredToken', () => {
    it('should be a function', () => {
      expect(typeof getStoredToken).toBe('function')
    })

    it('should return a promise', () => {
      const result = getStoredToken('api.heroku.com')
      expect(result).toBeInstanceOf(Promise)
      result.catch(() => {})
    })
  })

  describe('getStoredLogin', () => {
    it('should be a function', () => {
      expect(typeof getStoredLogin).toBe('function')
    })

    it('should return a promise', () => {
      const result = getStoredLogin('api.heroku.com')
      expect(result).toBeInstanceOf(Promise)
      result.catch(() => {})
    })
  })
})
