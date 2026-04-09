/**
 * Browser-based OAuth login flow
 */

import os from 'node:os'

import type {Account, LoginConfig, NetrcEntry} from './types.js'

import {debugCliLogin} from '../../debug-loggers.js'
import {headers} from './types.js'

const hostname = os.hostname()

/**
 * Show the manual browser login URL to the user
 */
function showManualBrowserLoginUrl(url: string): void {
  console.warn('If browser does not open, visit:')
  console.error(`\u001B[32m${url}\u001B[0m`) // Green color
}

/**
 * Poll the auth server for the access token with retry logic
 */
async function fetchAuth(
  loginHost: string,
  cliUrl: string,
  token: string,
  retries = 3,
): Promise<{access_token: string; error?: string}> {
  try {
    debugCliLogin('Polling auth server: %s%s (retries left: %d)', loginHost, cliUrl, retries)
    const response = await fetch(`${loginHost}${cliUrl}`, {
      headers: {Authorization: `Bearer ${token}`},
    })

    if (!response.ok && retries > 0 && response.status >= 500) {
      debugCliLogin('Auth server returned %d, retrying...', response.status)
      return fetchAuth(loginHost, cliUrl, token, retries - 1)
    }

    if (!response.ok) {
      debugCliLogin('Auth polling failed with status: %d', response.status)
      throw new Error(`Login failed: ${response.statusText}`)
    }

    debugCliLogin('Access token received from auth server')
    return (await response.json()) as {
      access_token: string;
      error?: string;
    }
  } catch (error: unknown) {
    if (
      retries > 0
      && error instanceof Error
      && error.message.includes('500')
    ) {
      debugCliLogin('Caught 500 error, retrying...')
      return fetchAuth(loginHost, cliUrl, token, retries - 1)
    }

    debugCliLogin('Auth polling failed: %O', error)
    throw error
  }
}

/**
 * Perform browser-based OAuth login
 */
export async function browserLogin(
  config: LoginConfig,
  browser?: string,
): Promise<NetrcEntry> {
  debugCliLogin('Starting browser login flow')
  debugCliLogin('Creating auth session at %s/auth', config.loginHost)

  // Create auth session
  const response = await fetch(`${config.loginHost}/auth`, {
    body: JSON.stringify({
      description: `Heroku CLI login from ${hostname}`,
    }),
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
  })

  if (!response.ok) {
    debugCliLogin('Failed to create auth session: %d %s', response.status, response.statusText)
    throw new Error(`Failed to initiate browser login: ${response.statusText}`)
  }

  const urls = (await response.json()) as {
    browser_url: string;
    cli_url: string;
    token: string;
  }

  const url = `${config.loginHost}${urls.browser_url}`
  debugCliLogin('Auth session created, browser URL: %s', url)
  console.error(`Opening browser to ${url}\n`)

  let urlDisplayed = false
  const showUrl = () => {
    if (!urlDisplayed) console.warn('Cannot open browser.')
    urlDisplayed = true
  }

  showManualBrowserLoginUrl(url)

  const open = (await import('open')).default
  debugCliLogin('Opening browser with %s', browser ? `browser: ${browser}` : 'default browser')
  const cp = await open(url, {
    wait: false,
    ...(browser ? {app: {name: browser}} : {}),
  })
  cp.on('error', err => {
    debugCliLogin('Browser open error: %O', err)
    console.warn(err)
    showUrl()
  })
  if (process.env.HEROKU_TESTING_HEADLESS_LOGIN === '1') showUrl()
  cp.on('close', code => {
    if (code !== 0) {
      debugCliLogin('Browser process exited with non-zero code: %d', code)
      showUrl()
    }
  })

  console.error('heroku: Waiting for login...')

  const auth = await fetchAuth(
    config.loginHost,
    urls.cli_url,
    urls.token,
  )

  if (auth.error) {
    debugCliLogin('Auth response contained error: %s', auth.error)
    throw new Error(auth.error)
  }

  console.error('Logging in...')
  debugCliLogin('Fetching account information from %s/account', config.apiUrl)

  const accountResponse = await fetch(`${config.apiUrl}/account`, {
    headers: headers(auth.access_token),
  })

  if (!accountResponse.ok) {
    debugCliLogin('Failed to fetch account: %d %s', accountResponse.status, accountResponse.statusText)
    throw new Error(`Failed to fetch account: ${accountResponse.statusText}`)
  }

  const account = (await accountResponse.json()) as Account
  debugCliLogin('Browser login successful for user: %s', account.email)

  return {
    login: account.email,
    password: auth.access_token,
  }
}
