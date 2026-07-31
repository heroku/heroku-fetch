/**
 * HTTP Hooks Module
 *
 * Factory functions for creating beforeRequest and afterResponse hooks
 * used by the ky HTTP client.
 */

import type {AfterResponseHook, BeforeRequestHook} from 'ky'

import type {TwoFactorOptions} from '../types.js'

import {debugAuth, debugRequest, debugResponse} from '../debug-loggers.js'
import {handleErrorResponse} from './http-error-handler.js'
import {handle2FAChallenge, is2FAError} from './two-factor-authentication-handler.js'

/**
 * Headers whose values must never appear in debug output. Compared
 * case-insensitively. Mirrors the redaction in http-call so tokens
 * aren't leaked when `debug` is enabled.
 */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'heroku-two-factor-code',
  'proxy-authorization',
  'x-addon-sso',
])

/**
 * Build a plain object of a request's headers with sensitive values
 * replaced by `[REDACTED]`, safe for debug logging.
 */
function redactHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  // eslint-disable-next-line unicorn/no-array-for-each
  headers.forEach((value, key) => {
    result[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value
  })
  return result
}

/**
 * Create a beforeRequest hook that adds authentication and custom headers
 */
export function createBeforeRequestHook(
  getToken: () => Promise<string | undefined>,
  defaultAccept: string | undefined,
  customHeaders?: Record<string, string>,
  debug?: boolean,
): BeforeRequestHook {
  return async ({request}) => {
    // Apply the service's default Accept header when the caller
    // hasn't set one. Services that don't declare one (e.g. `custom`)
    // skip this entirely.
    if (defaultAccept && !request.headers.has('Accept')) {
      request.headers.set('Accept', defaultAccept)
    }

    // Add custom headers from options
    if (customHeaders) {
      for (const [key, value] of Object.entries(customHeaders)) {
        request.headers.set(key, value)
      }
    }

    // Add authorization header.
    //
    // We deliberately don't strip this on cross-origin redirects: the
    // underlying fetch implementation does it for us. Per the WHATWG
    // Fetch spec, `Authorization` (along with `Cookie`,
    // `Proxy-Authorization`, and `Host`) is dropped before following a
    // redirect to a different origin. Note this only covers those
    // spec'd headers — if we ever add a custom sensitive header (e.g.
    // `x-addon-sso`), fetch will NOT strip it and we'd need to handle
    // that ourselves.
    const token = await getToken()
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
      debugAuth('Authorization header added')
    }

    debugRequest('%s %s', request.method, request.url)
    if (debug) {
      debugRequest('Headers: %O', redactHeaders(request.headers))
    }
  }
}

/**
 * Create an afterResponse hook that handles 2FA challenges and errors
 */
export function createAfterResponseHook(
  twoFactorOptions: TwoFactorOptions | undefined,
  twoFactorAttemptedRef: {value: boolean},
): AfterResponseHook {
  return async ({request, response}) => {
    debugResponse('%s %s -> %d', request.method, request.url, response.status)

    // Handle 2FA challenge (can be 403 or 412)
    const is2FAChallenge = response.status === 412
      || (response.status === 403 && await is2FAError(response))

    if (is2FAChallenge && twoFactorOptions && !twoFactorAttemptedRef.value) {
      return handle2FAChallenge(request, twoFactorOptions, twoFactorAttemptedRef)
    }

    // Handle errors
    if (!response.ok) {
      await handleErrorResponse(response)
    }

    return response
  }
}
