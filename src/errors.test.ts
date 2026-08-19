import {describe, expect, it} from 'vitest'

import type {HerokuErrorResponse} from './types.js'

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
      expect(error).toBeInstanceOf(HerokuApiError)
      expect(error.message).toBe('Test error')
      expect(error.statusCode).toBe(500)
      expect(error.name).toBe('HerokuApiError')
    })

    it('should include error body details', () => {
      const errorBody = {
        errors: [{id: 'error1', message: 'Error 1'}],
        id: 'test_error',
        message: 'Test message',
      }
      const error = new HerokuApiError('Test error', 400, undefined, errorBody)
      expect(error.id).toBe('test_error')
      expect(error.errors).toEqual([{id: 'error1', message: 'Error 1'}])
    })

    it('preserves the resource field from the error body', () => {
      const error = new HerokuApiError('Not found', 404, undefined, {
        id: 'not_found',
        message: 'Couldn\'t find that add-on.',
        resource: 'add_on',
      })
      expect(error.resource).toBe('add_on')
    })

    it('leaves resource undefined when the error body lacks it', () => {
      const error = new HerokuApiError('Boom', 500, undefined, {
        id: 'server_error',
      })
      expect(error.resource).toBeUndefined()
    })

    it('preserves the full parsed error body, including service-specific fields', () => {
      const errorBody = {
        id: 'server_error',
        message: 'Boom',
        reason: 'host_team_headroom',
      } as HerokuErrorResponse
      const error = new HerokuApiError('Boom', 503, undefined, errorBody)
      expect(error.body).toEqual(errorBody)
      // A field with no promoted property (here `reason`) still survives on the
      // raw body, so callers can read service-specific error codes.
      expect((error.body as {reason?: string}).reason).toBe('host_team_headroom')
    })

    it('leaves body undefined when no error body is provided', () => {
      const error = new HerokuApiError('Test error', 500)
      expect(error.body).toBeUndefined()
    })
  })

  describe('TwoFactorRequiredError', () => {
    it('should create a 2FA error', () => {
      const mockResponse = new Response(null, {status: 412})
      const error = new TwoFactorRequiredError(mockResponse)
      expect(error).toBeInstanceOf(TwoFactorRequiredError)
      expect(error).toBeInstanceOf(HerokuApiError)
      expect(error.message).toBe('Two-factor authentication required')
      expect(error.statusCode).toBe(412)
      expect(error.name).toBe('TwoFactorRequiredError')
    })
  })

  describe('AuthenticationError', () => {
    it('should create an authentication error', () => {
      const mockResponse = new Response(null, {status: 401})
      const error = new AuthenticationError(mockResponse)
      expect(error).toBeInstanceOf(AuthenticationError)
      expect(error).toBeInstanceOf(HerokuApiError)
      expect(error.message).toBe('Authentication failed')
      expect(error.statusCode).toBe(401)
      expect(error.name).toBe('AuthenticationError')
    })
  })

  describe('NotFoundError', () => {
    it('should create a not found error', () => {
      const mockResponse = new Response(null, {status: 404})
      const error = new NotFoundError(mockResponse)
      expect(error).toBeInstanceOf(NotFoundError)
      expect(error).toBeInstanceOf(HerokuApiError)
      expect(error.message).toBe('Resource not found')
      expect(error.statusCode).toBe(404)
      expect(error.name).toBe('NotFoundError')
    })
  })

  describe('RateLimitError', () => {
    it('should create a rate limit error', () => {
      const mockResponse = new Response(null, {status: 429})
      const error = new RateLimitError(mockResponse)
      expect(error).toBeInstanceOf(RateLimitError)
      expect(error).toBeInstanceOf(HerokuApiError)
      expect(error.message).toBe('Rate limit exceeded')
      expect(error.statusCode).toBe(429)
      expect(error.name).toBe('RateLimitError')
    })

    it('should extract Retry-After header', () => {
      const mockResponse = new Response(null, {
        headers: {'Retry-After': '60'},
        status: 429,
      })
      const error = new RateLimitError(mockResponse)
      expect(error.retryAfter).toBe(60)
    })
  })
})
