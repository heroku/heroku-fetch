/**
 * Netrc file management utilities
 */

import {Netrc} from 'netrc-parser'

import type {NetrcEntry} from './types.js'

import {debugCliLogin} from '../../debug-loggers.js'

// Defer netrc instantiation to avoid eager file operations
let _netrc: Netrc | undefined

export function getNetrc(): Netrc {
  if (!_netrc) {
    _netrc = new Netrc()
  }

  return _netrc
}

/**
 * Save authentication token to netrc file
 */
export async function saveToken(
  entry: NetrcEntry,
  apiHost: string,
  httpGitHost: string,
): Promise<void> {
  debugCliLogin('Saving credentials to netrc for hosts: %s, %s', apiHost, httpGitHost)
  const netrc = getNetrc()
  await netrc.load()
  const hosts = [apiHost, httpGitHost]

  for (const host of hosts) {
    if (!netrc.machines[host]) netrc.machines[host] = {} as any
    netrc.machines[host].login = entry.login
    netrc.machines[host].password = entry.password
    delete (netrc.machines[host] as any).method
    delete (netrc.machines[host] as any).org
    debugCliLogin('Set credentials for host: %s (login: %s)', host, entry.login)
  }

  if (netrc.machines._tokens) {
    // eslint-disable-next-line unicorn/no-array-for-each
    (netrc.machines._tokens as any).forEach((token: any) => {
      if (hosts.includes(token.host)) {
        token.internalWhitespace = '\n  '
      }
    })
  }

  await netrc.save()
  debugCliLogin('Netrc file saved successfully')
}

/**
 * Clear authentication tokens from netrc file
 */
export async function clearTokens(
  apiHost: string,
  httpGitHost: string,
): Promise<void> {
  debugCliLogin('Clearing credentials from netrc for hosts: %s, %s', apiHost, httpGitHost)
  const netrc = getNetrc()
  await netrc.load()
  delete netrc.machines[apiHost]
  delete netrc.machines[httpGitHost]
  await netrc.save()
  debugCliLogin('Credentials cleared from netrc successfully')
}

/**
 * Get stored token from netrc file
 */
export async function getStoredToken(apiHost: string): Promise<string | undefined> {
  debugCliLogin('Reading stored token from netrc for host: %s', apiHost)
  const netrc = getNetrc()
  await netrc.load()
  const entry = netrc.machines[apiHost]
  if (entry?.password) {
    debugCliLogin('Token found in netrc for host: %s', apiHost)
  } else {
    debugCliLogin('No token found in netrc for host: %s', apiHost)
  }

  return entry?.password
}

/**
 * Get stored login from netrc file
 */
export async function getStoredLogin(apiHost: string): Promise<string | undefined> {
  debugCliLogin('Reading stored login from netrc for host: %s', apiHost)
  const netrc = getNetrc()
  await netrc.load()
  const entry = netrc.machines[apiHost]
  if (entry?.login) {
    debugCliLogin('Login found in netrc for host: %s (login: %s)', apiHost, entry.login)
  } else {
    debugCliLogin('No login found in netrc for host: %s', apiHost)
  }

  return entry?.login
}
