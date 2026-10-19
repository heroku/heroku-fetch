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
 * Create a beforeRequest hook that adds authentication and custom headers
 */
export function createBeforeRequestHook(
  getToken: () => Promise<string | undefined>,
  defaultAccept: string | undefined,
  customHeaders?: Record<string, string>,
  debug?: boolean,
): BeforeRequestHook {
  return async ({request}) => {
    // Apply the service's default Accept header when the caller
    // hasn't set one. Services that don't declare one (e.g. `custom`)
    // skip this entirely.
    if (defaultAccept && !request.headers.has('Accept')) {
      request.headers.set('Accept', defaultAccept)
    }

    // Add custom headers from options
    if (customHeaders) {
      for (const [key, value] of Object.entries(customHeaders)) {
        request.headers.set(key, value)
      }
    }

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
 * Runs only on the success path (it is registered after the error-handling
 * hook, which throws on a non-ok response and stops the chain), matching the
 * CLI, where tracking happened after the response was accepted.
 */
export function createRequestIdAfterHook(store: RequestIdStore): AfterResponseHook {
  return ({response}) => {
    const header = response.headers.get(REQUEST_ID_HEADER)
    if (header) {
      store.track(...header.split(','))
    }
  }
}

/**
 * Create an afterResponse hook that surfaces server warning headers to the
 * user via the injected `warn` callback, deduped per client.
 *
 * Reads `x-heroku-warning` first, then `warning-message`. Each value is
 * normalized (a leading `warning:` prefix stripped, then trimmed) and emitted
 * at most once per unique normalized string over the client's lifetime.
 *
 * Note: unlike the CLI's http-call (which could hand back an array for a
 * repeated header), the Fetch `Headers` API already collapses repeated values
 * into one comma-joined string, so this reads a single string per header.
 */
export function createWarningAfterHook(
  shownWarnings: Set<string>,
  warn: (message: string) => void,
): AfterResponseHook {
  return ({response}) => {
    const normalized = normalizedWarning(response)
    if (!normalized || shownWarnings.has(normalized)) return
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
    onMetadata({
      requestId: response.headers.get(REQUEST_ID_HEADER) ?? undefined,
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
 * Create an afterResponse hook that handles 2FA challenges and errors
 */
export function createAfterResponseHook(
  twoFactorOptions: TwoFactorOptions | undefined,
  twoFactorAttemptedRef: {value: boolean},
): AfterResponseHook {
  return async ({request, response}) => {
    debugResponse('%s %s -> %d', request.method, request.url, response.status)

    // Handle 2FA challenge (can be 403 or 412)
    const is2FAChallenge = response.status === 412
      || (response.status === 403 && await is2FAError(response))

    if (is2FAChallenge && twoFactorOptions && !twoFactorAttemptedRef.value) {
      return handle2FAChallenge(request, twoFactorOptions, twoFactorAttemptedRef)
    }

    // Handle errors
    if (!response.ok) {
      await handleErrorResponse(response)
    }

    return response
  }
}
