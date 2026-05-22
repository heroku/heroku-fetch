import type {HerokuService, ServiceConfig} from '../types.js'

const HEROKU_V3_ACCEPT = 'application/vnd.heroku+json; version=3'

export const SERVICE_CONFIGS: Record<HerokuService, ServiceConfig> = {
  custom: {
    // Must be provided by user; no Accept default — the URL may be
    // a third-party host (logplex, busl, GitHub) that wouldn't
    // recognize the Heroku vendor MIME type.
    baseUrl: '',
  },
  data: {
    baseUrl: 'https://postgres-api.heroku.com',
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
