/**
 * OAuth token operations
 */

import os from 'node:os'

import type {HerokuApiClient} from '../../client/index.js'
import type {NetrcEntry, OAuthAuthorization} from './types.js'

import {debugCliLogin} from '../../debug-loggers.js'
import {THIRTY_DAYS} from './types.js'

const hostname = os.hostname()

/**
 * Create a basic auth header value
 */
function basicAuth(username: string, password: string): string {
  const auth = Buffer.from([username, password].join(':')).toString('base64')
  return `Basic ${auth}`
}

/**
 * Create an OAuth token via the Heroku API
 */
export async function createOAuthToken(
  apiUrl: string,
  username: string,
  password: string,
  opts: {expiresIn?: number; secondFactor?: string} = {},
): Promise<NetrcEntry> {
  debugCliLogin('Creating OAuth authorization for user: %s', username)
  debugCliLogin('Expires in: %d seconds%s', opts.expiresIn || THIRTY_DAYS, opts.secondFactor ? ', with 2FA' : '')

  const requestHeaders: Record<string, string> = {
    Accept: 'application/vnd.heroku+json; version=3',
    Authorization: basicAuth(username, password),
    'Content-Type': 'application/json',
  }

  if (opts.secondFactor) {
    requestHeaders['Heroku-Two-Factor-Code'] = opts.secondFactor
  }

  const response = await fetch(`${apiUrl}/oauth/authorizations`, {
    body: JSON.stringify({
      description: `Heroku CLI login from ${hostname}`,
      expires_in: opts.expiresIn || THIRTY_DAYS,
      scope: ['global'],
    }),
    headers: requestHeaders,
    method: 'POST',
  })

  if (!response.ok) {
    const errorBody = await response.json()
    debugCliLogin('OAuth authorization creation failed: %d %s (error id: %s)', response.status, response.statusText, errorBody.id)
    const error: any = new Error(errorBody.message || response.statusText)
    error.statusCode = response.status
    error.body = errorBody
    throw error
  }

  const auth = (await response.json()) as OAuthAuthorization
  debugCliLogin('OAuth authorization created successfully (id: %s)', auth.id)
  return {
    login: auth.user!.email!,
    password: auth.access_token!.token!,
  }
}

/**
 * Get the default OAuth token for the current user
 */
export async function getDefaultToken(client: HerokuApiClient): Promise<string | undefined> {
  try {
    debugCliLogin('Fetching default OAuth authorization')
    const response = await client.get('/oauth/authorizations/~')
    const authorization = (await response.json()) as OAuthAuthorization
    debugCliLogin('Default authorization found: %s', authorization.id)
    return authorization.access_token?.token
  } catch (error: unknown) {
    if (error instanceof Error) {
      const errBody = (error as any).body
      if (
        errBody?.id === 'not_found'
        && errBody?.resource === 'authorization'
      ) {
        debugCliLogin('Default authorization not found')
        return
      }

      if (errBody?.id === 'unauthorized') {
        debugCliLogin('Unauthorized to fetch default authorization')
        return
      }
    }

    debugCliLogin('Error fetching default authorization: %O', error)
    throw error
  }
}

/**
 * Delete OAuth session and authorizations for the given token
 */
export async function deleteOAuthTokens(
  client: HerokuApiClient,
  token: string,
): Promise<void> {
  debugCliLogin('Deleting OAuth tokens and sessions')

  // Delete the OAuth session (for SSO logins)
  const sessionDeletion = client
    .delete('/oauth/sessions/~')
    .then(() => {
      debugCliLogin('OAuth session deleted successfully')
    })
    .catch(error => {
      if (error instanceof Error) {
        const errBody = (error as any).body
        if (
          errBody?.id === 'not_found'
            && errBody?.resource === 'session'
        ) {
          debugCliLogin('OAuth session not found (expected for non-SSO logins)')
          return
        }

        if (errBody?.id === 'unauthorized') {
          debugCliLogin('Unauthorized to delete OAuth session')
          return
        }
      }

      debugCliLogin('Error deleting OAuth session: %O', error)
      throw error
    })

  // Delete OAuth authorizations matching this token
  const authorizationsDeletion = client
    .get('/oauth/authorizations')
    .then(async response => {
      const authorizations = (await response.json()) as OAuthAuthorization[]
      debugCliLogin('Found %d OAuth authorizations', authorizations.length)

      // Don't delete the default token
      const defaultToken = await getDefaultToken(client)
      if (defaultToken === token) {
        debugCliLogin('Token matches default authorization, skipping deletion')
        return
      }

      const matchingAuths = authorizations.filter(a => a.access_token && a.access_token.token === token)
      debugCliLogin('Found %d authorizations matching token', matchingAuths.length)

      if (matchingAuths.length > 0) {
        return Promise.all(matchingAuths.map(a => {
          debugCliLogin('Deleting OAuth authorization: %s', a.id)
          return client.delete(`/oauth/authorizations/${a.id}`)
        }))
      }
    })
    .catch(error => {
      if (error instanceof Error) {
        const errBody = (error as any).body
        if (errBody?.id === 'unauthorized') {
          debugCliLogin('Unauthorized to list/delete OAuth authorizations')
          return []
        }
      }

      debugCliLogin('Error deleting OAuth authorizations: %O', error)
      throw error
    })

  await Promise.all([sessionDeletion, authorizationsDeletion])
  debugCliLogin('OAuth token deletion completed')
}
