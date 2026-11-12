import type {HerokuService, ServiceConfig} from '../types.js'

const HEROKU_V3_ACCEPT = 'application/vnd.heroku+json; version=3'

/**
 * The base URL from the first of `variables` that is set, else `fallback`.
 * Values are trimmed, and blank ones are skipped. A bare hostname gets `https://`;
 * a value with an `http://` or `https://` scheme, in any case, is used as-is.
 * `process` and `process.env` are guarded for browser builds.
 */
function envBaseUrl(variables: string[], fallback: string): string {
  const env = typeof process === 'undefined' ? undefined : process.env
  for (const variable of variables) {
    const host = env?.[variable]?.trim()
    if (host) return /^https?:\/\//i.test(host) ? host : `https://${host}`
  }

  return fallback
}

/**
 * Per-service defaults. Services whose host can be overridden by an environment
 * variable use a `baseUrl` getter, so the variable is read when each client is
 * built, not at import. `data` honors `HEROKU_DATA_HOST`, then
 * `HEROKU_POSTGRESQL_HOST`, the variables the Heroku CLI has long used for the
 * data API. `notifications` and `repositories` set no Accept default,
 * matching what those hosts have always been sent.
 */
export const SERVICE_CONFIGS: Record<HerokuService, ServiceConfig> = {
  custom: {
    // Must be provided by user; no Accept default — the URL may be
    // a third-party host (logplex, busl, GitHub) that wouldn't
    // recognize the Heroku vendor MIME type.
    baseUrl: '',
  },
  data: {
    get baseUrl() {
      return envBaseUrl(['HEROKU_DATA_HOST', 'HEROKU_POSTGRESQL_HOST'], 'https://postgres-api.heroku.com')
    },
    defaultAccept: HEROKU_V3_ACCEPT,
  },
  metrics: {
    get baseUrl() {
      return envBaseUrl(['HEROKU_METRICS_HOST'], 'https://api.metrics.heroku.com')
    },
    defaultAccept: HEROKU_V3_ACCEPT,
  },
  notifications: {
    get baseUrl() {
      return envBaseUrl(['HEROKU_NOTIFICATIONS_HOST'], 'https://telex.heroku.com')
    },
  },
  particleboard: {
    get baseUrl() {
      return envBaseUrl(['HEROKU_PARTICLEBOARD_URL'], 'https://particleboard.heroku.com')
    },
    defaultAccept: HEROKU_V3_ACCEPT,
  },
  platform: {
    baseUrl: 'https://api.heroku.com',
    defaultAccept: HEROKU_V3_ACCEPT,
  },
  repositories: {
    get baseUrl() {
      return envBaseUrl(['HEROKU_REPOSITORIES_HOST'], 'https://kolkrabbi.heroku.com')
    },
  },
}
