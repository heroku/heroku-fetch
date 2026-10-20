/**
 * Heroku API Client
 *
 * Main client class for making HTTP requests to Heroku APIs.
 * Supports multiple services (platform, data, particleboard), authentication,
 * two-factor authentication, and comprehensive error handling.
 */

import {getDefaultFetch, getDefaultTokenProvider, getDefaultTwoFactorOptions} from '@heroku/heroku-fetch/client/environment-defaults.js'
import ky, {type KyInstance, type Options as KyOptions} from 'ky'

import type {
  HerokuApiClientOptions,
  RequestOptions,
  TokenProvider,
} from '../types.js'

import {debugAuth, debugRequest} from '../debug-loggers.js'
import {
  create2FAAfterHook,
  createBeforeRequestHook,
  createErrorAfterHook,
  createMetadataAfterHook,
  createRequestIdAfterHook,
  createRequestIdBeforeHook,
  createWarningAfterHook,
} from './http-request-hooks.js'
import {RequestIdStore} from './request-id.js'
import {SERVICE_CONFIGS} from './service-configurations.js'

export class HerokuApiClient {
  private clientPromise: null | Promise<KyInstance> = null
  private kyOptions: KyOptions
  private options: Partial<HerokuApiClientOptions>
    & Required<Pick<HerokuApiClientOptions, 'service' | 'timeout'>>
  // Per-client cross-cutting request state: the Request-Id accumulation and the
  // set of warnings already surfaced, so dedupe spans a multi-request session
  // but resets per client and parallel clients stay isolated.
  private readonly requestIds = new RequestIdStore()
  // A second ky instance for the 2FA retry: same beforeRequest pipeline and
  // proxy-aware fetch as the main client, but no afterResponse hooks. The retry
  // response is handed back to the main client's afterResponse chain, which
  // runs error/Request-Id/warning/metadata/consumer handling on it exactly
  // once — so routing the retry here can't double-fire those hooks.
  private retryClientPromise: null | Promise<KyInstance> = null
  private readonly shownWarnings = new Set<string>()
  private tokenProvider?: TokenProvider
  private twoFactorAttempted = {value: false}

  constructor(options: HerokuApiClientOptions = {}) {
    this.options = {
      service: options.service || 'platform',
      timeout: options.timeout || 30_000,
      ...options,
    }

    // If no token provided, use default token provider
    this.tokenProvider = options.token === undefined ? getDefaultTokenProvider() : options.token

    // If no twoFactor provided, use default 2FA handler
    if (!options.twoFactor) {
      this.options.twoFactor = getDefaultTwoFactorOptions()
    }

    // Determine base URL
    const serviceConfig = SERVICE_CONFIGS[this.options.service]
    let baseUrl = options.baseUrl || serviceConfig.baseUrl

    if (this.options.service === 'custom' && !options.baseUrl) {
      throw new Error('baseUrl is required when service is "custom"')
    }

    // Apply region if specified (for services that support it)
    if (options.region && this.options.service === 'data') {
      baseUrl = `https://postgres-api-${options.region}.heroku.com`
    }

    debugAuth('Initializing client for service: %s, baseUrl: %s', this.options.service, baseUrl)

    // Stash the ky options; the actual ky instance is built lazily so
    // we can await getDefaultFetch() (Node loads undici dynamically for
    // env-var proxy support).
    this.kyOptions = {
      hooks: {
        // Order matters: the 2FA hook runs first (so it sees a challenge before
        // it's thrown as an error and can retry), then the error hook throws on
        // a non-ok response — so the Request-Id tracking, warning, and metadata
        // hooks after it run only on the success path.
        afterResponse: [
          create2FAAfterHook(
            this.options.twoFactor,
            this.twoFactorAttempted,
            request => this.retryThroughClient(request),
          ),
          createErrorAfterHook(),
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
          createBeforeRequestHook(
            () => this.getToken(),
            // A per-client override wins over the shared service default, but
            // is still only applied when the request has no Accept of its own.
            options.defaultAccept ?? serviceConfig.defaultAccept,
            options.headers,
            this.options.debug,
          ),
          createRequestIdBeforeHook(this.requestIds),
          // Consumer hooks run last: they see (and may override) the fully
          // prepared request after auth, Accept, and Request-Id are attached.
          ...(options.hooks?.beforeRequest ?? []),
        ],
      },
      prefix: baseUrl,
      timeout: this.options.timeout,
    }
  }

  /**
   * Make a DELETE request
   */
  public async delete(path: string, options?: RequestOptions): Promise<Response> {
    debugRequest('DELETE %s', path)
    return this.request(path, {...options, method: 'DELETE'})
  }

  /**
   * Make a GET request
   */
  public async get(path: string, options?: RequestOptions): Promise<Response> {
    debugRequest('GET %s', path)
    return this.request(path, {...options, method: 'GET'})
  }

  /**
   * Make a PATCH request
   */
  public async patch(path: string, body?: unknown, options?: RequestOptions): Promise<Response> {
    debugRequest('PATCH %s', path)
    return this.request(path, {...options, body, method: 'PATCH'})
  }

  /**
   * Make a POST request
   */
  public async post(path: string, body?: unknown, options?: RequestOptions): Promise<Response> {
    debugRequest('POST %s', path)
    return this.request(path, {...options, body, method: 'POST'})
  }

  /**
   * Make a PUT request
   */
  public async put(path: string, body?: unknown, options?: RequestOptions): Promise<Response> {
    debugRequest('PUT %s', path)
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
    // Everything else — hooks, headers, the Accept default, the 2FA handler,
    // and the base URL derived from service/region — is baked into the cached
    // ky instance at construction; mutating it here would silently no-op, so
    // reject it rather than lie about the change landing.
    if (key === 'timeout' || key === 'warn' || key === 'onResponseMetadata') {
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
    debugRequest('STREAM %s', path)

    const kyOptions: KyOptions = {
      headers: options?.headers,
      method: 'GET',
      searchParams: options?.searchParams,
      signal: options?.signal,
      timeout: options?.timeout || this.options.timeout,
    }

    const client = await this.getClient()
    return client(path, kyOptions)
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
   * Lazily construct the retry client used for 2FA re-issue: the same
   * beforeRequest pipeline and proxy-aware fetch as `getClient`, but with
   * no afterResponse hooks, so the retry's response is processed once by the
   * main client's afterResponse chain rather than twice. Cached after the first
   * call.
   */
  private async getRetryClient(): Promise<KyInstance> {
    if (!this.retryClientPromise) {
      this.retryClientPromise = (async () => {
        const fetch = await getDefaultFetch()
        return ky.create({
          ...this.kyOptions,
          fetch,
          hooks: {...this.kyOptions.hooks, afterResponse: []},
        })
      })()
    }

    return this.retryClientPromise
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
   * Make a request with full control over options
   */
  private async request(
    path: string,
    options?: RequestOptions & {body?: unknown; method?: string;},
  ): Promise<Response> {
    const kyOptions: KyOptions = {
      headers: options?.headers,
      method: options?.method || 'GET',
      searchParams: options?.searchParams,
      signal: options?.signal,
      timeout: options?.timeout || this.options.timeout,
    }

    if (options?.body !== undefined) {
      kyOptions.json = options.body
    }

    const client = await this.getClient()
    return client(path, kyOptions)
  }

  /**
   * Re-issue a request (with the 2FA code attached) through the retry client,
   * which shares this client's beforeRequest pipeline and proxy-aware fetch.
   */
  private async retryThroughClient(request: Request): Promise<Response> {
    const client = await this.getRetryClient()
    return client(request)
  }
}
