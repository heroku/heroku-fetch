# Oclif Command Examples

This directory contains complete examples of using `heroku-fetch` in oclif-based CLI commands, following the authentication patterns used in the Heroku CLI.

## Overview

These examples demonstrate:
- ✅ Automatic token management from `HEROKU_API_KEY` or `~/.netrc`
- ✅ GET, POST, DELETE requests
- ✅ Streaming responses (logs)
- ✅ Multiple services (platform API, data API)
- ✅ Error handling with specific error types
- ✅ Automatic 2FA prompts for sensitive operations (no configuration needed!)
- ✅ JSON and formatted output modes
- ✅ Oclif table formatting and progress indicators

## Authentication

All examples use automatic authentication. **No manual token management needed!**

```typescript
import { HerokuApiClient } from '@heroku/api-client';

// Client automatically gets token from:
// 1. HEROKU_API_KEY environment variable (priority)
// 2. ~/.netrc file (fallback)
const client = new HerokuApiClient({
  service: 'platform',
});
```

The client handles everything automatically - no need to call `getAuthToken()` yourself!

## Examples

### Base Command Pattern

`base-command.ts` provides reusable base classes that handle authentication, client setup, and error handling:

```typescript
import { AppCommand } from './base-command.js';

// Extend AppCommand to automatically get:
// - Authentication
// - API client setup
// - Error handling
// - --app flag
export default class MyCommand extends AppCommand {
  async run() {
    // this.client is already set up
    // this.app contains the app name from --app flag
    const response = await this.client.get(`/apps/${this.app}`);
    // Errors are automatically handled by base class
  }
}
```

### 1. `apps-list.ts` - List Apps

Simple GET request with table formatting.

**Features:**
- GET request to `/apps`
- Table output using `ux.table()`
- JSON flag support
- Basic error handling

**Usage:**
```bash
heroku apps:list
heroku apps:list --json
```

### 2. `apps-info.ts` - Get App Info

GET request with detailed information display.

**Features:**
- GET request to `/apps/{app}`
- Formatted key-value output
- Conditional field display
- 404 error handling

**Usage:**
```bash
heroku apps:info --app my-app
heroku apps:info --app my-app --json
```

### 3. `apps-create.ts` - Create App

POST request with body and validation errors.

**Features:**
- POST request with JSON body
- Progress indicators with `ux.action`
- Validation error handling (422)
- Optional arguments and flags

**Usage:**
```bash
heroku apps:create
heroku apps:create my-app-name
heroku apps:create --region eu
heroku apps:create my-app --stack heroku-22
```

### 4. `logs.ts` - Stream Logs

Streaming response handling.

**Features:**
- POST to create log session
- Stream consumption with ReadableStream
- Custom baseURL for logplex
- Real-time output to stdout
- Graceful stream interruption handling

**Usage:**
```bash
heroku logs --app my-app
heroku logs --app my-app --tail
heroku logs --app my-app --num 200
heroku logs --app my-app --dyno web.1
```

### 5. `base-command.ts` - Base Command Classes

Reusable base classes for commands.

**Features:**
- Automatic authentication setup
- API client initialization
- Consistent error handling
- Shared flags (--json, --app)
- Reduces boilerplate significantly

**Classes:**
- `BaseCommand` - Base for all commands
- `AppCommand` - Base for app-specific commands (includes --app flag)

### 6. `dynos-list.ts` - List Dynos (Using Base Command)

Example using AppCommand base class - shows how simple commands become!

**Features:**
- Extends AppCommand
- Minimal boilerplate
- Automatic error handling
- Clean and focused implementation

**Usage:**
```bash
heroku dynos --app my-app
heroku dynos --app my-app --json
```

### 7. `pg-info.ts` - PostgreSQL Database Info (Data API)

Example calling the Data API (postgres-api.heroku.com) endpoint.

**Features:**
- Multiple service clients (platform + data)
- Calls `/client/v11/databases/{id}` on data API
- Maps config vars to database URLs
- Handles unprovisioned databases
- Sorts databases (DATABASE_URL first)
- Shows database information with formatted output

**Usage:**
```bash
heroku pg:info --app my-app
heroku pg:info --app my-app --json
heroku pg:info DATABASE --app my-app
```

## Integration into an Oclif Plugin

### 1. Install Dependencies

```bash
npm install @heroku/api-client @oclif/core
```

### 2. Copy Example Commands

Copy any of the example files to your plugin's `src/commands` directory:

```bash
# Example structure
src/
  commands/
    apps/
      list.ts     # Copy from apps-list.ts
      info.ts     # Copy from apps-info.ts
      create.ts   # Copy from apps-create.ts
    logs.ts       # Copy from logs.ts
```

### 3. Update Imports

The examples use the pattern:
```typescript
import { HerokuApiClient, getAuthToken } from '@heroku/api-client';
```

This works out of the box - no additional setup needed!

### 4. Test Your Commands

```bash
npm run build
./bin/dev.js apps:list
./bin/dev.js apps:info --app my-app
```

## Common Patterns

### Basic Request Pattern

```typescript
import { Command } from '@oclif/core';
import { HerokuApiClient, HerokuApiError } from '@heroku/api-client';

export default class MyCommand extends Command {
  async run() {
    // Client automatically uses token from env or netrc
    const client = new HerokuApiClient({
      service: 'platform',
    });

    try {
      const response = await client.get('/endpoint');
      const data = await response.json();
      this.log(JSON.stringify(data, null, 2));
    } catch (error) {
      if (error instanceof HerokuApiError) {
        this.error(`API Error: ${error.message} (${error.statusCode})`);
      }
      throw error;
    }
  }
}
```

### Working with Different Services

```typescript
// Platform API (default) - token auto-loaded
const platformClient = new HerokuApiClient({
  service: 'platform',
});

// Data API (Postgres) - token auto-loaded
const dataClient = new HerokuApiClient({
  service: 'data',
});

// Data API with EU region - token auto-loaded
const euDataClient = new HerokuApiClient({
  service: 'data',
  region: 'eu',
});

// Custom API with static token
const customClient = new HerokuApiClient({
  service: 'custom',
  baseUrl: 'https://api.custom.com',
  token: 'custom-token', // Optional: override auto-loading
});
```

### Error Handling Pattern

```typescript
try {
  const response = await client.get('/apps/my-app');
  const app = await response.json();
} catch (error) {
  if (error instanceof NotFoundError) {
    this.error('App not found');
  } else if (error instanceof AuthenticationError) {
    this.error('Authentication failed. Please run: heroku login');
  } else if (error instanceof RateLimitError) {
    this.error(`Rate limited. Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof HerokuApiError) {
    // Handle validation errors (422)
    if (error.statusCode === 422 && error.errors) {
      for (const err of error.errors) {
        this.error(`${err.message}`);
      }
    } else {
      this.error(`API Error: ${error.message} (${error.statusCode})`);
    }
  } else {
    throw error;
  }
}
```

### 2FA Support Pattern

**Two-factor authentication is automatically handled by default!** When using `@oclif/core`, the client will automatically prompt for 2FA codes when needed.

```typescript
// 2FA is handled automatically - no configuration needed!
const client = new HerokuApiClient({
  service: 'platform',
});

// If 2FA is required, user will be prompted automatically
await client.delete('/apps/my-app');
```

To customize the 2FA prompt or use a different prompting mechanism:

```typescript
import { createCliTwoFactorPrompt } from '@heroku/api-client';

const client = new HerokuApiClient({
  service: 'platform',
  twoFactor: {
    onChallenge: createCliTwoFactorPrompt({
      message: 'Enter your Heroku 2FA code',
    }),
  },
});
```

Or provide a completely custom handler:

```typescript
const client = new HerokuApiClient({
  service: 'platform',
  twoFactor: {
    onChallenge: async () => {
      // Your custom 2FA logic here
      return await getCodeFromSomewhere();
    },
  },
});
```

## Tips

1. **Always check for token**: Use `if (!token) this.error(...)` to provide clear error messages
2. **Use ux utilities**: Leverage `ux.action`, `ux.table`, and `ux.prompt` for better UX
3. **Handle specific errors**: Import specific error types for better error handling
4. **Support --json flag**: Add a `--json` flag for programmatic usage
5. **Use type safety**: Define TypeScript interfaces for API responses

## Debugging

Enable debug output for heroku-fetch:

```bash
DEBUG=heroku-fetch:* heroku apps:list
DEBUG=heroku-fetch:request,heroku-fetch:response heroku apps:list
```

## Further Reading

- [Oclif Documentation](https://oclif.io)
- [heroku-fetch README](../../README.md)
- [Heroku Platform API Reference](https://devcenter.heroku.com/articles/platform-api-reference)
