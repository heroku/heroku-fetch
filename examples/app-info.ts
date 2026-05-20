/**
 * Fetch info for a single app and print the response (or, on failure,
 * the error's id / resource / statusCode).
 *
 * Run with:
 *   npx tsx examples/app-info.ts <app-name>
 */

import {HerokuApiClient, HerokuApiError} from '../src/index.js'

const appName = process.argv[2]
if (!appName) {
  console.error('Usage: npx tsx examples/app-info.ts <app-name>')
  process.exit(1)
}

const client = new HerokuApiClient({service: 'platform'})

try {
  const response = await client.get(`/apps/${appName}`)
  const app = await response.json()
  console.log(app)
} catch (error) {
  if (error instanceof HerokuApiError) {
    console.log({
      id: error.id,
      message: error.message,
      resource: error.resource,
      statusCode: error.statusCode,
    })
  } else {
    throw error
  }
}
