/**
 * Example oclif command: heroku logout
 *
 * This demonstrates how to use the Login class to logout
 * and clear credentials from the netrc file.
 */

import {Command, ux} from '@oclif/core'
import {handle} from '@oclif/core/errors'

import {Login} from '../../src/cli/cli-login.js'
import {HerokuApiClient} from '../../src/index.js'

export default class LogoutCommand extends Command {
  static description = 'clear local authentication credentials'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  async run(): Promise<void> {
    // Create API client
    const client = new HerokuApiClient({
      service: 'platform',
    })

    // Create login instance
    const login = new Login(client)

    try {
      ux.stdout('Logging out from Heroku...')

      await login.logout()

      ux.stdout('✓ Logged out successfully!')
      ux.stdout('')
      ux.stdout('Your credentials have been removed from ~/.netrc')
    } catch (error) {
      if (error instanceof Error) {
        // If it's just a "not found" error from the API, that's okay
        // (it means the OAuth token was already deleted or doesn't exist)
        // Still show success because we cleared the netrc
        if (error.message.includes('not found') || error.message.includes('Not found')) {
          ux.stdout('✓ Logged out successfully!')
          ux.stdout('')
          ux.stdout('Your credentials have been removed from ~/.netrc')
        } else {
          this.error(`Logout failed: ${error.message}`)
        }
      } else {
        throw error
      }
    }
  }
}

// Execute the command
try {
  await LogoutCommand.run(process.argv.slice(2))
} catch (error: unknown) {
  handle(error as Error)
}
