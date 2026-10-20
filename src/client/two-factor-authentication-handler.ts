/**
 * Two-Factor Authentication Handler Module
 *
 * Handles detection and processing of 2FA challenges from the API.
 */

import type {HerokuErrorResponse, TwoFactorOptions} from '../types.js'

import {debugAuth, debugError} from '../debug-loggers.js'
import {logScrubbed} from '../redact.js'

/**
 * Check if a 403 response is a 2FA error by checking the error id
 */
export async function is2FAError(response: Response): Promise<boolean> {
  try {
    const clonedResponse = response.clone()
    const contentType = clonedResponse.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      const errorBody = await clonedResponse.json() as HerokuErrorResponse
      return errorBody.id === 'two_factor'
    }
  } catch {
    // Failed to parse, assume not a 2FA error
  }

  return false
}

/**
 * Handle a 2FA challenge by prompting for a code and retrying the request.
 *
 * The retry is sent through `retryThroughClient` — the client's own request
 * pipeline (proxy-aware fetch, auth, Accept, and Request-Id hooks) — so it is
 * routed and authenticated identically to the original request, rather than
 * going out through a bare `fetch` that would bypass all of that. The retried
 * response is returned to the caller's afterResponse chain, where the error,
 * Request-Id, warning, metadata, and consumer hooks process it.
 */
export async function handle2FAChallenge(
  request: Request,
  twoFactorOptions: TwoFactorOptions,
  twoFactorAttemptedRef: {value: boolean},
  retryThroughClient: (request: Request) => Promise<Response>,
): Promise<Response> {
  twoFactorAttemptedRef.value = true
  debugAuth('2FA challenge detected, invoking callback')

  try {
    const twoFactorCode = await twoFactorOptions.onChallenge()
    debugAuth('2FA code received, retrying request')

    // Retry the request with 2FA code
    const headers: Record<string, string> = {}
    // eslint-disable-next-line unicorn/no-array-for-each
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    headers['Heroku-Two-Factor-Code'] = twoFactorCode

    const retryRequest = new Request(request, {
      headers,
    })

    const retryResponse = await retryThroughClient(retryRequest)
    twoFactorAttemptedRef.value = false
    return retryResponse
  } catch (error) {
    twoFactorAttemptedRef.value = false
    await logScrubbed(debugError, '2FA retry failed: %O', error)
    throw error
  }
}
