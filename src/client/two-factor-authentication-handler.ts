/**
 * Two-Factor Authentication Handler Module
 *
 * Handles detection and processing of 2FA challenges from the API.
 */

import ky from 'ky'

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
 * Handle a 2FA challenge by prompting for a code and forcing a retry of the
 * request with the `Heroku-Two-Factor-Code` header attached.
 *
 * Returns ky's forced-retry marker (`ky.retry`) so ky re-issues the request
 * through this same client — reusing its fetch, auth, and the original
 * request's per-call timeout and abort signal — and runs the retried response
 * back through the full afterResponse chain (error handling, Request-Id,
 * warnings, metadata, and consumer hooks) exactly once. The forced retry counts
 * against `retry.limit` and is observable in `beforeRetry` as a
 * `ForceRetryError`.
 */
export async function handle2FAChallenge(
  request: Request,
  twoFactorOptions: TwoFactorOptions,
): Promise<ReturnType<typeof ky.retry>> {
  debugAuth('2FA challenge detected, invoking callback')

  try {
    const twoFactorCode = await twoFactorOptions.onChallenge()
    debugAuth('2FA code received, retrying request')

    const headers = new Headers(request.headers)
    headers.set('Heroku-Two-Factor-Code', twoFactorCode)

    return ky.retry({code: 'TWO_FACTOR', request: new Request(request, {headers})})
  } catch (error) {
    await logScrubbed(debugError, '2FA retry failed: %O', error)
    throw error
  }
}
