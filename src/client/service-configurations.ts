import type {HerokuService, ServiceConfig} from '../types.js'

const HEROKU_V3_ACCEPT = 'application/vnd.heroku+json; version=3'
const DATA_API_DEFAULT = 'https://api.data.heroku.com'
const HEROKU_DATA_DOMAINS = ['heroku.com', 'herokai.com', 'herokuspace.com', 'herokudev.com']
const LOOPBACK_HOSTNAMES = new Set(['[::1]', 'localhost'])

function containsControlCharacter(value: string): boolean {
  return [...value].some(character => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 32 || (codePoint >= 127 && codePoint <= 159)
  })
}

function isLoopback(hostname: string): boolean {
  if (LOOPBACK_HOSTNAMES.has(hostname)) return true
  if (!hostname.startsWith('127.')) return false

  const octets = hostname.split('.')
  return octets.length === 4 && octets.every(octet => /^\d+$/.test(octet) && Number(octet) <= 255)
}

function isTrustedDataHost(url: URL): boolean {
  const localHost = isLoopback(url.hostname)
  const herokuDomain = HEROKU_DATA_DOMAINS.some(domain => (
    url.hostname === domain || url.hostname.endsWith(`.${domain}`)
  ))

  if (localHost) return url.protocol === 'http:' || url.protocol === 'https:'
  // The CLI's established trust check is hostname-based, so retain support
  // for explicit remote ports on Heroku-owned domains.
  return herokuDomain && url.protocol === 'https:'
}

/**
 * Validate and normalize a data API host to its origin. Rejecting paths and
 * other URL components here prevents the configured value from altering API
 * route construction or carrying credentials to an unexpected destination.
 */
export function resolveDataBaseUrl(host: string): string {
  if (host !== host.trim() || containsControlCharacter(host) || /[\\?#]/.test(host)) {
    throw new Error('Invalid data API host')
  }

  const urlInput = host.includes('://') ? host : `https://${host}`
  const urlParts = urlInput.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#\\]*)(.*)$/i)
  if (!urlParts) throw new Error('Invalid data API host')
  const [, authority, path] = urlParts
  if (authority.includes('@') || authority.endsWith(':') || (path !== '' && path !== '/')) {
    throw new Error('Invalid data API host')
  }

  let url: URL
  try {
    url = new URL(urlInput)
  } catch {
    throw new Error('Invalid data API host')
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid data API host')
  }

  if (!isTrustedDataHost(url)) {
    throw new Error('Refusing to send Heroku credentials to untrusted data API host')
  }

  return url.origin
}

/**
 * The data API base URL: `HEROKU_DATA_HOST`, then `HEROKU_POSTGRESQL_HOST`,
 * then the CLI-established `https://api.data.heroku.com`. These are the
 * variables the Heroku CLI has long honored for the data API. `process` is
 * guarded for browser builds.
 */
function dataBaseUrl(): string {
  const env = typeof process === 'undefined' ? undefined : process.env
  const host = env?.HEROKU_DATA_HOST || env?.HEROKU_POSTGRESQL_HOST
  return host ? resolveDataBaseUrl(host) : DATA_API_DEFAULT
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
