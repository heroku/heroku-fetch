/**
 * Default providers for Node.js environments
 * These use file system (netrc) and CLI utilities
 */

import type {TokenProvider, TwoFactorOptions} from '../types.js'

/**
 * Get default token provider for Node.js (uses netrc/env vars)
 */
export function getDefaultTokenProvider(): TokenProvider {
  return async () => {
    const {getAuthToken} = await import('../auth/auth.js')
    const token = getAuthToken()
    if (!token) {
      throw new Error('No authentication token found. Please set HEROKU_API_KEY or run: heroku login')
    }

    return token
  }
}

/**
 * Get default 2FA handler for Node.js (uses CLI prompts)
 */
export function getDefaultTwoFactorOptions(): TwoFactorOptions {
  return {
    async onChallenge() {
      const {cliTwoFactorPrompt} = await import('../cli/cli-two-factor-prompt.js')
      return cliTwoFactorPrompt()
    },
  }
}
