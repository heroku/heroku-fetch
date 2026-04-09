/**
 * Browser-specific entry point for @heroku/api-client
 *
 * This entry point excludes Node.js-specific features like:
 * - CLI utilities (login, 2FA prompts)
 * - File system access (netrc)
 * - Process environment variables
 *
 * Use this entry point when bundling for browser environments.
 */

export {HerokuApiClient} from './client/index.js'
export {
  AuthenticationError,
  HerokuApiError,
  NotFoundError,
  RateLimitError,
  TwoFactorRequiredError,
} from './errors.js'
export type {
  HerokuApiClientOptions,
  HerokuError,
  HerokuErrorResponse,
  HerokuService,
  RequestOptions,
  ServiceConfig,
  TokenProvider,
  TwoFactorOptions,
} from './types.js'
