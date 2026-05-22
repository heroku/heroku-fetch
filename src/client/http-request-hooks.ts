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
 * Create a beforeRequest hook that adds authentication and custom headers
 */
export function createBeforeRequestHook(
  getToken: () => Promise<string | undefined>,
  defaultAccept: string | undefined,
  customHeaders?: Record<string, string>,
  debug?: boolean,
): BeforeRequestHook {
  return async request => {
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

    // Add authorization header
    const token = await getToken()
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
      debugAuth('Authorization header added')
    }

    debugRequest('%s %s', request.method, request.url)
    if (debug) {
      const headers: Record<string, string> = {}
      // eslint-disable-next-line unicorn/no-array-for-each
      request.headers.forEach((value, key) => {
        headers[key] = value
      })

      debugRequest('Headers: %O', headers)
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
  return async (request, options, response) => {
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
