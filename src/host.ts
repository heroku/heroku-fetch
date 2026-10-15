/**
 * API host/URL utilities for the Heroku API — resolve the API host and base
 * URL from `HEROKU_HOST`, falling back to the public defaults.
 *
 * Note: heroku-fetch does not read stored credentials. Credential storage and
 * retrieval (netrc, native credential stores) lives in
 * @heroku/heroku-credential-manager; supply a token to the client explicitly.
 */

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
