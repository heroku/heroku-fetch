/**
 * Two-Factor Authentication Handler Module
 *
 * Handles detection and processing of 2FA challenges from the API.
 */

import ky from 'ky'

import type {HerokuErrorResponse, TwoFactorOptions} from '../types.js'

import {debugAuth, debugError} from '../debug-loggers.js'

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
 * Handle a 2FA challenge by prompting for a code and retrying the request
 */
export async function handle2FAChallenge(
  request: Request,
  twoFactorOptions: TwoFactorOptions,
  twoFactorAttemptedRef: {value: boolean},
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

    const retryResponse = await ky(retryRequest)
    twoFactorAttemptedRef.value = false
    return retryResponse
  } catch (error) {
    twoFactorAttemptedRef.value = false
    debugError('2FA retry failed: %O', error)
    throw error
  }
}
