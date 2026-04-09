/**
 * Basic usage examples for heroku-fetch
 *
 * To run this example:
 * npx tsx examples/basic-usage.ts
 */

import {HerokuApiClient, NotFoundError} from '../src/index.js'

// Create client (automatically uses getAuthToken() by default)
const client = new HerokuApiClient({
  service: 'platform',
})

try {
  // List apps
  console.log('Fetching apps...')
  const appsResponse = await client.get('/apps')
  const apps = await appsResponse.json()
  console.log(`Found ${apps.length} apps`)

  if (apps.length > 0) {
    // Get details for first app
    const appName = apps[0].name
    console.log(`\nFetching details for app: ${appName}`)
    const appResponse = await client.get(`/apps/${appName}`)
    const app = await appResponse.json()
    console.log('App details:', {
      created: app.created_at,
      name: app.name,
      region: app.region.name,
      stack: app.stack.name,
    })

    // List dynos
    console.log(`\nFetching dynos for app: ${appName}`)
    const dynosResponse = await client.get(`/apps/${appName}/dynos`)
    const dynos = await dynosResponse.json()
    console.log(`Found ${dynos.length} dynos`)
  }
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error('Resource not found')
  } else {
    console.error('Error:', error)
  }

  throw error
}
