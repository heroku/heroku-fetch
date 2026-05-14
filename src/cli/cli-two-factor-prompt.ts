/**
 * CLI Two-Factor Authentication Prompt
 *
 * Provides a reusable 2FA challenge handler for Heroku CLIs.
 * This module requires @heroku/heroku-cli-util to be installed.
 *
 * @example
 * ```typescript
 * import { HerokuApiClient } from '@heroku/heroku-fetch';
 * import { cliTwoFactorPrompt } from '@heroku/heroku-fetch/cli-two-factor-prompt';
 *
 * const client = new HerokuApiClient({
 *   service: 'platform',
 *   twoFactor: {
 *     onChallenge: cliTwoFactorPrompt,
 *   },
 * });
 * ```
 */

import {prompt} from '@heroku/heroku-cli-util/hux'

/**
 * Two-factor authentication challenge handler for Heroku CLIs.
 *
 * This function prompts the user for their 2FA code using heroku-cli-util's hux.prompt
 * with masked input for security.
 *
 * @returns Promise that resolves with the 2FA code entered by the user
 *
 * @example
 * ```typescript
 * const client = new HerokuApiClient({
 *   service: 'platform',
 *   twoFactor: {
 *     onChallenge: cliTwoFactorPrompt,
 *   },
 * });
 * ```
 */
export async function cliTwoFactorPrompt(): Promise<string> {
  // Dynamic import to avoid requiring @heroku/heroku-cli-util for non-CLI users
  try {
    const code = await prompt('Enter your 2FA code', {
      type: 'password',
    })
    return code
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      throw new Error('cliTwoFactorPrompt requires @heroku/heroku-cli-util to be installed. '
        + 'Please run: npm install @heroku/heroku-cli-util')
    }

    throw error
  }
}

/**
 * Factory function to create a custom 2FA prompt with options.
 *
 * @param options - Customization options for the prompt
 * @param options.message - Custom prompt message (default: "Enter your 2FA code")
 * @returns A function that can be used as the onChallenge callback
 *
 * @example
 * ```typescript
 * import { createCliTwoFactorPrompt } from '@heroku/heroku-fetch/cli-two-factor-prompt';
 *
 * const client = new HerokuApiClient({
 *   service: 'platform',
 *   twoFactor: {
 *     onChallenge: createCliTwoFactorPrompt({
 *       message: 'Enter your Heroku 2FA code',
 *     }),
 *   },
 * });
 * ```
 */
export function createCliTwoFactorPrompt(options?: {
  message?: string;
}): () => Promise<string> {
  const message = options?.message || 'Enter your 2FA code'

  return async () => {
    try {
      const code = await prompt(message, {
        type: 'password',
      })
      return code
    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot find module')) {
        throw new Error('createCliTwoFactorPrompt requires @heroku/heroku-cli-util to be installed. '
          + 'Please run: npm install @heroku/heroku-cli-util')
      }

      throw error
    }
  }
}
