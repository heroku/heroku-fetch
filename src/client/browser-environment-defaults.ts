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
 * Get a default dispatcher for the browser.
 *
 * Always `undefined`. Browsers route through their own proxy stack
 * (OS / browser settings), and the `dispatcher` option is undici-
 * specific anyway — passing it would be ignored or could surface as
 * a TypeError in some bundlers.
 */
export async function getDefaultDispatcher(): Promise<undefined> {
  return undefined
}
