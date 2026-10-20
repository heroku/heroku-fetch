/**
 * Browser-specific entry point for @heroku/heroku-fetch
 *
 * This entry point excludes Node.js-specific features like:
 * - CLI utilities (2FA prompts)
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
export type * from './public-types.js'
