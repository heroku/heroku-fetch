/**
 * Example oclif command: heroku apps:list
 *
 * Run: npx tsx examples/oclif/apps-list.ts
 *
 * This demonstrates how to use heroku-fetch in an oclif command
 * with automatic netrc token management.
 */

import {Command, Flags, ux} from '@oclif/core'
import {handle} from '@oclif/core/errors'

import {HerokuApiClient, HerokuApiError} from '../../src/index.js'

interface HerokuApp {
  created_at: string;
  name: string;
  region: {name: string};
  stack: {name: string};
  web_url: string;
}

export default class AppsList extends Command {
  static description = 'list your apps'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ]
  static flags = {
    json: Flags.boolean({
      default: false,
      description: 'output in json format',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AppsList)

    // Create API client (automatically uses getAuthToken() by default)
    const client = new HerokuApiClient({
      service: 'platform',
    })

    try {
      // Make API request
      const response = await client.get('/apps')
      const apps = await response.json() as HerokuApp[]

      if (flags.json) {
        // Output as JSON
        ux.stdout(JSON.stringify(apps, null, 2))
      } else if (apps.length === 0) {
        // Output as formatted table
        ux.stdout('You have no apps.')
      } else {
        ux.stdout(`=== Apps (${apps.length})`)
        ux.stdout('')

        // Simple table formatting
        for (const app of apps) {
          ux.stdout(`${app.name} (${app.region.name})`)
        }
      }
    } catch (error) {
      if (error instanceof HerokuApiError) {
        this.error(`API Error: ${error.message} (${error.statusCode})`)
      } else {
        throw error
      }
    }
  }
}

// Execute the command
try {
  await AppsList.run(process.argv.slice(2))
} catch (error: unknown) {
  handle(error as Error)
}
