/**
 * Interactive username/password login flow
 */

import {prompt} from '@heroku/heroku-cli-util/hux'

import type {LoginConfig, NetrcEntry} from './types.js'

import {debugCliLogin} from '../../debug-loggers.js'
import {createOAuthToken} from './oauth.js'

/**
 * Perform interactive username/password login
 */
export async function interactiveLogin(
  config: LoginConfig,
  previousLogin?: string,
  expiresIn?: number,
): Promise<NetrcEntry> {
  debugCliLogin('Starting interactive login flow')
  console.error('heroku: Enter your login credentials\n')

  const email = await prompt('Email', {
    default: previousLogin,
    type: 'input',
  })
  const login = email
  debugCliLogin('Email provided: %s', login)

  const password = await prompt('Password', {
    type: 'password',
  })

  let auth: NetrcEntry
  try {
    debugCliLogin('Creating OAuth token at %s', config.apiUrl)
    auth = await createOAuthToken(config.apiUrl, login, password, {expiresIn})
    debugCliLogin('OAuth token created successfully')
  } catch (error: unknown) {
    if (error instanceof Error) {
      const errBody = (error as any).body

      if (errBody?.id === 'device_trust_required') {
        debugCliLogin('Device trust required error - 2FA must be enabled')
        throw new Error('The interactive flag requires Two-Factor Authentication to be enabled on your account. Please use browser login.')
      }

      if (errBody?.id === 'two_factor') {
        debugCliLogin('2FA challenge required, prompting for code')
        const secondFactor = await prompt('Two-factor code', {
          type: 'password',
        })
        debugCliLogin('Retrying OAuth token creation with 2FA code')
        auth = await createOAuthToken(config.apiUrl, login, password, {
          expiresIn,
          secondFactor,
        })
        debugCliLogin('OAuth token created successfully with 2FA')
      } else {
        debugCliLogin('OAuth token creation failed: %O', error)
        throw error
      }
    } else {
      debugCliLogin('Unexpected error during OAuth token creation: %O', error)
      throw error
    }
  }

  debugCliLogin('Interactive login successful for user: %s', auth!.login)
  return auth!
}
