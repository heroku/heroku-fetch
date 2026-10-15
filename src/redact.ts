/**
 * Lazy, fail-closed secret scrubbing for DEBUG-gated log output.
 *
 * Wraps the team-standard scrubber `@heroku/js-blanket`. The scrubber is
 * loaded via dynamic `import()` the first time a debug namespace is actually
 * enabled, so non-debug consumers — including the browser build — never pull
 * it onto the default code path. See `SECURITY.md` on limiting runtime
 * dependencies: the dependency exists but stays off the default path.
 *
 * This module must stay Node-free: it is reachable from the browser entry.
 */

import type {Scrubber} from '@heroku/js-blanket/core/scrubber'

/**
 * Replacement token. Matches the prior hand-rolled redaction so existing
 * debug output and tests are unchanged.
 */
const REPLACEMENT = '[REDACTED]'

/**
 * Codebase-specific sensitive keys that `HEROKU_FIELDS` does not already
 * cover. Matched case-insensitively as substrings by js-blanket. The header
 * fields (`heroku-two-factor-code`, `x-addon-sso`) are part of `HEROKU_FIELDS`
 * as of js-blanket 1.2.0, so they are intentionally absent here. `code` is
 * deliberately excluded: as a substring it would also redact `statusCode` /
 * `errorCode` in logged error objects, and no object logged here carries a
 * secret under a `code` key (the 2FA code travels as the
 * `Heroku-Two-Factor-Code` header, covered by the preset).
 */
const EXTRA_FIELDS: readonly string[] = [
  'secondfactor',
  'second_factor',
  'otp',
  'sso',
  '_url',
]

/**
 * Narrow value pattern: redact inline `Bearer`/`Basic` credentials wherever
 * they appear in a string value (e.g. an error message), independent of the
 * field name. Deliberately not matching bare UUIDs/JWTs — Heroku's
 * UUID-shaped tokens are indistinguishable from benign resource IDs, so that
 * would be pure noise.
 */
const VALUE_PATTERNS: readonly RegExp[] = [
  /\b(?:Bearer|Basic)\s+[\w.~+/=-]+/gi,
]

let scrubberPromise: Promise<Scrubber> | undefined

/**
 * Build the shared Scrubber once, importing js-blanket lazily.
 */
async function getScrubber(): Promise<Scrubber> {
  if (!scrubberPromise) {
    scrubberPromise = (async () => {
      const [{Scrubber}, {HEROKU_FIELDS}] = await Promise.all([
        import('@heroku/js-blanket/core/scrubber'),
        import('@heroku/js-blanket/core/presets'),
      ])
      return new Scrubber({
        fields: [...HEROKU_FIELDS, ...EXTRA_FIELDS],
        patterns: [...VALUE_PATTERNS],
        replacement: REPLACEMENT,
      })
    })()
  }

  return scrubberPromise
}

/**
 * Convert a `Headers` instance to a plain object. js-blanket (like
 * `JSON.stringify`) sees no enumerable own-properties on a `Headers`
 * instance, so scrubbing one directly yields `{}`; converting first preserves
 * the entries (keys are already lowercased by `Headers`).
 */
function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  // eslint-disable-next-line unicorn/no-array-for-each
  headers.forEach((value, key) => {
    out[key] = value
  })
  return out
}

/**
 * Clear credentials embedded in a URL (userinfo and sensitive query values),
 * keeping host/path for diagnostics. Best-effort — returns the input
 * unchanged if it isn't a parseable URL string.
 */
function redactUrl(url: unknown): unknown {
  if (typeof url !== 'string') return url
  try {
    const u = new URL(url)
    if (u.username) u.username = REPLACEMENT
    if (u.password) u.password = REPLACEMENT
    for (const key of u.searchParams.keys()) {
      if (/token|secret|code|sso|key|password|auth/i.test(key)) {
        u.searchParams.set(key, REPLACEMENT)
      }
    }

    return u.toString()
  } catch {
    return url
  }
}

/**
 * Normalize an `Error` into a plain, scrubbable object. An Error's own
 * `name`/`message`/`stack`/`cause` are non-enumerable, so passing an Error
 * straight through the scrubber (which deep-clones) would drop them and yield
 * `{}`. Nested `Request`/`Response` are summarized rather than passed through:
 * they serialize to `{}`, and a `Request` can carry live auth headers.
 */
async function scrubError(error: Error): Promise<unknown> {
  const scrubber = await getScrubber()
  const err = error as Error & Record<string, unknown>
  const {
    cause, message, name, request, response, stack, ...rest
  } = err

  const normalized: Record<string, unknown> = {
    message, name, stack, ...rest,
  }

  if (response && typeof response === 'object') {
    const r = response as {status?: unknown; statusText?: unknown; url?: unknown}
    normalized.response = {status: r.status, statusText: r.statusText, url: redactUrl(r.url)}
  }

  if (request && typeof request === 'object') {
    const r = request as {method?: unknown; url?: unknown}
    normalized.request = {method: r.method, url: redactUrl(r.url)}
  }

  // Field matching scrubs sensitive keys in `rest`; value patterns scrub
  // inline Bearer/Basic tokens in `message`/`stack`.
  const scrubbed = scrubber.scrub(normalized).data as Record<string, unknown>
  if (cause !== undefined) scrubbed.cause = await scrubForLog(cause)
  return scrubbed
}

/**
 * Scrub a value for debug logging and return the plain, scrubbed data.
 *
 * Handles `Error` (normalized so diagnostics survive and nested
 * `Request`/`Response` are summarized), `Headers` (converted first),
 * primitives (passed through), and plain objects. Fail-closed: any failure
 * returns the string `'[unscrubbable]'` rather than risking the raw value, so
 * a throwing scrubber can never leak input or mask a real error.
 */
export async function scrubForLog(value: unknown): Promise<unknown> {
  try {
    if (value instanceof Error) return await scrubError(value)
    if (typeof Headers !== 'undefined' && value instanceof Headers) {
      const scrubber = await getScrubber()
      return scrubber.scrub(headersToObject(value)).data
    }

    if (value !== null && typeof value === 'object') {
      const scrubber = await getScrubber()
      return scrubber.scrub(value).data
    }

    return value
  } catch {
    return '[unscrubbable]'
  }
}

/**
 * A `debug` logger: callable with a format string plus args, and carrying an
 * `enabled` flag reflecting whether its namespace is active.
 */
interface DebugLike {
  (formatter: string, ...args: unknown[]): void
  enabled: boolean
}

/**
 * Scrub each `value` and emit it through `logger` under `formatter`. No-ops
 * when the namespace is disabled, so js-blanket is never imported while
 * `DEBUG` is off. Use this instead of passing raw objects to a `debug` logger
 * with `%O`/`%o` (enforced by lint).
 */
export async function logScrubbed(
  logger: DebugLike,
  formatter: string,
  ...values: unknown[]
): Promise<void> {
  if (!logger.enabled) return
  const scrubbed = await Promise.all(values.map(value => scrubForLog(value)))
  logger(formatter, ...scrubbed)
}
