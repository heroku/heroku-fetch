import {expect} from 'chai'
import {describe, it} from 'mocha'

import {
  AuthenticationError,
  HerokuApiError,
  NotFoundError,
  RateLimitError,
  TwoFactorRequiredError,
} from './errors.js'

describe('Error classes', () => {
  describe('HerokuApiError', () => {
    it('should create an error with message and status code', () => {
      const error = new HerokuApiError('Test error', 500)
      expect(error).to.be.instanceOf(HerokuApiError)
      expect(error.message).to.equal('Test error')
      expect(error.statusCode).to.equal(500)
      expect(error.name).to.equal('HerokuApiError')
    })

    it('should include error body details', () => {
      const errorBody = {
        errors: [{id: 'error1', message: 'Error 1'}],
        id: 'test_error',
        message: 'Test message',
      }
      const error = new HerokuApiError('Test error', 400, undefined, errorBody)
      expect(error.id).to.equal('test_error')
      expect(error.errors).to.deep.equal([{id: 'error1', message: 'Error 1'}])
    })
  })

  describe('TwoFactorRequiredError', () => {
    it('should create a 2FA error', () => {
      const mockResponse = new Response(null, {status: 412})
      const error = new TwoFactorRequiredError(mockResponse)
      expect(error).to.be.instanceOf(TwoFactorRequiredError)
      expect(error).to.be.instanceOf(HerokuApiError)
      expect(error.message).to.equal('Two-factor authentication required')
      expect(error.statusCode).to.equal(412)
      expect(error.name).to.equal('TwoFactorRequiredError')
    })
  })

  describe('AuthenticationError', () => {
    it('should create an authentication error', () => {
      const mockResponse = new Response(null, {status: 401})
      const error = new AuthenticationError(mockResponse)
      expect(error).to.be.instanceOf(AuthenticationError)
      expect(error).to.be.instanceOf(HerokuApiError)
      expect(error.message).to.equal('Authentication failed')
      expect(error.statusCode).to.equal(401)
      expect(error.name).to.equal('AuthenticationError')
    })
  })

  describe('NotFoundError', () => {
    it('should create a not found error', () => {
      const mockResponse = new Response(null, {status: 404})
      const error = new NotFoundError(mockResponse)
      expect(error).to.be.instanceOf(NotFoundError)
      expect(error).to.be.instanceOf(HerokuApiError)
      expect(error.message).to.equal('Resource not found')
      expect(error.statusCode).to.equal(404)
      expect(error.name).to.equal('NotFoundError')
    })
  })

  describe('RateLimitError', () => {
    it('should create a rate limit error', () => {
      const mockResponse = new Response(null, {status: 429})
      const error = new RateLimitError(mockResponse)
      expect(error).to.be.instanceOf(RateLimitError)
      expect(error).to.be.instanceOf(HerokuApiError)
      expect(error.message).to.equal('Rate limit exceeded')
      expect(error.statusCode).to.equal(429)
      expect(error.name).to.equal('RateLimitError')
    })

    it('should extract Retry-After header', () => {
      const mockResponse = new Response(null, {
        headers: {'Retry-After': '60'},
        status: 429,
      })
      const error = new RateLimitError(mockResponse)
      expect(error.retryAfter).to.equal(60)
    })
  })
})
