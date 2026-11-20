import type {HerokuErrorResponse} from './types.js'

export class HerokuApiError extends Error {
  /**
   * The parsed JSON error body as the service returned it, when the response
   * carried a JSON content-type. Unlike the promoted `id` / `errors` /
   * `resource` fields, this preserves the whole body — including
   * service-specific fields (e.g. a machine `reason` on an admin endpoint) that
   * don't have a dedicated property. `undefined` when the body was absent or not
   * JSON. Once read here, the streamed `response` body is consumed.
   */
  public body?: HerokuErrorResponse
  public errors?: Array<{id: string; message: string}>
  public id?: string
  public resource?: string
  public response?: Response
  public statusCode: number

  constructor(fallbackMessage: string, statusCode: number, response?: Response, errorBody?: HerokuErrorResponse) {
    super(errorBody?.message || fallbackMessage)
    this.name = 'HerokuApiError'
    this.statusCode = statusCode
    this.response = response

    if (errorBody) {
      this.body = errorBody
      this.id = errorBody.id
      this.errors = errorBody.errors
      this.resource = errorBody.resource
    }

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HerokuApiError)
    }
  }
}

export class TwoFactorRequiredError extends HerokuApiError {
  constructor(response: Response, errorBody?: HerokuErrorResponse) {
    super('Two-factor authentication required', response.status, response, errorBody)
    this.name = 'TwoFactorRequiredError'

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TwoFactorRequiredError)
    }
  }
}

export class AuthenticationError extends HerokuApiError {
  constructor(response: Response, errorBody?: HerokuErrorResponse) {
    super('Authentication failed', 401, response, errorBody)
    this.name = 'AuthenticationError'

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthenticationError)
    }
  }
}

export class NotFoundError extends HerokuApiError {
  constructor(response: Response, errorBody?: HerokuErrorResponse) {
    super('Resource not found', 404, response, errorBody)
    this.name = 'NotFoundError'

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotFoundError)
    }
  }
}

// All three HTTP-date formats (IMF-fixdate, RFC 850, asctime) start with a day
// name. Requiring one keeps Date.parse's lenient fallbacks, which read "1.5" or
// "-5" as calendar dates, from being taken as a Retry-After date.
const HTTP_DATE_PREFIX = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s/i

/**
 * Seconds to wait from a `Retry-After` value: a delta in whole seconds, or an
 * HTTP-date converted to seconds from `now` (rounded up, never negative).
 * Returns `undefined` for a missing or unrecognized value.
 */
export function parseRetryAfter(value: null | string, now: number = Date.now()): number | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined

  if (/^\d+$/.test(trimmed)) return Number(trimmed)

  if (!HTTP_DATE_PREFIX.test(trimmed)) return undefined
  const date = Date.parse(trimmed)
  if (Number.isNaN(date)) return undefined

  return Math.max(0, Math.ceil((date - now) / 1000))
}

export class RateLimitError extends HerokuApiError {
  /** Seconds to wait before retrying, from `Retry-After`; `undefined` when absent or unrecognized. */
  public retryAfter?: number

  constructor(response: Response, errorBody?: HerokuErrorResponse) {
    super('Rate limit exceeded', 429, response, errorBody)
    this.name = 'RateLimitError'

    this.retryAfter = parseRetryAfter(response.headers.get('Retry-After'))

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitError)
    }
  }
}
