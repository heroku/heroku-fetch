/**
 * Lazy, fail-closed secret scrubbing for DEBUG-gated log output.
 *
 * Wraps `@heroku/js-blanket`, loaded via dynamic `import()` the first time a
 * debug namespace is enabled so it stays off the default code path.
 */

import type {Scrubber as ScrubberType} from '@heroku/js-blanket/core/scrubber'

/** Replacement token for redacted values. */
const REPLACEMENT = '[REDACTED]'

/**
 * Extra sensitive keys the preset doesn't cover, matched case-insensitively as
 * substrings. `code` is deliberately excluded so it doesn't also redact
 * `statusCode`/`errorCode` in logged error objects.
 */
const EXTRA_FIELDS: readonly string[] = [
  'secondfactor',
  'second_factor',
  'otp',
  'sso',
]

/**
 * Redact inline `Bearer`/`Basic` credentials in string leaf values reached
 * while scrubbing an object or Error (e.g. an error message). Bare UUIDs/JWTs
 * are intentionally not matched — they're indistinguishable from benign
 * resource IDs. Note these patterns don't apply to a top-level string passed
 * straight to `scrubForLog`.
 */
const VALUE_PATTERNS: readonly RegExp[] = [
  /\b(?:Bearer|Basic)\s+[\w.~+/=-]+/gi,
]

/** Cap on `error.cause` recursion depth; guards against cyclic chains. */
const MAX_CAUSE_DEPTH = 8

let scrubberPromise: Promise<ScrubberType> | undefined

/** Build the shared Scrubber once, importing js-blanket lazily. */
async function getScrubber(): Promise<ScrubberType> {
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
    // Don't cache a rejected import: clear it so a later call retries rather
    // than degrading all object logging to '[unscrubbable]' for the process.
    scrubberPromise.catch(() => {
      scrubberPromise = undefined
    })
  }

  return scrubberPromise
}

/**
 * Convert a `Headers` instance to a plain object. Scrubbing one directly yields
 * `{}` (no enumerable own-properties); converting first preserves the entries.
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
 * keeping host/path. Returns the input unchanged if it isn't a parseable URL.
 */
function redactUrl(url: unknown): unknown {
  if (typeof url !== 'string') return url
  try {
    const u = new URL(url)
    if (u.username) u.username = REPLACEMENT
    if (u.password) u.password = REPLACEMENT
    for (const key of u.searchParams.keys()) {
      if (/token|secret|code|sso|key|password|auth|assertion|saml|signature|nonce|otp|credential/i.test(key)) {
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
 * `name`/`message`/`stack`/`cause` are non-enumerable and would otherwise be
 * dropped. Nested `Request`/`Response` are summarized rather than passed
 * through: they serialize to `{}` and a `Request` can carry live auth headers.
 */
async function scrubError(error: Error, depth: number): Promise<unknown> {
  const scrubber = await getScrubber()
  // Index signature makes the extra own-properties `unknown` without flattening
  // the known `message`/`name`/`stack` off `Error` (string wins over unknown).
  const err = error as Error & {
    [key: string]: unknown
    cause?: unknown
    request?: unknown
    response?: unknown
  }
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

  const scrubbed = scrubber.scrub(normalized).data
  if (cause !== undefined) {
    scrubbed.cause = depth >= MAX_CAUSE_DEPTH
      ? '[max cause depth exceeded]'
      : await scrubForLog(cause, depth + 1)
  }

  return scrubbed
}

/**
 * Scrub a value for debug logging. Handles `Error`, `Headers`, plain objects,
 * and primitives (passed through unchanged — a top-level string is not
 * pattern-scrubbed; `VALUE_PATTERNS` only apply to strings nested inside a
 * scrubbed object/Error). Fail-closed: any failure returns `'[unscrubbable]'`
 * rather than risking the raw value. `depth` is internal, for `cause`
 * recursion.
 */
export async function scrubForLog(value: unknown, depth = 0): Promise<unknown> {
  try {
    if (value instanceof Error) return await scrubError(value, depth)
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

/** A `debug` logger: a format call plus an `enabled` flag for its namespace. */
export interface DebugLike {
  (formatter: string, ...args: unknown[]): void
  readonly enabled: boolean
}

/**
 * Scrub each `value` and emit it through `logger` under `formatter`. No-ops
 * when the namespace is disabled. Use this instead of passing raw objects to a
 * `debug` logger with `%O`/`%o` (enforced by lint).
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
