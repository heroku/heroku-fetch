import type {HerokuService, ServiceConfig} from '../types.js'

const HEROKU_V3_ACCEPT = 'application/vnd.heroku+json; version=3'

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', '[::1]', 'localhost'])
const TRUSTED_HEROKU_DOMAINS = ['heroku.com', 'herokai.com', 'herokuspace.com', 'herokudev.com']

/**
 * The base URL from the first of `variables` that is set, else `fallback`.
 * Values are trimmed, and blank ones are skipped. A bare hostname gets `https://`;
 * a value with an `http://` or `https://` scheme is parsed as given.
 * `process` and `process.env` are guarded for browser builds.
 *
 * Hostnames must be in an approved Heroku domain or loopback. Plain `http://` is
 * allowed only for loopback hosts (local development), so the client's bearer
 * token is never sent unencrypted to a remote host. Errors name the variable but
 * never echo its value.
 */
function envBaseUrl(variables: string[], fallback: string): string {
  const env = typeof process === 'undefined' ? undefined : process.env
  for (const variable of variables) {
    const value = env?.[variable]?.trim()
    if (!value) continue

    return validatedEnvBaseUrl(variable, value)
  }

  return fallback
}

function validatedEnvBaseUrl(variable: string, value: string): string {
  const explicitScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
  const candidate = explicitScheme ? value : `https://${value}`
  let url: URL

  try {
    url = new URL(candidate)
  } catch {
    throw new Error(`${variable} must be a valid Heroku service URL`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${variable} must use http:// or https://`)
  }

  // URL.username/password omit an empty `@`, so also check the input for that
  // delimiter before accepting the parsed URL.
  if (url.username || url.password || candidate.includes('@')) {
    throw new Error(`${variable} must not include user information`)
  }

  if (url.pathname !== '/' || url.search || url.hash || candidate.includes('?') || candidate.includes('#')) {
    throw new Error(`${variable} must not include a path, query, or fragment`)
  }

  const loopback = LOOPBACK_HOSTNAMES.has(url.hostname)
  if (url.protocol === 'http:' && !loopback) {
    throw new Error(`${variable} must use https:// unless it points at localhost`)
  }

  const approvedDomain = TRUSTED_HEROKU_DOMAINS.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
  if (!loopback && !approvedDomain) {
    throw new Error(`${variable} must use a heroku.com, herokai.com, herokuspace.com, or herokudev.com host`)
  }

  return url.origin
}

/**
 * Per-service defaults. Services whose host can be overridden by an environment
 * variable use a `baseUrl` getter, so the variable is read when each client is
 * built, not at import. `platform` honors `HEROKU_PLATFORM_HOST`, then
 * `HEROKU_API_URL`, the variable Heroku credential-manager's login reads, so a
 * token from that login is sent to the host it was issued for. `data` honors
 * `HEROKU_DATA_HOST`, then `HEROKU_POSTGRESQL_HOST`, the variables the Heroku
 * CLI has long used for the data API. `notifications` and `repositories` set no
 * Accept default, matching what those hosts have always been sent.
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
      return envBaseUrl(['HEROKU_DATA_HOST', 'HEROKU_POSTGRESQL_HOST'], 'https://api.data.heroku.com')
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
    get baseUrl() {
      return envBaseUrl(['HEROKU_PLATFORM_HOST', 'HEROKU_API_URL'], 'https://api.heroku.com')
    },
    defaultAccept: HEROKU_V3_ACCEPT,
  },
  repositories: {
    get baseUrl() {
      return envBaseUrl(['HEROKU_REPOSITORIES_HOST'], 'https://kolkrabbi.heroku.com')
    },
  },
}
