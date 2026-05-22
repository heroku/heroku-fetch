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
 * Get an undici Dispatcher that routes Node's fetch through an
 * `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`-aware proxy agent.
 *
 * Returns `undefined` when no proxy env var is set, so we don't
 * install a custom dispatcher that bypasses Node's global agent
 * (and the `http`/`https` interceptors that test libraries
 * intercept).
 *
 * Returns `undefined` when undici isn't loadable (e.g. on a non-Node
 * runtime like Bun that exposes `process.versions.node` but doesn't
 * ship undici); callers should skip the option in that case so ky
 * falls back to native fetch.
 *
 * ky forwards the `dispatcher` option through to the underlying
 * fetch — see https://github.com/sindresorhus/ky#proxy-support-nodejs.
 */
export async function getDefaultDispatcher(): Promise<undefined | unknown> {
  if (!hasProxyEnv()) {
    return undefined
  }

  try {
    // Dynamic import keeps undici out of browser bundles (the
    // package.json `browser` condition resolves this whole module
    // away in browser builds).
    const {EnvHttpProxyAgent} = await import('undici')
    return new EnvHttpProxyAgent()
  } catch (error) {
    debugRequest('undici not available; skipping dispatcher (%o)', error)
    return undefined
  }
}

function hasProxyEnv(): boolean {
  return Boolean(process.env.HTTP_PROXY
    || process.env.http_proxy
    || process.env.HTTPS_PROXY
    || process.env.https_proxy)
}
