/**
 * HTTP Hooks Module
 *
 * Factory functions for creating beforeRequest and afterResponse hooks
 * used by the ky HTTP client.
 */

import type {AfterResponseHook, BeforeRequestHook} from 'ky'

import type {ResponseMetadata, TwoFactorOptions} from '../types.js'

import {debugAuth, debugRequest, debugResponse} from '../debug-loggers.js'
import {logScrubbed} from '../redact.js'
import {handleErrorResponse} from './http-error-handler.js'
import {REQUEST_ID_HEADER, type RequestIdStore} from './request-id.js'
import {handle2FAChallenge, is2FAError} from './two-factor-authentication-handler.js'

/**
 * Upper bound on the per-client set of already-surfaced warnings. Dedupe stays
 * a sliding window of the most recent warnings rather than the client's entire
 * lifetime, so a long-lived client with many distinct warnings can't grow the
 * set without limit.
 */
const MAX_SHOWN_WARNINGS = 256

/**
 * Create a beforeRequest hook that attaches the bearer token.
 *
 * Static headers (the `Accept` default and any consumer-supplied custom
 * headers) are set on the ky instance via its `headers` option, so ky merges
 * them with per-call headers (per-call winning) before this hook runs. Only the
 * token is resolved here, since it comes from an async provider and so can't be
 * a static instance header.
 */
export function createBeforeRequestHook(
  getToken: () => Promise<string | undefined>,
  debug?: boolean,
): BeforeRequestHook {
  return async ({request}) => {
    // Add authorization header.
    //
    // We deliberately don't strip this on cross-origin redirects: the
    // underlying fetch implementation does it for us. Per the WHATWG
    // Fetch spec, `Authorization` (along with `Cookie`,
    // `Proxy-Authorization`, and `Host`) is dropped before following a
    // redirect to a different origin. Note this only covers those
    // spec'd headers — if we ever add a custom sensitive header (e.g.
    // `x-addon-sso`), fetch will NOT strip it and we'd need to handle
    // that ourselves.
    const token = await getToken()
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
      debugAuth('Authorization header added')
    }

    debugRequest('%s %s', request.method, request.url)
    if (debug) {
      await logScrubbed(debugRequest, 'Headers: %O', request.headers)
    }
  }
}

/**
 * Create a beforeRequest hook that sets the accumulating `Request-Id`
 * correlation header (with the 7KB overflow guard).
 */
export function createRequestIdBeforeHook(store: RequestIdStore): BeforeRequestHook {
  return ({request}) => {
    request.headers.set(REQUEST_ID_HEADER, store.nextHeaderValue())
  }
}

/**
 * Create an afterResponse hook that feeds the server's echoed `Request-Id`s
 * back into the accumulating store so later requests carry the full chain.
 *
 * Runs only on the success path: it is registered after the error-handling
 * hook, which throws on a non-ok response and stops the chain.
 */
export function createRequestIdAfterHook(store: RequestIdStore): AfterResponseHook {
  return ({response}) => {
    const header = response.headers.get(REQUEST_ID_HEADER)
    if (header) {
      store.track(...splitRequestIds(header))
    }
  }
}

/**
 * Split a `Request-Id` header into its individual ids, trimming surrounding
 * whitespace and dropping empty segments, so a server that joins with `", "`
 * (or leaves a trailing comma) doesn't produce padded or empty ids.
 */
function splitRequestIds(header: string): string[] {
  return header.split(',').map(id => id.trim()).filter(Boolean)
}

/**
 * Create an afterResponse hook that surfaces server warning headers to the
 * user via the injected `warn` callback, deduped per client.
 *
 * Reads `x-heroku-warning` first, then `warning-message`. Each value is
 * normalized (a leading `warning:` prefix stripped, then trimmed) and emitted
 * at most once per unique normalized string over the client's lifetime.
 *
 * Note: the Fetch `Headers` API collapses repeated values of a header into one
 * comma-joined string, so this reads a single string per header.
 */
export function createWarningAfterHook(
  shownWarnings: Set<string>,
  warn: (message: string) => void,
): AfterResponseHook {
  return ({response}) => {
    const normalized = normalizedWarning(response)
    // The `has` check gates the `warn()` emission below, not the set insertion
    // (which is already idempotent): it's what makes a repeat warning silent.
    if (!normalized || shownWarnings.has(normalized)) return
    if (shownWarnings.size >= MAX_SHOWN_WARNINGS) {
      // Bound memory on a long-lived client: evict the oldest surfaced warning
      // (Sets iterate in insertion order) so dedupe becomes a sliding window
      // rather than growing unbounded for the client's whole lifetime.
      const oldest = shownWarnings.values().next().value
      if (oldest !== undefined) shownWarnings.delete(oldest)
    }

    shownWarnings.add(normalized)
    warn(normalized)
  }
}

/**
 * Create an afterResponse hook that surfaces structured success-path metadata
 * (request-id, warnings) via the injected callback, so consumers get request
 * correlation and warnings without re-parsing headers. Registered after the
 * error-handling hook, so it only sees responses the client accepted.
 */
export function createMetadataAfterHook(onMetadata: (metadata: ResponseMetadata) => void): AfterResponseHook {
  return ({request, response}) => {
    const normalized = normalizedWarning(response)
    const requestIdHeader = response.headers.get(REQUEST_ID_HEADER)
    onMetadata({
      requestIds: requestIdHeader ? splitRequestIds(requestIdHeader) : [],
      status: response.status,
      url: request.url,
      warnings: normalized ? [normalized] : [],
    })
  }
}

/**
 * The warning a response carries, normalized (leading `warning:` prefix
 * stripped, trimmed), or `undefined` if none. Reads `x-heroku-warning` first,
 * then `warning-message`. Shared by the warn-surfacing and metadata hooks so
 * both apply the same normalization.
 */
function normalizedWarning(response: Response): string | undefined {
  const raw = response.headers.get('x-heroku-warning') ?? response.headers.get('warning-message')
  if (!raw) return undefined
  return raw.replace(/^\s*warning:?\s*/i, '').trim() || undefined
}

/**
 * Create an afterResponse hook that detects a 2FA challenge (a 412, or a 403
 * carrying the `two_factor` error id) and, when a 2FA handler is configured and
 * the request isn't already carrying a code, prompts for one and forces a
 * retry.
 *
 * Registered before {@link createErrorAfterHook} so it sees the challenge
 * response before it is thrown as an error. The retry is driven by ky's
 * `ky.retry` (returned from {@link handle2FAChallenge}), which re-issues the
 * request through this same client; the retried response then runs back through
 * the full afterResponse chain — error handling, Request-Id, warnings,
 * metadata, consumer hooks — exactly once.
 *
 * The `Heroku-Two-Factor-Code` header the retry carries is also the loop guard:
 * if a request already bears a code and is still challenged (e.g. a wrong
 * code), it is left to {@link createErrorAfterHook} to throw rather than
 * retried again. This is per-request state, so concurrent requests on one
 * client don't interfere. Returns the original response untouched when it isn't
 * a handleable 2FA challenge.
 */
export function create2FAAfterHook(twoFactorOptions: TwoFactorOptions | undefined): AfterResponseHook {
  return async ({request, response}) => {
    // Cheap guards first, so the body-reading is2FAError() probe below is only
    // reached when it can matter: skip when no 2FA handler is configured, or
    // when the request already carries a code (the retry — also the loop guard).
    if (!twoFactorOptions || request.headers.has('Heroku-Two-Factor-Code')) {
      return response
    }

    const is2FAChallenge = response.status === 412
      || (response.status === 403 && await is2FAError(response))

    if (is2FAChallenge) {
      return handle2FAChallenge(request, twoFactorOptions)
    }

    return response
  }
}

/**
 * Create an afterResponse hook that throws a typed error on a non-ok response.
 *
 * Registered before the Request-Id, warning, metadata, and consumer hooks, so
 * those run only on the success path (this throws and stops the chain first).
 */
export function createErrorAfterHook(): AfterResponseHook {
  return async ({request, response}) => {
    debugResponse('%s %s -> %d', request.method, request.url, response.status)

    if (!response.ok) {
      await handleErrorResponse(response)
    }

    return response
  }
}
