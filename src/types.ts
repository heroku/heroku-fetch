export type HerokuService = 'custom' | 'data' | 'particleboard' | 'platform'

export type TokenProvider = (() => Promise<string> | string) | string

export interface TwoFactorOptions {
  /** Callback function to prompt for 2FA code */
  onChallenge: () => Promise<string> | string;
}

export interface ServiceConfig {
  /** Base URL for the service */
  baseUrl: string;
  /** Default region (if applicable) */
  region?: string;
}

export interface HerokuApiClientOptions {
  /** Custom base URL (for 'custom' service type) */
  baseUrl?: string;
  /** Enable debugging */
  debug?: boolean;
  /** Additional custom headers */
  headers?: Record<string, string>;
  /** Service region (e.g., 'eu', 'us') */
  region?: string;
  /** Heroku service type (platform, data, particleboard, custom) */
  service?: HerokuService;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Static bearer token or function to retrieve token */
  token?: TokenProvider;
  /** Two-factor authentication configuration */
  twoFactor?: TwoFactorOptions;
}

export interface RequestOptions {
  /** Additional headers for this request */
  headers?: Record<string, string>;
  /** Query parameters */
  searchParams?: Record<string, boolean | number | string>;
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
