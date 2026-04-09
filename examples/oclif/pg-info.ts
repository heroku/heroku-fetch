/**
 * Example oclif command: heroku pg:info
 *
 * Run: npx tsx examples/oclif/pg-info.ts --app YOUR_APP_NAME
 *
 * This demonstrates how to use heroku-fetch to call a data-api endpoint
 * (postgres-api.heroku.com) in an oclif command.
 *
 * Based on the pattern from heroku/cli pg:info command.
 */

import {
  Args, Command, Flags, ux,
} from '@oclif/core'
import {handle} from '@oclif/core/errors'

import {
  HerokuApiClient,
  HerokuApiError,
  NotFoundError,
} from '../../src/index.js'

interface HerokuAddon {
  addon_service: {name: string};
  app: {name: string};
  id: string;
  name: string;
  plan: {name: string};
}

interface ConfigVars {
  [key: string]: string;
}

interface PgDatabaseTenant {
  info: Array<{
    name: string;
    resolve_db_name?: boolean;
    values: string[];
  }>;
  resource_url: string;
}

interface DBObject {
  addon: HerokuAddon;
  config: ConfigVars;
  configVars: string[];
  dbInfo: null | PgDatabaseTenant;
}

function configVarNamesFromValue(config: ConfigVars, value: string): string[] {
  return Object.keys(config).filter(key => config[key] === value)
}

function displayDB(db: DBObject, app: string): void {
  // Display config var names as header
  if (db.configVars.length > 0) {
    console.log(`\n=== ${db.configVars.join(', ')}`)
  }

  // Show billing app if different from current app
  if (db.addon.app.name && db.addon.app.name !== app) {
    console.log(`Billing App: ${db.addon.app.name}`)
  }

  // Show add-on name
  console.log(`Add-on:      ${db.addon.name}`)

  // Display all database info
  if (db.dbInfo) {
    for (const infoObject of db.dbInfo.info) {
      if (infoObject.values.length > 0) {
        const values = infoObject.values.join(', ')
        const paddedName = infoObject.name.padEnd(12)
        console.log(`${paddedName} ${values}`)
      }
    }
  }
}

export default class PgInfo extends Command {
  static aliases = ['pg']
  static args = {
    database: Args.string({
      description: 'database to show info for (if not specified, shows all databases)',
      required: false,
    }),
  }
  static description = 'show database information'
  static examples = [
    '<%= config.bin %> <%= command.id %> --app myapp',
    '<%= config.bin %> <%= command.id %> --app myapp --json',
    '<%= config.bin %> <%= command.id %> DATABASE --app myapp',
  ]
  static flags = {
    app: Flags.string({
      char: 'a',
      description: 'app to run command against',
      required: true,
    }),
    json: Flags.boolean({
      default: false,
      description: 'output in json format',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PgInfo)
    const {app, json} = flags
    const {database} = args

    // Create platform API client for getting app config and addons
    // 2FA prompts are automatically handled by default
    const platformClient = new HerokuApiClient({
      service: 'platform',
    })

    // Create data API client for postgres-specific endpoints
    // 2FA prompts are automatically handled by default
    const dataClient = new HerokuApiClient({
      service: 'data',
    })

    try {
      // Get app config vars to map database URLs to config var names
      const configResponse = await platformClient.get(`/apps/${app}/config-vars`)
      const config = await configResponse.json() as ConfigVars

      // Get the app's addons to find postgres databases
      const addonsResponse = await platformClient.get(`/apps/${app}/addons`)
      const allAddons = await addonsResponse.json() as HerokuAddon[]

      // Filter for heroku-postgresql addons
      let pgAddons = allAddons.filter(addon => addon.addon_service.name === 'heroku-postgresql')

      if (pgAddons.length === 0) {
        ux.stdout(`${app} has no heroku-postgresql databases.`)
        return
      }

      // If a specific database is requested, find it
      if (database) {
        const dbAddon = pgAddons.find(addon => addon.name === database
                   || addon.name.includes(database)
                   || addon.name.toUpperCase().includes(database.toUpperCase()))
        if (!dbAddon) {
          this.error(`Database ${database} not found on ${app}`)
        }

        pgAddons = [dbAddon]
      }

      // Fetch database info from data API for each addon
      let dbs: DBObject[] = await Promise.all(pgAddons.map(async addon => {
        try {
          // Call the data API endpoint (postgres-api.heroku.com)
          // This matches the original command's call to /client/v11/databases/{id}
          const dbResponse = await dataClient.get(`/client/v11/databases/${addon.id}`)
          const dbInfo = await dbResponse.json() as PgDatabaseTenant

          return {
            addon,
            config,
            configVars: [],
            dbInfo,
          }
        } catch (error) {
          if (error instanceof NotFoundError) {
            this.warn(`${addon.name} is not yet provisioned.\n`
                + `Run 'heroku addons:wait ${addon.name}' to wait until the db is provisioned.`)
            return {
              addon,
              config,
              configVars: [],
              dbInfo: null,
            }
          }

          throw error
        }
      }))

      // Filter out databases that aren't provisioned
      dbs = dbs.filter(db => db.dbInfo)

      if (dbs.length === 0) {
        ux.stdout('No provisioned databases found.')
        return
      }

      // Find config var names for each database
      for (const db of dbs) {
        if (db.dbInfo?.resource_url) {
          db.configVars = configVarNamesFromValue(config, db.dbInfo.resource_url)
        }
      }

      // Sort databases: DATABASE_URL first, then alphabetically
      dbs.sort((a, b) => {
        const aHasMainUrl = a.configVars.includes('DATABASE_URL')
        const bHasMainUrl = b.configVars.includes('DATABASE_URL')

        if (aHasMainUrl && !bHasMainUrl) return -1
        if (!aHasMainUrl && bHasMainUrl) return 1

        const aName = a.configVars[0] || ''
        const bName = b.configVars[0] || ''
        return aName.localeCompare(bName)
      })

      if (json) {
        // Output as JSON
        ux.stdout(JSON.stringify(dbs, null, 2))
      } else {
        // Output formatted information for each database
        for (const db of dbs) displayDB(db, app)
        ux.stdout('')
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
  await PgInfo.run(process.argv.slice(2))
} catch (error: unknown) {
  handle(error as Error)
}
