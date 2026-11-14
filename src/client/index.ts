/**
 * Heroku API Client
 *
 * Main client class for making HTTP requests to Heroku APIs.
 * Supports multiple services (platform, data, metrics, notifications, particleboard, repositories), authentication,
 * two-factor authentication, and comprehensive error handling.
 */

import {
  getDefaultFetch, getDefaultTokenProvider, getDefaultTwoFactorOptions, getUserAgentComment,
} from '@heroku/heroku-fetch/client/environment-defaults.js'
import ky, {type KyInstance, type Options as KyOptions} from 'ky'

import type {
  HerokuApiClientOptions,
  HerokuService,
  RequestOptions,
  TokenProvider,
} from '../types.js'

import {debugAuth} from '../debug-loggers.js'
import {AuthenticationError} from '../errors.js'
import {type LoggedUrl, redactUrlForLog} from '../redact.js'
import {
  create2FAAfterHook,
  createBeforeRequestHook,
  createErrorAfterHook,
  createMetadataAfterHook,
  createRequestIdAfterHook,
  createRequestIdBeforeHook,
  createRequestLogHook,
  createWarningAfterHook,
} from './http-request-hooks.js'
import {RequestIdStore} from './request-id.js'
import {SERVICE_CONFIGS} from './service-configurations.js'
import {resolveUserAgentHeader} from './user-agent.js'

/**
 * Combine zero or more optional abort signals into one. Returns `undefined`
 * when none are present (so callers can omit `signal` entirely rather than pass
 * a signal that never fires), the single signal when only one is present, and
 * an `AbortSignal.any(...)` composite when several are — the composite aborts as
 * soon as any input does. Lets a client-level default signal and a per-request
 * signal both abort the same request instead of one shadowing the other.
 */
function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const present = signals.filter((signal): signal is AbortSignal => signal !== undefined)
  if (present.length <= 1) {
    return present[0]
  }

  return AbortSignal.any(present)
}

const DEFAULT_TIMEOUT = 30_000

/** How many times a GET is retried after a network error. */
const NETWORK_RETRIES = 3

/**
 * ky's retry settings. A GET (including `stream()`) that fails with a network error (refused
 * connection, DNS failure, reset) is retried up to {@link NETWORK_RETRIES}
 * times, after 300, 600 and 1200 ms. Other methods aren't retried, because the
 * server may have acted before the connection dropped. Timeouts and error
 * responses aren't retried either.
 *
 * ky counts the 2FA replay as a retry but doesn't ask `shouldRetry` about it,
 * so the limit has one slot more than `shouldRetry` allows network retries.
 * That way the replay still runs after the network retries are used up.
 */
const RETRY: NonNullable<KyOptions['retry']> = {
  delay: attempt => 300 * (2 ** (attempt - 1)),
  limit: NETWORK_RETRIES + 1,
  methods: ['get'],
  retryOnTimeout: false,
  shouldRetry({retryCount}) {
    if (retryCount > NETWORK_RETRIES) return false
  },
  statusCodes: [],
}

/** The longest delay `setTimeout` accepts; ky rejects anything larger. */
const MAX_TIMEOUT = 2_147_483_647

/**
 * Reject a timeout that isn't `false` or a positive delay `setTimeout` can
 * hold, so a bad value fails where it's set rather than on every request.
 * `0` is rejected too: ky would apply it as a 0 ms limit and abort every
 * request, while callers passing 0 usually mean "no timeout", which is `false`.
 */
function checkTimeout<T extends false | number | undefined>(timeout: T): T {
  if (timeout === undefined || timeout === false) return timeout
  if (typeof timeout !== 'number' || !(timeout > 0 && timeout <= MAX_TIMEOUT)) {
    throw new TypeError(`timeout must be a number of milliseconds from 1 to ${MAX_TIMEOUT}, or false for no timeout`)
  }

  return timeout
}

/**
 * The token and 2FA handler a client uses. Named Heroku services fall back to
 * the environment's defaults: a token provider (HEROKU_API_KEY on Node) and a
 * 2FA handler. A `custom` client may point at a host outside Heroku, so it
 * sends a token or a 2FA code only when given a token or handler explicitly.
 */
function authDefaults(
  service: HerokuService,
  options: HerokuApiClientOptions,
): Pick<HerokuApiClientOptions, 'token' | 'twoFactor'> {
  if (service === 'custom') return {token: options.token, twoFactor: options.twoFactor}
  return {
    token: options.token ?? getDefaultTokenProvider(),
    twoFactor: options.twoFactor ?? getDefaultTwoFactorOptions(),
  }
}

export class HerokuApiClient {
  private clientPromise: null | Promise<KyInstance> = null
  private kyOptions: KyOptions
  private options: Partial<HerokuApiClientOptions>
    & Required<Pick<HerokuApiClientOptions, 'service' | 'timeout'>>
  // A single in-flight reauthorize refresh, shared across concurrent 401s so the
  // callback (e.g. an interactive `heroku login`) fires once rather than once
  // per request. Null when no refresh is running; cleared when one settles.
  private reauthorizePromise: null | Promise<void> = null
  // Per-client cross-cutting request state: the Request-Id accumulation and the
  // set of warnings already surfaced, so dedupe spans a multi-request session
  // but resets per client and parallel clients stay isolated.
  private readonly requestIds = new RequestIdStore()
  private readonly shownWarnings = new Set<string>()
  private tokenProvider?: TokenProvider

  constructor(options: HerokuApiClientOptions = {}) {
    this.options = {
      ...options,
      service: options.service || 'platform',
      timeout: checkTimeout(options.timeout) ?? DEFAULT_TIMEOUT,
    }

    const auth = authDefaults(this.options.service, options)
    this.tokenProvider = auth.token
    this.options.twoFactor = auth.twoFactor

    // Determine base URL
    const serviceConfig = SERVICE_CONFIGS[this.options.service]

    if (this.options.service === 'custom' && !options.baseUrl) {
      throw new Error('baseUrl is required when service is "custom"')
    }

    // `||` keeps the service default unread when baseUrl is set: its getter
    // validates the host env vars, and an unused one mustn't fail the client.
    const baseUrl = options.baseUrl || serviceConfig.baseUrl

    // A `custom` client calls URLs such as a log session's, whose path can be
    // the credential, so its log lines show only the origin.
    const loggedUrl: LoggedUrl = this.options.service === 'custom' ? 'origin' : 'full'
    debugAuth('Initializing client for service: %s, baseUrl: %s', this.options.service, redactUrlForLog(baseUrl, loggedUrl))

    // Stash the ky options; the actual ky instance is built lazily so
    // we can await getDefaultFetch() (Node loads undici dynamically for
    // env-var proxy support).
    // Static headers go on the instance so ky merges them with per-call headers
    // (per-call winning). A per-client `defaultAccept` override wins over the
    // shared service default; services that declare no default (e.g. `custom`)
    // and no override contribute no Accept at all.
    const defaultAccept = options.defaultAccept ?? serviceConfig.defaultAccept
    const headers: Record<string, string> = {...options.headers}
    // Case-insensitive check: a consumer may have supplied a header under any
    // casing, and ky merges headers case-insensitively (last write wins), so a
    // plain `'Accept' in headers` test would miss a lowercase `accept` and let
    // our default clobber the consumer's choice.
    const providedHeaders = new Headers(options.headers)
    if (defaultAccept && !providedHeaders.has('accept')) {
      headers.Accept = defaultAccept
    }

    // Self-identifying User-Agent, same fill-if-absent rule as Accept: set it
    // only when the caller hasn't supplied one on the client (a per-call
    // `User-Agent` still wins via ky's per-call-over-instance merge). Omitted or
    // incomplete `userAgent` → no User-Agent is set (resolveUserAgentHeader
    // returns undefined). Browser builds opt out entirely: getUserAgentComment
    // returns undefined there (a fetch-set User-Agent isn't CORS-safelisted), so
    // no managed User-Agent is sent regardless of the option.
    if (!providedHeaders.has('user-agent')) {
      const userAgent = resolveUserAgentHeader(options.userAgent, getUserAgentComment())
      if (userAgent) {
        headers['User-Agent'] = userAgent
      }
    }

    const requestLog = createRequestLogHook(loggedUrl)
    this.kyOptions = {
      headers,
      hooks: {
        // Order matters: the 2FA hook runs first (so it sees a challenge before
        // it's thrown as an error and can force a retry), then the error hook
        // throws on a non-ok response — so the Request-Id tracking, warning, and
        // metadata hooks after it run only on the success path.
        afterResponse: [
          create2FAAfterHook(this.options.twoFactor, loggedUrl),
          createErrorAfterHook(loggedUrl),
          createRequestIdAfterHook(this.requestIds),
          createWarningAfterHook(
            this.shownWarnings,
            message => this.options.warn?.(message),
          ),
          createMetadataAfterHook(metadata => this.options.onResponseMetadata?.(metadata)),
          // Consumer hooks run last: they see the resolved success-path
          // response (the error-handling built-in above throws on non-2xx).
          ...(options.hooks?.afterResponse ?? []),
        ],
        beforeRequest: [
          createBeforeRequestHook(() => this.getToken()),
          createRequestIdBeforeHook(this.requestIds),
          // Consumer hooks see (and may override) the fully prepared request
          // after auth and Request-Id are attached.
          ...(options.hooks?.beforeRequest ?? []),
          // Logged last, so the log shows the request as it is sent.
          requestLog,
        ],
        // Retries, including the 2FA replay, skip beforeRequest.
        beforeRetry: [requestLog],
      },
      prefix: baseUrl,
      retry: RETRY,
      timeout: this.options.timeout,
    }
  }

  /**
   * Make a DELETE request
   */
  public async delete(path: string, options?: RequestOptions): Promise<Response> {
    return this.request(path, {...options, method: 'DELETE'})
  }

  /**
   * Make a GET request
   */
  public async get(path: string, options?: RequestOptions): Promise<Response> {
    return this.request(path, {...options, method: 'GET'})
  }

  /**
   * Make a PATCH request
   */
  public async patch(path: string, body?: unknown, options?: RequestOptions): Promise<Response> {
    return this.request(path, {...options, body, method: 'PATCH'})
  }

  /**
   * Make a POST request
   */
  public async post(path: string, body?: unknown, options?: RequestOptions): Promise<Response> {
    return this.request(path, {...options, body, method: 'POST'})
  }

  /**
   * Make a PUT request
   */
  public async put(path: string, body?: unknown, options?: RequestOptions): Promise<Response> {
    return this.request(path, {...options, body, method: 'PUT'})
  }

  /**
   * Set or update a client option
   */
  public setOption<K extends keyof HerokuApiClientOptions>(
    key: K,
    value: HerokuApiClientOptions[K],
  ): void {
    if (key === 'token') {
      this.tokenProvider = value as TokenProvider
      return
    }

    // Only these are re-read on each request, so changing them takes effect.
    // hooks, headers, the Accept default, the 2FA handler, and the
    // service base URL are baked into the cached ky instance at
    // construction, so mutating them here would silently no-op — reject rather
    // than lie about the change landing. `reauthorize` IS read per request (so a
    // mutation would land), but is deliberately kept construction-only: it's an
    // auth policy that should be fixed for the client, with per-request control
    // exposed instead through `RequestOptions.reauthorize: false`.
    if (key === 'timeout') {
      this.options.timeout = checkTimeout(value as HerokuApiClientOptions['timeout']) ?? DEFAULT_TIMEOUT
      return
    }

    if (key === 'warn' || key === 'onResponseMetadata' || key === 'signal') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.options as Record<string, any>)[key] = value
      return
    }

    throw new Error(`setOption: "${key}" is fixed at construction and cannot be changed on an existing client; pass it to the constructor instead.`)
  }

  /**
   * Create a streaming request (returns the Response object for stream access)
   */
  public async stream(path: string, options?: RequestOptions): Promise<Response> {
    const signal = combineSignals(this.options.signal, options?.signal)
    const kyOptions: KyOptions = {
      // Only set these when the caller supplied them: a literal `undefined`
      // overrides (and for headers, clears) what ky merges from the instance,
      // rather than leaving the instance value untouched.
      ...(options?.headers && {headers: options.headers}),
      ...(options?.searchParams && {searchParams: options.searchParams}),
      ...(signal && {signal}),
      method: 'GET',
      timeout: checkTimeout(options?.timeout) ?? this.options.timeout,
    }

    const client = await this.getClient()
    return this.send(client, path, kyOptions, this.resolveReauthorize(options?.reauthorize))
  }

  /**
   * Lazily construct ky over a fetch that is proxy-aware on Node (undici's own
   * fetch paired with an env-var dispatcher) and the global fetch in the
   * browser. Cached after the first call.
   *
   * We drive ky through `fetch` rather than ky's `dispatcher` option because
   * ky calls the global `fetch`, which on Node 22 is backed by a different
   * undici than our dispatcher and rejects it (`invalid onRequestStart
   * method`). `getDefaultFetch()` returns a fetch from the matching undici.
   */
  private async getClient(): Promise<KyInstance> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const fetch = await getDefaultFetch()
        return ky.create({...this.kyOptions, fetch})
      })()
    }

    return this.clientPromise
  }

  /**
   * Get the authorization token
   */
  private async getToken(): Promise<string | undefined> {
    if (!this.tokenProvider) {
      return undefined
    }

    if (typeof this.tokenProvider === 'string') {
      return this.tokenProvider
    }

    return this.tokenProvider()
  }

  /**
   * Run `reauthorize` at most once across concurrent 401s. The first 401 to
   * arrive starts the refresh and every other 401 in flight awaits the same
   * promise instead of each firing the callback — so a stale token shared by N
   * parallel requests drives one `heroku login`, not N. The shared promise is
   * cleared once it settles, so a *later* 401 (e.g. the refreshed token has
   * since expired) starts a fresh refresh rather than reusing a stale result.
   *
   * The first caller's `signal` drives the shared refresh; a later waiter's own
   * signal still aborts its request independently (checked in `send` before and
   * surfaced by its own `client()` retry), it just can't cancel the in-flight
   * refresh another request already started.
   */
  private reauthorizeOnce(
    reauthorize: NonNullable<HerokuApiClientOptions['reauthorize']>,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    this.reauthorizePromise ??= (async () => {
      try {
        await reauthorize({signal})
      } finally {
        this.reauthorizePromise = null
      }
    })()
    return this.reauthorizePromise
  }

  /**
   * Make a request with full control over options
   */
  private async request(
    path: string,
    options?: RequestOptions & {body?: unknown; method?: string;},
  ): Promise<Response> {
    const signal = combineSignals(this.options.signal, options?.signal)
    const kyOptions: KyOptions = {
      // Only set these when the caller supplied them: a literal `undefined`
      // overrides (and for headers, clears) what ky merges from the instance,
      // rather than leaving the instance value untouched.
      ...(options?.headers && {headers: options.headers}),
      ...(options?.searchParams && {searchParams: options.searchParams}),
      ...(signal && {signal}),
      method: options?.method || 'GET',
      timeout: checkTimeout(options?.timeout) ?? this.options.timeout,
    }

    if (options?.body !== undefined) {
      kyOptions.json = options.body
    }

    const client = await this.getClient()
    return this.send(client, path, kyOptions, this.resolveReauthorize(options?.reauthorize))
  }

  /**
   * The `reauthorize` callback to apply for a request: the client-level one,
   * unless the request opts out with `reauthorize: false` (the per-request
   * escape hatch mirroring the legacy `APIClient`'s `retryAuth: false`, for
   * call sites where a 401 must surface rather than drive a login).
   */
  private resolveReauthorize(optOut?: false): HerokuApiClientOptions['reauthorize'] {
    return optOut === false ? undefined : this.options.reauthorize
  }

  /**
   * Issue the request through ky. With an effective `reauthorize` callback, a
   * 401 (thrown as `AuthenticationError` by the error hook) runs the callback
   * and retries once — the retry re-runs the pipeline, so `beforeRequest`
   * re-resolves the token. The retry sits outside the `try`, so a second 401
   * propagates rather than looping; an already-aborted signal skips the
   * (possibly interactive) refresh entirely. Without a callback (none configured,
   * or the request opted out via `RequestOptions.reauthorize: false`), a plain
   * pass-through.
   *
   * Replaying a non-idempotent write this way is safe for Heroku's front-door
   * auth, which rejects a 401 before the server executes the request. It is not
   * universally safe: a host other than platform (`data`, `metrics`,
   * `notifications`, `particleboard`, `repositories`, `custom`) that returns a
   * downstream or proxied 401 *after* side effects have begun would see the
   * write run twice. Opt such a request out with `reauthorize: false`.
   */
  private async send(
    client: KyInstance,
    path: string,
    kyOptions: KyOptions,
    reauthorize: HerokuApiClientOptions['reauthorize'],
  ): Promise<Response> {
    if (!reauthorize) {
      return client(path, kyOptions)
    }

    try {
      return await client(path, kyOptions)
    } catch (error) {
      if (error instanceof AuthenticationError) {
        // Don't run the refresh if the caller already aborted; hand the callback
        // the same combined signal so an interactive refresh can bail too.
        const signal = kyOptions.signal ?? undefined
        signal?.throwIfAborted()
        debugAuth('401 received; invoking reauthorize and retrying once')
        try {
          // Coalesced: concurrent 401s sharing a stale token await one refresh.
          await this.reauthorizeOnce(reauthorize, signal)
        } catch (reauthorizeError) {
          // The callback's own failure propagates in place of the 401, but keep
          // the original attached as `cause` so consumers don't lose the 401's
          // statusCode/id/request context (and an `instanceof AuthenticationError`
          // check on the cause chain still works). Only set it when the callback
          // didn't already supply a cause of its own.
          if (reauthorizeError instanceof Error && reauthorizeError.cause === undefined) {
            reauthorizeError.cause = error
          }

          throw reauthorizeError
        }

        // The retry is a fresh request: if the original also cleared a 2FA
        // challenge, the retried one re-prompts (it drops the one-shot
        // Heroku-Two-Factor-Code header). Bounded to one extra prompt, not a loop.
        return client(path, kyOptions)
      }

      throw error
    }
  }
}
