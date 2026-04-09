/**
 * Example oclif command: heroku logs
 *
 * This demonstrates how to use heroku-fetch to stream logs
 * from a Heroku app using the streaming API.
 */

import {Command, Flags, ux} from '@oclif/core'
import {handle} from '@oclif/core/errors'

import {HerokuApiClient, HerokuApiError} from '../../src/index.js'

interface LogSession {
  created_at: string;
  id: string;
  logplex_url: string;
  updated_at: string;
}

export default class Logs extends Command {
  static description = 'display recent log output'
  static examples = [
    '<%= config.bin %> <%= command.id %> --app my-app',
    '<%= config.bin %> <%= command.id %> --app my-app --tail',
    '<%= config.bin %> <%= command.id %> --app my-app --num 100',
  ]
  static flags = {
    app: Flags.string({
      char: 'a',
      description: 'app to run command against',
      required: true,
    }),
    dyno: Flags.string({
      char: 'd',
      description: 'only show output from this dyno type',
    }),
    num: Flags.integer({
      char: 'n',
      default: 100,
      description: 'number of lines to display',
    }),
    source: Flags.string({
      char: 's',
      description: 'only show output from this source',
    }),
    tail: Flags.boolean({
      char: 't',
      default: false,
      description: 'continually stream logs',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Logs)

    // Create API client (automatically uses getAuthToken() by default)
    const client = new HerokuApiClient({
      service: 'platform',
    })

    try {
      // Build request body for log session
      const body: Record<string, unknown> = {
        lines: flags.num,
        tail: flags.tail,
      }

      if (flags.dyno) {
        body.dyno = flags.dyno
      }

      if (flags.source) {
        body.source = flags.source
      }

      // Create a log session
      const sessionResponse = await client.post(
        `/apps/${flags.app}/log-sessions`,
        body,
      )
      const session = await sessionResponse.json() as LogSession

      // Stream logs from the logplex URL
      // Note: The logplex URL is a full URL, not a relative path
      const logsClient = new HerokuApiClient({
        baseUrl: new URL(session.logplex_url).origin,
        service: 'custom',
      })

      const logsResponse = await logsClient.stream(new URL(session.logplex_url).pathname + new URL(session.logplex_url).search)

      // Process the stream
      if (logsResponse.body) {
        const reader = logsResponse.body.getReader()
        const decoder = new TextDecoder()

        try {
          while (true) {
            // eslint-disable-next-line no-await-in-loop
            const {done, value} = await reader.read()

            if (done) {
              break
            }

            const chunk = decoder.decode(value, {stream: true})
            process.stdout.write(chunk)
          }
        } catch (error) {
          // Stream interrupted (e.g., user pressed Ctrl+C)
          reader.releaseLock()
          throw error
        }
      }
    } catch (error) {
      if (error instanceof HerokuApiError) {
        if (error.statusCode === 404) {
          this.error(`App not found: ${flags.app}`)
        } else {
          this.error(`API Error: ${error.message} (${error.statusCode})`)
        }
      } else if ((error as NodeJS.ErrnoException).code === 'ERR_STREAM_PREMATURE_CLOSE') {
        // Stream closed, exit gracefully
        ux.exit()
      } else {
        throw error
      }
    }
  }
}

// Execute the command
try {
  await Logs.run(process.argv.slice(2))
} catch (error: unknown) {
  handle(error as Error)
}
