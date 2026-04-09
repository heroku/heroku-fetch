/**
 * Example oclif command: heroku apps:info
 *
 * Run: ./examples/oclif/run.sh apps-info --app my-app
 *
 * This demonstrates how to use heroku-fetch to get detailed
 * information about an app and display it in a formatted way.
 */

import {Command, Flags, ux} from '@oclif/core'
import {handle} from '@oclif/core/errors'

import {HerokuApiClient, HerokuApiError} from '../../src/index.js'

interface HerokuApp {
  build_stack: {
    id: string;
    name: string;
  };
  created_at: string;
  git_url: string;
  id: string;
  maintenance: boolean;
  name: string;
  organization?: {
    name: string;
  };
  owner: {
    email: string;
    id: string;
  };
  region: {name: string};
  repo_size?: number;
  slug_size?: number;
  space?: {
    name: string;
  };
  stack: {name: string};
  updated_at: string;
  web_url: string;
}

export default class AppsInfo extends Command {
  static description = 'show detailed app information'
  static examples = [
    '<%= config.bin %> <%= command.id %> --app my-app',
    '<%= config.bin %> <%= command.id %> --app my-app --json',
  ]
  static flags = {
    app: Flags.string({
      char: 'a',
      description: 'app to get info for',
      required: true,
    }),
    json: Flags.boolean({
      default: false,
      description: 'output in json format',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AppsInfo)

    // Create API client (automatically uses getAuthToken() by default)
    const client = new HerokuApiClient({
      service: 'platform',
    })

    try {
      // Make API request
      const response = await client.get(`/apps/${flags.app}`)
      const app = await response.json() as HerokuApp

      if (flags.json) {
        // Output as JSON
        ux.stdout(JSON.stringify(app, null, 2))
      } else {
        // Output formatted information
        ux.stdout(`=== ${app.name}`)

        const info: Record<string, string> = {
          'Git URL': app.git_url,
          Maintenance: app.maintenance ? 'on' : 'off',
          Owner: app.owner.email,
          Region: app.region.name,
          Stack: app.stack.name,
          'Web URL': app.web_url,
        }

        if (app.organization) {
          info.Organization = app.organization.name
        }

        if (app.space) {
          info.Space = app.space.name
        }

        if (app.repo_size) {
          info['Repo Size'] = `${Math.round(app.repo_size / 1024 / 1024)} MB`
        }

        if (app.slug_size) {
          info['Slug Size'] = `${Math.round(app.slug_size / 1024 / 1024)} MB`
        }

        // Display as key-value pairs
        const maxKeyLength = Math.max(...Object.keys(info).map(k => k.length))
        for (const [key, value] of Object.entries(info)) {
          ux.stdout(`${key.padEnd(maxKeyLength)}: ${value}`)
        }
      }
    } catch (error) {
      if (error instanceof HerokuApiError) {
        if (error.statusCode === 404) {
          this.error(`App not found: ${flags.app}`)
        } else {
          this.error(`API Error: ${error.message} (${error.statusCode})`)
        }
      } else {
        throw error
      }
    }
  }
}

// Execute the command
try {
  await AppsInfo.run(process.argv.slice(2))
} catch (error: unknown) {
  handle(error as Error)
}
