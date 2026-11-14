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

/** Cap on `error.cause` recursion depth; guards against cyclic chains. */
const MAX_CAUSE_DEPTH = 8

let scrubberPromise: Promise<ScrubberType> | undefined

/** Build the shared Scrubber once, importing js-blanket lazily. */
async function getScrubber(): Promise<ScrubberType> {
  if (!scrubberPromise) {
    scrubberPromise = (async () => {
      const [{Scrubber}, {HEROKU_FIELDS}, {CREDENTIAL_PATTERNS}] = await Promise.all([
        import('@heroku/js-blanket/core/scrubber'),
        import('@heroku/js-blanket/core/presets'),
        import('@heroku/js-blanket/core/patterns'),
      ])
      // CREDENTIAL_PATTERNS redact credentials in string values reached while
      // scrubbing an object or Error, such as an error message: Heroku API
      // tokens, Authorization values, Bearer/Basic credentials, URL passwords
      // and PEM private keys. Each keeps its context (`Bearer [REDACTED]`).
      return new Scrubber({
        fields: [...HEROKU_FIELDS, ...EXTRA_FIELDS],
        patterns: CREDENTIAL_PATTERNS,
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
  return Object.fromEntries(headers)
}

/**
 * Clear credentials embedded in a URL (userinfo and sensitive query values),
 * keeping host/path. Returns the input unchanged if it isn't a string or a
 * parseable absolute URL. Use this for any URL written to a log line: the
 * Scrubber's patterns don't apply to a top-level string.
 */
export function redactUrl<T>(url: T): T
export function redactUrl(url: unknown): unknown {
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

    // The setters percent-encode the brackets; restore them so the log reads
    // `token=[REDACTED]`.
    return u.toString().replaceAll(encodeURIComponent(REPLACEMENT), REPLACEMENT)
  } catch {
    return url
  }
}

/**
 * Reduce `url` to its origin, for hosts whose paths can carry a credential,
 * such as a log session URL (`/sessions/<id>`). Returns only the replacement
 * if `url` isn't a parseable absolute URL.
 */
export function redactUrlPath(url: string): string {
  try {
    return `${new URL(url).origin}/${REPLACEMENT}`
  } catch {
    return REPLACEMENT
  }
}

/**
 * How URLs appear in log lines. `full` keeps the path and redacts credentials
 * in the query and userinfo. `origin` drops the path too, for `custom` clients:
 * they call URLs the API handed back, whose path can itself be a credential.
 */
export type LoggedUrl = 'full' | 'origin'

/** Redact `url` for a log line, as {@link redactUrl} or {@link redactUrlPath}. */
export function redactUrlForLog(url: string, loggedUrl: LoggedUrl): string {
  return loggedUrl === 'origin' ? redactUrlPath(url) : redactUrl(url)
}

/**
 * Normalize an `Error` into a plain, scrubbable object. An Error's own
 * `name`/`message`/`stack`/`cause` are non-enumerable and would otherwise be
 * dropped. Nested `Request`/`Response` are summarized rather than passed
 * through: they serialize to `{}` and a `Request` can carry live auth headers.
 */
async function scrubError(error: Error, loggedUrl: LoggedUrl, depth: number): Promise<unknown> {
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

  const req = typeof request === 'object' && request ? request as {method?: unknown; url?: unknown} : undefined
  const res = typeof response === 'object' && response
    ? response as {status?: unknown; statusText?: unknown; url?: unknown}
    : undefined
  const urls = [req?.url, res?.url].filter((url): url is string => typeof url === 'string')

  // ky's error messages (and so the stack) embed the request URL. Swap each
  // known URL for its logged form so `origin` holds for those strings too.
  const withLoggedUrls = (text: string | undefined): string | undefined => {
    let result = text
    for (const url of urls) result = result?.replaceAll(url, redactUrlForLog(url, loggedUrl))
    return result
  }

  const loggedUrlOf = (url: unknown): unknown => (typeof url === 'string' ? redactUrlForLog(url, loggedUrl) : url)

  const normalized: Record<string, unknown> = {
    message: withLoggedUrls(message), name, stack: withLoggedUrls(stack), ...rest,
  }

  if (res) normalized.response = {status: res.status, statusText: res.statusText, url: loggedUrlOf(res.url)}
  if (req) normalized.request = {method: req.method, url: loggedUrlOf(req.url)}

  const scrubbed = scrubber.scrub(normalized).data
  if (cause !== undefined) {
    scrubbed.cause = depth >= MAX_CAUSE_DEPTH
      ? '[max cause depth exceeded]'
      : await scrubValue(cause, loggedUrl, depth + 1)
  }

  return scrubbed
}

/**
 * Scrub a value for debug logging. Handles `Error`, `Headers`, plain objects,
 * and primitives (passed through unchanged — a top-level string is not
 * pattern-scrubbed; `CREDENTIAL_PATTERNS` only apply to strings nested inside
 * a scrubbed object/Error). URLs on a logged error's request and response, and
 * in its message, are shown as `loggedUrl`. Fail-closed: any failure returns
 * `'[unscrubbable]'` rather than risking the raw value.
 */
export async function scrubForLog(value: unknown, loggedUrl: LoggedUrl = 'full'): Promise<unknown> {
  return scrubValue(value, loggedUrl, 0)
}

async function scrubValue(value: unknown, loggedUrl: LoggedUrl, depth: number): Promise<unknown> {
  try {
    if (value instanceof Error) return await scrubError(value, loggedUrl, depth)
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
  await logScrubbedFor('full', logger, formatter, ...values)
}

/** {@link logScrubbed}, showing URLs in logged errors as `loggedUrl`. */
export async function logScrubbedFor(
  loggedUrl: LoggedUrl,
  logger: DebugLike,
  formatter: string,
  ...values: unknown[]
): Promise<void> {
  if (!logger.enabled) return
  const scrubbed = await Promise.all(values.map(value => scrubForLog(value, loggedUrl)))
  logger(formatter, ...scrubbed)
}
