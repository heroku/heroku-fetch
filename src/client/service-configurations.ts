import type {HerokuService, ServiceConfig} from '../types.js'

const HEROKU_V3_ACCEPT = 'application/vnd.heroku+json; version=3'

/** An environment variable's value, or `undefined` in browser builds (no `process`). */
function readEnv(name: string): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env[name]
}

/** A bare hostname gets `https://`; a value with an `http://` or `https://` scheme, in any case, is used as-is. */
function toBaseUrl(host: string): string {
  return /^https?:\/\//i.test(host) ? host : `https://${host}`
}

/**
 * The data API base URL: `HEROKU_DATA_HOST`, then `HEROKU_POSTGRESQL_HOST`,
 * then `https://postgres-api.heroku.com`. These are the variables the Heroku
 * CLI has long honored for the data API.
 */
function dataBaseUrl(): string {
  const host = readEnv('HEROKU_DATA_HOST') || readEnv('HEROKU_POSTGRESQL_HOST')
  return host ? toBaseUrl(host) : 'https://postgres-api.heroku.com'
}

/** The particleboard base URL: `HEROKU_PARTICLEBOARD_URL`, then `https://particleboard.heroku.com`. */
function particleboardBaseUrl(): string {
  const host = readEnv('HEROKU_PARTICLEBOARD_URL')
  return host ? toBaseUrl(host) : 'https://particleboard.heroku.com'
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
    // A getter so the environment is read when each client is built, not at import.
    get baseUrl() {
      return particleboardBaseUrl()
    },
    defaultAccept: HEROKU_V3_ACCEPT,
  },
  platform: {
    baseUrl: 'https://api.heroku.com',
    defaultAccept: HEROKU_V3_ACCEPT,
  },
}
