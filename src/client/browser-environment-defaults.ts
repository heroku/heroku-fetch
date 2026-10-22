/**
 * Default providers for browser environments
 * These are minimal since browsers don't have file system or CLI access
 */

import type {FetchLike, TokenProvider, TwoFactorOptions} from '../types.js'

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
 * The `User-Agent` comment for browsers: none. Browsers expose no reliable
 * platform/runtime token (and forbid overriding `User-Agent` on `fetch`
 * anyway), so a browser `User-Agent` degrades to the bare `<name>/<version>`.
 * Mirrors the Node `getUserAgentComment()` so the client can call it uniformly.
 */
export function getUserAgentComment(): string {
  return ''
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

/**
 * Get a default `fetch` for the browser: the global `fetch`, with no
 * dispatcher. Browsers route through their own proxy stack, so there is
 * nothing to pair. Mirrors the Node `getDefaultFetch()` so consumers can call
 * it uniformly across environments.
 *
 * Bound to `globalThis` because the browser `fetch` is a WebIDL method that
 * brand-checks its receiver: a detached reference (`const f = fetch; f(...)`)
 * throws `Illegal invocation`, and consumers call this returned reference
 * detached.
 */
export async function getDefaultFetch(): Promise<FetchLike> {
  return globalThis.fetch.bind(globalThis)
}
