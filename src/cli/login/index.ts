/**
 * CLI Login Module
 *
 * Provides login/logout functionality for Heroku CLI tools.
 * Supports browser-based, interactive (username/password), and SSO login methods.
 *
 * @example
 * ```typescript
 * import { Login } from '@heroku/heroku-fetch/cli-login';
 * import { HerokuApiClient } from '@heroku/heroku-fetch';
 *
 * const client = new HerokuApiClient({ service: 'platform' });
 * const login = new Login(client);
 *
 * // Browser-based login (default)
 * await login.login({ method: 'browser' });
 *
 * // Interactive login with username/password
 * await login.login({ method: 'interactive' });
 *
 * // Logout
 * await login.logout();
 * ```
 */

import * as readline from 'node:readline'

import type {HerokuApiClient} from '../../client/index.js'
import type {LoginConfig, LoginOptions, NetrcEntry} from './types.js'

import {debugCliLogin} from '../../debug-loggers.js'
import {browserLogin} from './browser-login.js'
import {interactiveLogin} from './interactive-login.js'
import {
  clearTokens,
  getNetrc,
  getStoredLogin,
  getStoredToken,
  saveToken,
} from './netrc-utils.js'
import {deleteOAuthTokens} from './oauth.js'
import {ssoLogin} from './sso-login.js'
import {LOGIN_TIMEOUT, THIRTY_DAYS} from './types.js'

// Re-export types for convenience

/**
 * Prompt user for login method selection
 */
async function promptForLoginMethod(): Promise<string> {
  console.error('heroku: Press any key to open up the browser to login or \'q\' to exit')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  // Set raw mode to get immediate keypresses
  process.stdin.setRawMode(true)
  process.stdin.resume()
  const key = await new Promise<string>(resolve => {
    process.stdin.once('data', data => {
      const key = data.toString()
      resolve(key)
    })
  })
  // Restore normal terminal settings
  process.stdin.setRawMode(false)
  rl.close()
  console.error('')
  return key
}

/**
 * Convert keypress to login method
 */
function getLoginMethodFromPromptKey(key: string): 'browser' {
  if (key === '\u0003') {
    // Ctrl+C
    throw new Error('Login cancelled by user')
  }

  if (key.toLowerCase() === 'q') {
    throw new Error('Login cancelled by user')
  }

  return 'browser'
}

export class Login {
  private config: LoginConfig

  constructor(private readonly heroku: HerokuApiClient) {
    this.config = {
      apiHost: 'api.heroku.com',
      apiUrl: process.env.HEROKU_API_URL || 'https://api.heroku.com',
      httpGitHost: 'git.heroku.com',
      loginHost: process.env.HEROKU_LOGIN_HOST || 'https://cli-auth.heroku.com',
    }
  }

  async login(opts: LoginOptions = {}): Promise<void> {
    debugCliLogin('Login initiated with options: %O', opts)
    let loggedIn = false
    try {
      // timeout after 10 minutes
      setTimeout(() => {
        if (!loggedIn) throw new Error('Login timed out')
      }, LOGIN_TIMEOUT).unref()

      if (process.env.HEROKU_API_KEY) {
        debugCliLogin('Login blocked: HEROKU_API_KEY environment variable is set')
        throw new Error('Cannot log in with HEROKU_API_KEY set')
      }

      if (opts.expiresIn && opts.expiresIn > THIRTY_DAYS) {
        debugCliLogin('Login blocked: expiresIn (%d) exceeds 30 days', opts.expiresIn)
        throw new Error('Cannot set an expiration longer than thirty days')
      }

      const netrc = getNetrc()
      await netrc.load()
      const previousEntry = netrc.machines[this.config.apiHost]
      if (previousEntry) {
        debugCliLogin('Found existing credentials in netrc for: %s', previousEntry.login)
      }

      let input: string | undefined = opts.method

      // Determine login method
      if (input) {
        debugCliLogin('Using specified login method: %s', input)
      } else if (opts.expiresIn) {
        // can't use browser with --expires-in
        input = 'interactive'
        debugCliLogin('Selected interactive login (expiresIn specified)')
      } else if (process.env.HEROKU_LEGACY_SSO === '1') {
        input = 'sso'
        debugCliLogin('Selected SSO login (HEROKU_LEGACY_SSO=1)')
      } else {
        const key = await promptForLoginMethod()
        input = getLoginMethodFromPromptKey(key)
        debugCliLogin('Selected %s login (from user prompt)', input)
      }

      // Logout previous session
      try {
        if (previousEntry && previousEntry.password) {
          debugCliLogin('Logging out previous session')
          await this.logout(previousEntry.password)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        debugCliLogin('Previous session logout failed: %s', message)
        console.warn(message)
      }

      // Perform login based on selected method
      let auth: NetrcEntry
      switch (input) {
        case 'b':
        case 'browser': {
          debugCliLogin('Executing browser login')
          auth = await browserLogin(this.config, opts.browser)
          break
        }

        case 'i':
        case 'interactive': {
          debugCliLogin('Executing interactive login')
          const previousLogin = await getStoredLogin(this.config.apiHost)
          auth = await interactiveLogin(
            this.config,
            previousLogin,
            opts.expiresIn,
          )
          break
        }

        case 's':
        case 'sso': {
          debugCliLogin('Executing SSO login')
          auth = await ssoLogin(this.config)
          break
        }

        default: {
          debugCliLogin('Unknown login method: %s, retrying', input)
          return this.login(opts)
        }
      }

      await saveToken(auth, this.config.apiHost, this.config.httpGitHost)
      debugCliLogin('Login completed successfully for user: %s', auth.login)
      console.error(`Logged in as ${auth.login}`)
    } finally {
      loggedIn = true
    }
  }

  async logout(token?: string) {
    debugCliLogin('Logout initiated')
    // Get token from netrc if not provided
    if (!token) {
      token = await getStoredToken(this.config.apiHost)
    }

    if (!token) {
      debugCliLogin('no credentials to logout')
      return
    }

    // Delete OAuth tokens and sessions from API
    // If this fails (e.g., token not found), we still want to clear local netrc
    try {
      await deleteOAuthTokens(this.heroku, token)
    } catch (error) {
      debugCliLogin('Failed to delete OAuth tokens from API: %O', error)
      // Continue to clear netrc even if API call fails
    }

    // Clear netrc entries
    await clearTokens(this.config.apiHost, this.config.httpGitHost)

    console.error('Logged out')
  }
}

export {type LoginOptions} from './types.js'
