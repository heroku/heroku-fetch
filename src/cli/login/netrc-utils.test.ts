import {expect} from 'chai'
import {describe, it} from 'mocha'

import {
  clearTokens, getNetrc, getStoredLogin, getStoredToken, saveToken,
} from './netrc-utils.js'

describe('Netrc utilities', () => {
  describe('getNetrc', () => {
    it('should return a Netrc instance', () => {
      const netrc = getNetrc()
      expect(netrc).to.exist
      expect(netrc).to.be.an('object')
    })

    it('should return the same instance on subsequent calls', () => {
      const netrc1 = getNetrc()
      const netrc2 = getNetrc()
      expect(netrc1).to.equal(netrc2)
    })
  })

  describe('saveToken', () => {
    it('should be a function', () => {
      expect(saveToken).to.be.a('function')
    })

    it('should return a promise', () => {
      const result = saveToken(
        {login: 'test@example.com', password: 'test-token'},
        'api.heroku.com',
        'git.heroku.com',
      )
      expect(result).to.be.instanceOf(Promise)
      // Clean up - we don't actually want to save during tests
      result.catch(() => {})
    })
  })

  describe('clearTokens', () => {
    it('should be a function', () => {
      expect(clearTokens).to.be.a('function')
    })

    it('should return a promise', () => {
      const result = clearTokens('api.heroku.com', 'git.heroku.com')
      expect(result).to.be.instanceOf(Promise)
      result.catch(() => {})
    })
  })

  describe('getStoredToken', () => {
    it('should be a function', () => {
      expect(getStoredToken).to.be.a('function')
    })

    it('should return a promise', () => {
      const result = getStoredToken('api.heroku.com')
      expect(result).to.be.instanceOf(Promise)
      result.catch(() => {})
    })
  })

  describe('getStoredLogin', () => {
    it('should be a function', () => {
      expect(getStoredLogin).to.be.a('function')
    })

    it('should return a promise', () => {
      const result = getStoredLogin('api.heroku.com')
      expect(result).to.be.instanceOf(Promise)
      result.catch(() => {})
    })
  })
})
