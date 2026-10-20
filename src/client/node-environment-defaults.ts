/**
 * Default providers for Node.js environments
 */

import type {FetchLike, TokenProvider, TwoFactorOptions} from '../types.js'

import {debugRequest} from '../debug-loggers.js'
import {logScrubbed} from '../redact.js'

/**
 * A fetch `init` that also carries an undici `dispatcher`. The DOM `RequestInit`
 * type has no `dispatcher` field, so this intersection is how we hand undici's
 * `fetch` the proxy dispatcher without scattering casts at each call site.
 */
type DispatchInit = NonNullable<Parameters<typeof fetch>[1]> & {dispatcher?: unknown}

/**
 * Get default token provider for Node.js (reads the HEROKU_API_KEY env var)
 *
 * heroku-fetch does not read stored credentials. To authenticate with
 * credentials saved by the Heroku CLI, resolve a token with the
 * heroku-credential-manager package and pass it to the client explicitly.
 *
 * When HEROKU_API_KEY is unset this returns `undefined`, so the request is sent
 * with no `Authorization` header rather than failing eagerly — endpoints that
 * need no auth still work, and endpoints that do get a server 401 surfaced as
 * `AuthenticationError`.
 */
export function getDefaultTokenProvider(): TokenProvider {
  return () => process.env.HEROKU_API_KEY
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
 * Get a `fetch` that is already paired with the proxy dispatcher from
 * `getDefaultDispatcher()`, drawn from the **same undici copy**.
 *
 * This exists because of a cross-undici-version trap: `getDefaultDispatcher()`
 * builds its `EnvHttpProxyAgent` from the npm `undici` this package depends on
 * (v8), but Node's built-in global `fetch` is backed by a *different* bundled
 * undici (v6 on Node 22) whose dispatcher handler interface is incompatible.
 * Handing an npm-undici dispatcher to global `fetch` fails
 * (`InvalidArgumentError: invalid onRequestStart method`). So the dispatcher
 * must be driven by undici's *own* `fetch`, and because the brand check on
 * `Request` is per-copy, a `Request` built by the global constructor isn't
 * recognized by undici's `fetch` and has to be decomposed into `(url, init)`.
 *
 * This function hides all of that: callers get a plain `FetchLike`.
 * - No proxy env var set → the global `fetch` (no dispatcher needed; it is the
 *   one case that already works).
 * - Proxy set → undici's `fetch` carrying the dispatcher, decomposing any
 *   `Request` input first.
 * - undici not loadable (e.g. Bun) → the global `fetch`, unproxied.
 */
export async function getDefaultFetch(): Promise<FetchLike> {
  const dispatcher = await getDefaultDispatcher()
  if (!dispatcher) {
    return (input, init) => fetch(input, init)
  }

  try {
    const {fetch: undiciFetch} = await import('undici')
    return (input, init) => fetchThroughDispatcher(undiciFetch as unknown as FetchLike, dispatcher, input, init)
  } catch (error) {
    await logScrubbed(debugRequest, 'undici fetch not available; using global fetch without proxy (%o)', error)
    return (input, init) => fetch(input, init)
  }
}

/**
 * Get an undici Dispatcher that routes requests through an
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
 * WARNING: the returned dispatcher comes from the npm `undici` this package
 * depends on and must be driven by that same undici's `fetch` — NOT Node's
 * built-in global `fetch`, which bundles a different, incompatible undici and
 * throws `invalid onRequestStart method`. Most callers should use
 * `getDefaultFetch()` instead, which pairs the two correctly and returns a
 * ready-to-use `fetch`.
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
    await logScrubbed(debugRequest, 'undici not available; skipping dispatcher (%o)', error)
    return undefined
  }
}

function hasProxyEnv(): boolean {
  return Boolean(process.env.HTTP_PROXY
    || process.env.http_proxy
    || process.env.HTTPS_PROXY
    || process.env.https_proxy)
}

/**
 * Drive undici's `fetch` with a dispatcher from the same undici copy.
 *
 * A `string` / `URL` input is forwarded as-is. A `Request` input may have been
 * built by the global constructor (a different undici copy), which undici's
 * `fetch` won't recognize, so it is decomposed into `(url, init)`. The body is
 * buffered — the Heroku API requests this transport sends carry small JSON
 * payloads, not streamed uploads. An explicit `init` wins over the Request's
 * own fields (matching `fetch` semantics); the dispatcher is always applied.
 */
async function fetchThroughDispatcher(
  undiciFetch: FetchLike,
  dispatcher: unknown,
  input: Request | string | URL,
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  if (typeof input === 'string' || input instanceof URL) {
    const withDispatcher: DispatchInit = {...init, dispatcher}
    return undiciFetch(input, withDispatcher)
  }

  const headers: Record<string, string> = {}
  // Headers isn't iterable under the project's ES2020+DOM lib (no DOM.Iterable),
  // so forEach is the available copy idiom here.
  // eslint-disable-next-line unicorn/no-array-for-each
  input.headers.forEach((value, key) => {
    headers[key] = value
  })

  const hasBody = input.method !== 'GET' && input.method !== 'HEAD'
  const withDispatcher: DispatchInit = {
    body: hasBody ? await input.arrayBuffer() : undefined,
    headers,
    method: input.method,
    redirect: input.redirect,
    signal: input.signal,
    ...init,
    dispatcher,
  }
  return undiciFetch(input.url, withDispatcher)
}
