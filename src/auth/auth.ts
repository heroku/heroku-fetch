/**
 * Authentication utilities for Heroku API
 * Handles token retrieval from environment variables and netrc file
 */

import {Netrc} from 'netrc-parser'

// Defer netrc instantiation to avoid eager .netrc file operations at module load time
let _netrc: Netrc | undefined

function getNetrc(): Netrc {
  if (!_netrc) {
    _netrc = new Netrc()
  }

  return _netrc
}

/**
 * Get the Heroku API token from environment variable or netrc file
 *
 * Priority:
 * 1. HEROKU_API_KEY environment variable
 * 2. ~/.netrc file (uses api.heroku.com or HEROKU_HOST if set)
 *
 * @returns The API token or undefined if not found
 *
 * @example
 * ```typescript
 * import { getAuthToken, HerokuApiClient } from '@heroku/api-client';
 *
 * const token = getAuthToken();
 * const client = new HerokuApiClient({
 *   service: 'platform',
 *   token,
 * });
 * ```
 */
export function getAuthToken(): string | undefined {
  // Check environment variable first
  let token = process.env.HEROKU_API_KEY

  if (!token) {
    // Fall back to netrc
    const netrc = getNetrc()
    netrc.loadSync()
    const apiHost = getApiHost()
    token = netrc.machines[apiHost]?.password
  }

  return token
}

/**
 * Get the API host from environment or default
 *
 * @returns The API host (default: 'api.heroku.com')
 *
 * @example
 * ```typescript
 * const host = getApiHost();
 * // Returns 'api.heroku.com' or value of HEROKU_HOST env var
 * ```
 */
export function getApiHost(): string {
  return process.env.HEROKU_HOST || 'api.heroku.com'
}

/**
 * Get the full API URL from environment or default
 *
 * @returns The API URL (default: 'https://api.heroku.com')
 *
 * @example
 * ```typescript
 * const url = getApiUrl();
 * // Returns 'https://api.heroku.com' or https://{HEROKU_HOST}
 * ```
 */
export function getApiUrl(): string {
  const host = getApiHost()
  return `https://${host}`
}

/**
 * Create a token provider function for use with HerokuApiClient
 * This is useful when you want the token to be fetched dynamically
 *
 * @returns A function that returns the current auth token
 *
 * @example
 * ```typescript
 * import { getAuthTokenProvider, HerokuApiClient } from '@heroku/api-client';
 *
 * const client = new HerokuApiClient({
 *   service: 'platform',
 *   token: getAuthTokenProvider(),
 * });
 * ```
 */
export function getAuthTokenProvider(): () => string | undefined {
  return () => getAuthToken()
}
