import {
  afterEach, describe, expect, it, vi,
} from 'vitest'

import {HerokuApiClient} from './index.js'
import {SERVICE_CONFIGS} from './service-configurations.js'

describe('environment service host configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    ['data', 'HEROKU_DATA_HOST'],
    ['data', 'HEROKU_POSTGRESQL_HOST'],
    ['metrics', 'HEROKU_METRICS_HOST'],
    ['notifications', 'HEROKU_NOTIFICATIONS_HOST'],
    ['particleboard', 'HEROKU_PARTICLEBOARD_URL'],
    ['repositories', 'HEROKU_REPOSITORIES_HOST'],
  ] as const)('rejects untrusted hosts and names %s variable (%s)', (service, variable) => {
    vi.stubEnv(variable, 'https://attacker.example')
    if (variable === 'HEROKU_POSTGRESQL_HOST') vi.stubEnv('HEROKU_DATA_HOST', '')

    const error = (() => {
      try {
        return SERVICE_CONFIGS[service].baseUrl
      } catch (error_) {
        return error_
      }
    })()

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(variable)
    expect((error as Error).message).not.toContain('attacker.example')
  })

  it.each([
    'https://attacker.example',
    'https://not-heroku.com',
    'https://heroku.com.attacker.example',
    'https://shogun-staging.herokuapp.com',
    'https://api.data.heroku.com.',
  ])('rejects unapproved data host %s', value => {
    vi.stubEnv('HEROKU_DATA_HOST', value)

    expect(() => SERVICE_CONFIGS.data.baseUrl)
      .toThrow('HEROKU_DATA_HOST must use a heroku.com, herokai.com, herokuspace.com, or herokudev.com host')
  })

  it.each([
    'https://user:secret@api.data.heroku.com',
    String.raw`https://evil.example\@api.data.heroku.com`,
    String.raw`https://api.data.heroku.com\@evil.example`,
    'https://api.data.heroku.com/postgres',
    'https://api.data.heroku.com?debug=1',
    'https://api.data.heroku.com?',
    'https://api.data.heroku.com#fragment',
    'https://api.data.heroku.com#',
    'ftp://api.data.heroku.com',
    'ftp://localhost',
  ])('rejects non-origin data URL %s', value => {
    vi.stubEnv('HEROKU_DATA_HOST', value)

    expect(() => SERVICE_CONFIGS.data.baseUrl).toThrow()
  })

  it('normalizes approved URLs and trims values', () => {
    vi.stubEnv('HEROKU_DATA_HOST', '  HTTPS://API.DATA.HEROKU.COM:443/\n')

    expect(SERVICE_CONFIGS.data.baseUrl).toBe('https://api.data.heroku.com')
  })

  it('skips a blank primary data host and falls back to the PostgreSQL host', () => {
    vi.stubEnv('HEROKU_DATA_HOST', ' ')
    vi.stubEnv('HEROKU_POSTGRESQL_HOST', 'postgres-api.heroku.com')

    expect(SERVICE_CONFIGS.data.baseUrl).toBe('https://postgres-api.heroku.com')
  })

  it('permits HTTP only for configured loopback hosts', () => {
    vi.stubEnv('HEROKU_DATA_HOST', 'http://localhost:5000')

    expect(SERVICE_CONFIGS.data.baseUrl).toBe('http://localhost:5000')
  })

  it('rejects insecure remote hosts without falling through to the next variable', () => {
    vi.stubEnv('HEROKU_DATA_HOST', 'http://api.data.heroku.com')
    vi.stubEnv('HEROKU_POSTGRESQL_HOST', 'postgres-api.heroku.com')

    expect(() => SERVICE_CONFIGS.data.baseUrl)
      .toThrow('HEROKU_DATA_HOST must use https:// unless it points at localhost')
  })

  it('does not inspect environment hosts when explicit baseUrl is supplied', () => {
    vi.stubEnv('HEROKU_DATA_HOST', 'https://attacker.example')

    expect(() => new HerokuApiClient({
      baseUrl: 'https://custom.example.com',
      service: 'data',
      token: 'test-token',
    })).not.toThrow()
  })
})
