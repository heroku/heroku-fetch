/**
 * CLI Two-Factor Authentication Prompt
 *
 * Provides a reusable 2FA challenge handler for Heroku CLIs. Prompting requires
 * the optional `@heroku/heroku-cli-util` dependency. It is imported only when a
 * prompt runs, so importing this module (and the package's Node entry point)
 * doesn't load it, and its absence surfaces only when a 2FA prompt is needed.
 *
 * @example
 * ```typescript
 * import { HerokuApiClient, cliTwoFactorPrompt } from '@heroku/heroku-fetch';
 *
 * const client = new HerokuApiClient({
 *   service: 'platform',
 *   twoFactor: {
 *     onChallenge: cliTwoFactorPrompt,
 *   },
 * });
 * ```
 */

const DEFAULT_MESSAGE = 'Enter your 2FA code'

/**
 * Prompt for a 2FA code with masked input via heroku-cli-util's `hux.prompt`.
 * Only the import is guarded: a missing `@heroku/heroku-cli-util` becomes an
 * actionable install error naming `caller`, while errors from the prompt
 * itself propagate unchanged.
 */
async function promptForCode(message: string, caller: string): Promise<string> {
  let prompt: typeof import('@heroku/heroku-cli-util/hux').prompt
  try {
    ({prompt} = await import('@heroku/heroku-cli-util/hux'))
  } catch (error) {
    const {code} = error as {code?: unknown}
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
      throw new Error(`${caller} requires @heroku/heroku-cli-util to be installed. `
        + 'Please run: npm install @heroku/heroku-cli-util')
    }

    throw error
  }

  return prompt(message, {type: 'password'})
}

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
  return promptForCode(DEFAULT_MESSAGE, 'cliTwoFactorPrompt')
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
 * import { createCliTwoFactorPrompt } from '@heroku/heroku-fetch';
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
  const message = options?.message || DEFAULT_MESSAGE
  return async () => promptForCode(message, 'createCliTwoFactorPrompt')
}
