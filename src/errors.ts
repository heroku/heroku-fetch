import type {HerokuErrorResponse} from './types.js'

export class HerokuApiError extends Error {
  public errors?: Array<{id: string; message: string}>
  public id?: string
  public resource?: string
  public response?: Response
  public statusCode: number

  constructor(message: string, statusCode: number, response?: Response, errorBody?: HerokuErrorResponse) {
    super(message)
    this.name = 'HerokuApiError'
    this.statusCode = statusCode
    this.response = response

    if (errorBody) {
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

export class RateLimitError extends HerokuApiError {
  public retryAfter?: number

  constructor(response: Response, errorBody?: HerokuErrorResponse) {
    super('Rate limit exceeded', 429, response, errorBody)
    this.name = 'RateLimitError'

    const retryAfter = response.headers.get('Retry-After')
    if (retryAfter) {
      this.retryAfter = Number.parseInt(retryAfter, 10)
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitError)
    }
  }
}
