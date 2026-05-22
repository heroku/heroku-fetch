/**
 * Default providers for Node.js environments
 * These use file system (netrc) and CLI utilities
 */

import type {TokenProvider, TwoFactorOptions} from '../types.js'

import {debugRequest} from '../debug-loggers.js'

/**
 * Get default token provider for Node.js (uses netrc/env vars)
 */
export function getDefaultTokenProvider(): TokenProvider {
  return async () => {
    const {getAuthToken} = await import('../auth/auth.js')
    const token = getAuthToken()
    if (!token) {
      throw new Error('No authentication token found. Please set HEROKU_API_KEY or run: heroku login')
    }

    return token
  }
}

/**
 * Get default 2FA handler for Node.js (uses CLI prompts)
 */
export function getDefaultTwoFactorOptions(): TwoFactorOptions {
  return {
    async onChallenge() {
      const {cliTwoFactorPrompt} = await import('../cli/cli-two-factor-prompt.js')
      return cliTwoFactorPrompt()
    },
  }
}

/**
 * Get a fetch implementation suitable for Node.
 *
 * Wraps the global fetch to route through `undici.EnvHttpProxyAgent`
 * when one of `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` is set, so
 * proxy support "just works" for both `HerokuApiClient` and
 * downstream callers that use this fetch directly. Returns the
 * native fetch unchanged if undici can't be loaded (e.g. on a
 * non-Node runtime that exposes `process.versions.node`, like Bun).
 */
export async function getDefaultFetch(): Promise<typeof fetch> {
  let dispatcher: unknown
  try {
    // undici is a Node built-in (no static types in this package's
    // dep tree); the dynamic import keeps it out of browser bundles.
    // @ts-expect-error — module resolution skips undici intentionally
    // eslint-disable-next-line import/no-unresolved
    const {EnvHttpProxyAgent} = await import('undici')
    dispatcher = new EnvHttpProxyAgent()
  } catch (error) {
    debugRequest('undici not available; using native fetch (%o)', error)
    return fetch
  }

  return (input, init) => fetch(input, {...init, dispatcher} as never)
}
