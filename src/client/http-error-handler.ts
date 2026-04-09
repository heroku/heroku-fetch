/**
 * Error Handler Module
 *
 * Handles parsing HTTP error responses and converting them to typed exceptions.
 */

import type {HerokuErrorResponse} from '../types.js'

import {debugError} from '../debug-loggers.js'
import {
  AuthenticationError,
  HerokuApiError,
  NotFoundError,
  RateLimitError,
  TwoFactorRequiredError,
} from '../errors.js'

/**
 * Parse and handle an error response from the API
 * Throws appropriate typed error based on status code
 */
export async function handleErrorResponse(response: Response): Promise<never> {
  let errorBody: HerokuErrorResponse | undefined

  try {
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      errorBody = await response.json() as HerokuErrorResponse
    }
  } catch {
    // Failed to parse error body, continue without it
  }

  debugError('Error response: %d %O', response.status, errorBody)

  // Check for 2FA error (can be 403 or 412)
  if (
    response.status === 412
    || (response.status === 403 && errorBody?.id === 'two_factor')
  ) {
    throw new TwoFactorRequiredError(response, errorBody)
  }

  switch (response.status) {
    case 401: {
      throw new AuthenticationError(response, errorBody)
    }

    case 404: {
      throw new NotFoundError(response, errorBody)
    }

    case 429: {
      throw new RateLimitError(response, errorBody)
    }

    default: {
      const message = errorBody?.message || `HTTP ${response.status}: ${response.statusText}`
      throw new HerokuApiError(message, response.status, response, errorBody)
    }
  }
}
