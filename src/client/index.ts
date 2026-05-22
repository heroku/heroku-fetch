/**
 * Heroku API Client
 *
 * Main client class for making HTTP requests to Heroku APIs.
 * Supports multiple services (platform, data, particleboard), authentication,
 * two-factor authentication, and comprehensive error handling.
 */

import {getDefaultDispatcher, getDefaultTokenProvider, getDefaultTwoFactorOptions} from '@heroku/heroku-fetch/client/environment-defaults.js'
import ky, {type KyInstance, type Options as KyOptions} from 'ky'

import type {
  HerokuApiClientOptions,
  RequestOptions,
  TokenProvider,
} from '../types.js'

import {debugAuth, debugRequest} from '../debug-loggers.js'
import {createAfterResponseHook, createBeforeRequestHook} from './http-request-hooks.js'
import {SERVICE_CONFIGS} from './service-configurations.js'

export class HerokuApiClient {
  private clientPromise: null | Promise<KyInstance> = null
  private kyOptions: KyOptions
  private options: Partial<HerokuApiClientOptions>
    & Required<Pick<HerokuApiClientOptions, 'service' | 'timeout'>>
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
    // we can await getDefaultDispatcher() (Node loads undici
    // dynamically for env-var proxy support).
    this.kyOptions = {
      hooks: {
        afterResponse: [
          createAfterResponseHook(
            this.options.twoFactor,
            this.twoFactorAttempted,
          ),
        ],
        beforeRequest: [
          createBeforeRequestHook(
            () => this.getToken(),
            serviceConfig.defaultAccept,
            options.headers,
            this.options.debug,
          ),
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
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.options as any)[key] = value
    }
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
      timeout: options?.timeout || this.options.timeout,
    }

    const client = await this.getClient()
    return client(path, kyOptions)
  }

  /**
   * Lazily construct ky with an env-aware undici dispatcher (Node)
   * or no dispatcher (browser). Cached after the first call.
   */
  private async getClient(): Promise<KyInstance> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const dispatcher = await getDefaultDispatcher()
        // ky's type definitions don't include `dispatcher`; it's
        // passed through to fetch as undici expects it.
        const opts: KyOptions = dispatcher
          ? ({...this.kyOptions, dispatcher} as never)
          : this.kyOptions
        return ky.create(opts)
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
      timeout: options?.timeout || this.options.timeout,
    }

    if (options?.body !== undefined) {
      kyOptions.json = options.body
    }

    const client = await this.getClient()
    return client(path, kyOptions)
  }
}
