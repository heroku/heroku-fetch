/**
 * Example oclif command: heroku login
 *
 * This demonstrates how to use the Login class to authenticate
 * with Heroku and save credentials to the netrc file.
 */

import {Command, Flags, ux} from '@oclif/core'
import {handle} from '@oclif/core/errors'

import {Login} from '../../src/cli/cli-login.js'
import {HerokuApiClient} from '../../src/index.js'

export default class LoginCommand extends Command {
  static description = 'log in with your Heroku credentials'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --browser',
    '<%= config.bin %> <%= command.id %> --interactive',
  ]
  static flags = {
    browser: Flags.boolean({
      char: 'b',
      default: false,
      description: 'open browser to login',
      exclusive: ['interactive', 'sso'],
    }),
    'expires-in': Flags.integer({
      char: 'e',
      description: 'duration of token in seconds (default 30 days, max 30 days)',
    }),
    interactive: Flags.boolean({
      char: 'i',
      default: false,
      description: 'login with username/password',
      exclusive: ['browser', 'sso'],
    }),
    sso: Flags.boolean({
      char: 's',
      default: false,
      description: 'login using Single Sign-On',
      exclusive: ['browser', 'interactive'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(LoginCommand)

    // Create API client
    const client = new HerokuApiClient({
      service: 'platform',
    })

    // Create login instance
    const login = new Login(client)

    try {
      // Determine login method
      let method: 'browser' | 'interactive' | 'sso' | undefined

      if (flags.browser) {
        method = 'browser'
      } else if (flags.interactive) {
        method = 'interactive'
      } else if (flags.sso) {
        method = 'sso'
      }

      // Perform login
      ux.stdout('Logging in to Heroku...')

      await login.login({
        expiresIn: flags['expires-in'],
        method,
      })

      ux.stdout('✓ Logged in successfully!')
      ux.stdout('')
      ux.stdout('Your credentials have been saved to ~/.netrc')
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Cannot log in with HEROKU_API_KEY set')) {
          this.error('Cannot log in when HEROKU_API_KEY is set.\n'
            + 'Please unset HEROKU_API_KEY and try again.')
        } else if (error.message.includes('Cannot set an expiration longer than thirty days')) {
          this.error('Expiration cannot be longer than 30 days (2592000 seconds)')
        } else if (error.message.includes('Login cancelled')) {
          ux.stdout('Login cancelled.')
          ux.exit(0)
        } else if (error.message.includes('Login timed out')) {
          this.error('Login timed out after 10 minutes.')
        } else {
          this.error(`Login failed: ${error.message}`)
        }
      } else {
        throw error
      }
    }
  }
}

// Execute the command
try {
  await LoginCommand.run(process.argv.slice(2))
} catch (error: unknown) {
  handle(error as Error)
}
