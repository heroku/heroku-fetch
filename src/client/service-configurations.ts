import type {HerokuService, ServiceConfig} from '../types.js'

const HEROKU_V3_ACCEPT = 'application/vnd.heroku+json; version=3'

/**
 * The data API base URL: `HEROKU_DATA_HOST`, then `HEROKU_POSTGRESQL_HOST`,
 * then `https://postgres-api.heroku.com`. These are the variables the Heroku
 * CLI has long honored for the data API. A bare hostname gets `https://`; a
 * value with a scheme is used as-is. `process` is guarded for browser builds.
 */
function dataBaseUrl(): string {
  const env = typeof process === 'undefined' ? undefined : process.env
  const host = env?.HEROKU_DATA_HOST || env?.HEROKU_POSTGRESQL_HOST
  if (!host) return 'https://postgres-api.heroku.com'
  return /^https?:\/\//.test(host) ? host : `https://${host}`
}

export const SERVICE_CONFIGS: Record<HerokuService, ServiceConfig> = {
  custom: {
    // Must be provided by user; no Accept default — the URL may be
    // a third-party host (logplex, busl, GitHub) that wouldn't
    // recognize the Heroku vendor MIME type.
    baseUrl: '',
  },
  data: {
    // A getter so the environment is read when each client is built, not at import.
    get baseUrl() {
      return dataBaseUrl()
    },
    defaultAccept: HEROKU_V3_ACCEPT,
  },
  particleboard: {
    baseUrl: 'https://particleboard.heroku.com',
    defaultAccept: HEROKU_V3_ACCEPT,
  },
  platform: {
    baseUrl: 'https://api.heroku.com',
    defaultAccept: HEROKU_V3_ACCEPT,
  },
}
