import type {HerokuService, ServiceConfig} from '../types.js'

export const SERVICE_CONFIGS: Record<HerokuService, ServiceConfig> = {
  custom: {
    baseUrl: '', // Must be provided by user
  },
  data: {
    baseUrl: 'https://postgres-api.heroku.com',
  },
  particleboard: {
    baseUrl: 'https://particleboard.heroku.com',
  },
  platform: {
    baseUrl: 'https://api.heroku.com',
  },
}
