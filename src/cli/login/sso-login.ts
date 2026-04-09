/**
 * SSO (Single Sign-On) login flow
 */

import {prompt} from '@heroku/heroku-cli-util/hux'

import type {Account, LoginConfig, NetrcEntry} from './types.js'

import {debugCliLogin} from '../../debug-loggers.js'
import {headers} from './types.js'

/**
 * Perform SSO login
 */
export async function ssoLogin(config: LoginConfig): Promise<NetrcEntry> {
  const open = (await import('open')).default
  let url = process.env.SSO_URL
  let org = process.env.HEROKU_ORGANIZATION

  if (!url) {
    const orgName = await prompt('Organization name', {
      default: org,
      type: 'input',
    })
    org = orgName
    url = `https://sso.heroku.com/saml/${encodeURIComponent(org!)}/init?cli=true`
  }

  debugCliLogin(`opening browser to ${url}`)
  console.error(`Opening browser to:\n${url}\n`)
  console.error('\u001B[90mIf the browser fails to open or you\'re authenticating on a remote\nmachine, please manually open the URL above in your browser.\u001B[0m\n')
  await open(url, {wait: false})

  const password = await prompt('Access token', {
    type: 'password',
  })

  console.error('Validating token...')

  const response = await fetch(`${config.apiUrl}/account`, {
    headers: headers(password),
  })

  if (!response.ok) {
    throw new Error(`Failed to validate token: ${response.statusText}`)
  }

  const account = (await response.json()) as Account

  return {
    login: account.email,
    password,
  }
}
