/**
 * Default providers for browser environments
 * These are minimal since browsers don't have file system or CLI access
 */

import type {TokenProvider, TwoFactorOptions} from '../types.js'

/**
 * Get default token provider for browsers (none - must be explicitly provided)
 */
export function getDefaultTokenProvider(): TokenProvider | undefined {
  return undefined
}

/**
 * Get default 2FA handler for browsers (none - must be explicitly provided)
 */
export function getDefaultTwoFactorOptions(): TwoFactorOptions | undefined {
  return undefined
}

/**
 * Get a fetch implementation suitable for the browser.
 *
 * Returns the native fetch unchanged. Browsers handle User-Agent
 * themselves and route through their own proxy stack.
 */
export async function getDefaultFetch(): Promise<typeof fetch> {
  return fetch
}
