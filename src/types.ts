export type HerokuService = 'custom' | 'data' | 'particleboard' | 'platform'

/**
 * A `beforeRequest` hook: runs after the client's built-ins have prepared the
 * `Request` and may inspect or mutate it, or return a replacement `Request`/
 * `Response`. Structurally a subset of the underlying ky hook, but typed only
 * on the standard `Request`/`Response` so the public API isn't welded to ky's
 * major version — a ky upgrade that reshapes its own hook types can't become a
 * breaking change here.
 */
export type HerokuBeforeRequestHook = (
  context: {request: Request},
) => Promise<Request | Response | void> | Request | Response | void

/**
 * An `afterResponse` hook: runs on the resolved success-path response (the
 * built-in error hook throws on a non-2xx first) and may return a replacement
 * `Response`. Typed only on the standard `Request`/`Response`, for the same
 * decoupling reason as {@link HerokuBeforeRequestHook}.
 */
export type HerokuAfterResponseHook = (
  context: {request: Request; response: Response},
) => Promise<Response | void> | Response | void

/**
 * Consumer-supplied ky hooks, merged with the client's built-in pipeline.
 *
 * Built-in hooks run first in each phase; the hooks here run after them:
 * - `beforeRequest`: the built-ins attach auth, the `Accept` default, and the
 *   `Request-Id` header; your hooks then see (and may override) the fully
 *   prepared request before it goes out.
 * - `afterResponse`: the built-ins handle 2FA, throw typed errors on non-2xx,
 *   track `Request-Id`s, and surface warnings. Your hooks run *after* that, so
 *   they only see the resolved success-path response — a non-2xx response has
 *   already been thrown as a typed error and never reaches them.
 *
 * Resolved once at construction: the ky instance is built lazily and cached,
 * so hooks cannot be changed per request.
 */
export interface HerokuHooks {
  afterResponse?: readonly HerokuAfterResponseHook[];
  beforeRequest?: readonly HerokuBeforeRequestHook[];
}

/**
 * A `fetch`-shaped function. Returned by `getDefaultFetch()` on the
 * `@heroku/heroku-fetch/client/environment-defaults.js` subpath: a drop-in
 * `fetch` that, on Node, is already paired with the proxy dispatcher from the
 * same undici copy, so proxy routing works. Pass it anywhere a `fetch` is
 * accepted. See `getDefaultFetch` for why the pairing matters.
 */
export type FetchLike = (input: Request | string | URL, init?: Parameters<typeof fetch>[1]) => Promise<Response>

/**
 * A bearer token, or a function resolving one at request time. A provider may
 * return `undefined` (sync or async) to send the request with no `Authorization`
 * header — appropriate for endpoints or hosts that need no Heroku auth. Requests
 * to endpoints that do require auth then receive a server 401, surfaced as
 * `AuthenticationError`.
 */
export type TokenProvider = (() => Promise<string | undefined> | string | undefined) | string

/**
 * Structured, success-path metadata about a completed response, surfaced via
 * the `onResponseMetadata` option so consumers can read request correlation and
 * warnings without re-parsing headers. The bare `Response` is still returned
 * from `get`/`post`/etc. unchanged — this is an additive side channel.
 */
export interface ResponseMetadata {
  /**
   * The `Request-Id`s the server echoed for this response, newest first. The
   * server returns them comma-joined; this is that header split into the
   * individual ids (matching the client's internal correlation tracking).
   * Empty when the response carried no `Request-Id`.
   */
  requestIds: readonly string[];
  /** HTTP status code of the response. */
  status: number;
  /** Final request URL. */
  url: string;
  /**
   * Warnings this response carried (normalized the same way the `warn`
   * callback receives them). Empty when the response carried none. Not deduped
   * against prior responses — reflects what *this* response carried.
   */
  warnings: readonly string[];
}

export interface TwoFactorOptions {
  /** Callback function to prompt for 2FA code */
  onChallenge: () => Promise<string> | string;
}

export interface ServiceConfig {
  /** Base URL for the service */
  baseUrl: string;
  /**
   * Default Accept header to apply to outgoing requests when the
   * caller hasn't set one. Omit for services that should not inject
   * any Accept default — e.g. `custom`, where the URL may be a
   * third-party host that wouldn't recognize the Heroku vendor MIME
   * type.
   */
  defaultAccept?: string;
  /** Default region (if applicable) */
  region?: string;
}

export interface HerokuApiClientOptions {
  /** Custom base URL (for 'custom' service type) */
  baseUrl?: string;
  /** Enable debugging */
  debug?: boolean;
  /**
   * Override the service's default `Accept` header for this client. Applied
   * only when a request doesn't already carry an `Accept` (so per-call
   * `withHeaders({Accept})` still wins); falls back to the service config's
   * default when unset. Lets a consumer whose types/routes are generated from
   * a specific API variant (e.g. `@heroku/sdk`, generated from `version=3.sdk`)
   * dispatch at that variant without changing the shared service default.
   */
  defaultAccept?: string;
  /** Additional custom headers */
  headers?: Record<string, string>;
  /**
   * Consumer ky hooks merged after the client's built-in hooks. See
   * {@link HerokuHooks} for ordering and the success-path caveat.
   */
  hooks?: HerokuHooks;
  /**
   * Callback invoked on the success path with structured {@link ResponseMetadata}
   * for each completed response — request-ids and warnings without re-parsing
   * headers. Runs only after built-in error handling accepts the response (a
   * non-2xx is thrown as a typed error and never reaches it). Omitted → no-op.
   *
   * Fires once per HTTP response, not once per logical operation: a caller that
   * makes several requests (pagination, polling) receives several callbacks,
   * with no built-in way to correlate them beyond the per-response metadata.
   */
  onResponseMetadata?: (metadata: ResponseMetadata) => void;
  /**
   * Callback given one chance to refresh credentials when a request fails with a
   * 401: the client awaits it, then retries the request exactly once, re-resolving
   * the {@link HerokuApiClientOptions.token} provider so a refreshed token is
   * picked up. A second 401 propagates; a rejection from the callback propagates
   * in its place (with the original 401 attached as its `cause`). The callback
   * fires at most once per request, and is skipped if the request's signal has
   * already aborted.
   *
   * The retry only sends a *different* credential if {@link HerokuApiClientOptions.token} is a function
   * that reads refreshed state (the callback mutates what the provider returns,
   * as the CLI does by flipping to a fresh token). A static string `token` is
   * resent unchanged, so the retry 401s again — if you set `reauthorize`, use a
   * function `token`.
   *
   * Receives a context carrying the request's combined abort `signal` (the
   * client-level signal composed with any per-call one), so an interactive
   * refresh can bail when the caller aborts. The callback is itself untimed —
   * ky's `timeout` bounds each HTTP attempt but not the awaited refresh between
   * them, so a non-interactive refresh should honor the `signal` or impose its
   * own bound rather than hang.
   *
   * Concurrent 401s are coalesced: when several requests share a stale token,
   * the first to 401 runs the callback and the rest await that same refresh, so
   * the client drives one `heroku login` rather than one per request. The shared
   * refresh is per-client and cleared once it settles, so a later 401 (the
   * refreshed token has since expired) starts a fresh one. The first 401's
   * `signal` drives the shared refresh (see {@link HerokuApiClientOptions.signal}
   * for the waiter-cancellation caveat). Beyond this coalescing the callback is
   * policy-free: prompting and any "give up" rule belong in it. The Heroku CLI
   * wires this to `heroku login`, so an SDK call with an expired or missing token
   * re-prompts and retries. A single request can opt out with
   * {@link RequestOptions.reauthorize} `: false` (so its 401 surfaces untouched).
   * Omitted → a 401 throws `AuthenticationError` with no retry (unchanged behavior).
   */
  reauthorize?: (context: {signal?: AbortSignal}) => Promise<void> | void;
  /** Service region (e.g., 'eu', 'us') */
  region?: string;
  /** Heroku service type (platform, data, particleboard, custom) */
  service?: HerokuService;
  /**
   * Default `AbortSignal` applied to every request this client makes: when it
   * fires, all in-flight and subsequent requests abort. Re-read per request, so
   * it may also be set later via `setOption('signal', …)`. Composed (not
   * replaced) with a per-call {@link RequestOptions.signal} and the client's
   * `timeout` by the underlying ky layer — either firing aborts the request.
   * Omitted → no client-level abort.
   *
   * There is no per-request opt-out: this signal is folded into *every* request,
   * so once it fires, a call issued afterward — including best-effort cleanup
   * from a SIGINT/abort handler — aborts immediately. Work that must outlive the
   * abort should run on a separate client that doesn't carry the shared signal
   * (or you should scope signals to the unit of work rather than wiring one
   * process-wide signal into a shared, long-lived client).
   *
   * Caveat for {@link HerokuApiClientOptions.reauthorize}: a request's signal
   * aborts *its own* HTTP attempts, but once another request's 401 has started
   * the shared refresh, this request's signal can't cancel that in-flight
   * refresh — only the signal of the request that started it can. Aborting a
   * waiter still abandons its wait (its next `throwIfAborted`/HTTP attempt
   * rejects); it just doesn't interrupt the refresh already running elsewhere.
   *
   * On long-lived hosts (a server or editor-extension process, vs. a short-lived
   * CLI), a signal that never fires accumulates ~180 bytes/request on Node ≥ 22:
   * ky composes it afresh with each request's timeout and Node retains the
   * composite in the source signal's dependents set until that signal aborts or
   * is GC'd. The retained memory is released on abort/GC, but while the signal
   * lives it grows linearly with request count (~18 MB over 100k requests). So
   * scope this signal (and the client) to a unit of work, or prefer a per-call
   * {@link RequestOptions.signal}, rather than wiring a process-lifetime one.
   */
  signal?: AbortSignal;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Static bearer token or function to retrieve token */
  token?: TokenProvider;
  /** Two-factor authentication configuration */
  twoFactor?: TwoFactorOptions;
  /**
   * Callback for surfacing user-facing warnings the client raises — currently
   * server `x-heroku-warning` / `warning-message` response headers. Called once
   * per unique (normalized) warning over the client's lifetime. Keeps the
   * client environment-agnostic: a host can log or display warnings however it
   * likes. Omitted → warnings are dropped.
   */
  warn?: (message: string) => void;
}

export interface RequestOptions {
  /** Additional headers for this request */
  headers?: Record<string, string>;
  /**
   * Opt this request out of the client-level {@link HerokuApiClientOptions.reauthorize}
   * retry: when `false`, a 401 surfaces as `AuthenticationError` without running
   * the callback or retrying. The per-request escape hatch mirroring the legacy
   * `APIClient`'s `retryAuth: false` — for call sites where a 401 means something
   * other than an expired Heroku credential (e.g. a non-Heroku bearer token) and
   * must not drive a login. Omitted → the client-level behavior applies.
   */
  reauthorize?: false;
  /** Query parameters */
  searchParams?: Record<string, boolean | number | string>;
  /** Aborts the in-flight request when the signal fires. */
  signal?: AbortSignal;
  /** Enable streaming response */
  stream?: boolean;
  /** Request timeout override */
  timeout?: number;
}

export interface HerokuError {
  id: string;
  message: string;
}

export interface HerokuErrorResponse {
  errors?: HerokuError[];
  id: string;
  message?: string;
  /**
   * The kind of resource that was missing or invalid (e.g. `add_on`,
   * `app`). Returned by the platform on certain 404/422 responses;
   * absent on others.
   */
  resource?: string;
}
