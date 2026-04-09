/**
 * Example: CLI Login
 *
 * Run: npx tsx examples/cli-login-example.ts [login|logout]
 *
 * This demonstrates how to use the Login class for authentication.
 */

import {HerokuApiClient, Login} from '../src/index.js'

interface HerokuAccount {
  email: string;
}

const command = process.argv[2] || 'login'

// Create API client
const client = new HerokuApiClient({
  service: 'platform',
})

// Create login instance
const login = new Login(client)

try {
  if (command === 'login') {
    console.log('Starting login process...\n')

    // You can specify a method:
    // await login.login({ method: 'browser' });     // Default: browser-based
    // await login.login({ method: 'interactive' }); // Username/password
    // await login.login({ method: 'sso' });         // SSO

    await login.login({method: 'browser'})

    console.log('\nLogin successful!')

    // Test the authentication by fetching account info
    const response = await client.get('/account')
    const account = await response.json() as HerokuAccount
    console.log(`\nAuthenticated as: ${account.email}`)
  } else if (command === 'logout') {
    console.log('Logging out...\n')
    await login.logout()
  } else {
    console.error('Usage: npx tsx examples/cli-login-example.ts [login|logout]')
    throw new Error('Invalid command')
  }
} catch (error) {
  console.error('Error:', error instanceof Error ? error.message : error)
  throw error
}
