# heroku-fetch

A modern JavaScript/TypeScript API client for Heroku APIs, built on the Fetch API and designed to work seamlessly in both Node.js and browser environments.

## Features

- ✨ **Universal**: Works in Node.js and browsers
- 🔐 **Authentication**: Support for bearer tokens and dynamic token providers
- 🛡️ **2FA Support**: Automatic handling of two-factor authentication challenges
- 🎯 **Multi-API Support**: Pre-configured for Platform API, Data API, and Particleboard
- 📊 **Streaming**: Native support for streaming responses and Server-Sent Events
- 🐛 **Debugging**: Built-in debugging with the `debug` package
- 💪 **TypeScript**: Full TypeScript support with complete type definitions
- ⚡ **Modern**: Built on `ky` for a clean, promise-based API

## Installation

```bash
npm install @heroku/heroku-fetch
```

## Quick Start

### Basic Usage

```typescript
import { HerokuApiClient } from '@heroku/heroku-fetch';

// Create a client for the Platform API
// Automatically uses token from the HEROKU_API_KEY env var
const client = new HerokuApiClient({
  service: 'platform',
});

// Make a request
const response = await client.get('/apps');
const apps = await response.json();
console.log(apps);
```

### Service Configuration

The client comes with pre-configured settings for different Heroku services:

```typescript
// Platform API (default)
const platformClient = new HerokuApiClient({
  service: 'platform',
  token: 'your_token',
});

// Data API
const dataClient = new HerokuApiClient({
  service: 'data',
  token: 'your_token',
});

// Data API with EU region
const euDataClient = new HerokuApiClient({
  service: 'data',
  region: 'eu',
  token: 'your_token',
});

// Particleboard
const particleboardClient = new HerokuApiClient({
  service: 'particleboard',
  token: 'your_token',
});

// Custom API
const customClient = new HerokuApiClient({
  service: 'custom',
  baseUrl: 'https://your-custom-api.heroku.com',
  token: 'your_token',
});
```

## Authentication

### Automatic Token from Environment (Default)

By default, the client reads the token from the `HEROKU_API_KEY` environment variable:

```typescript
import { HerokuApiClient } from '@heroku/heroku-fetch';

// Token automatically loaded from HEROKU_API_KEY
const client = new HerokuApiClient({
  service: 'platform',
});
```

heroku-fetch does not read stored CLI credentials. To authenticate with
credentials saved by the Heroku CLI (native credential store or `~/.netrc`),
resolve a token with [`@heroku/heroku-credential-manager`](https://github.com/heroku/heroku-credential-manager)
and pass it to the client:

```typescript
import { HerokuApiClient } from '@heroku/heroku-fetch';
import { getAuth } from '@heroku/heroku-credential-manager';

// Pass the account to read the native credential store (Keychain, libsecret,
// Windows Credential Manager). Passing `undefined` reads `~/.netrc` by host
// only — it will not find credentials stored solely in the native store.
const { token } = await getAuth('your-account@example.com', 'api.heroku.com');
const client = new HerokuApiClient({
  service: 'platform',
  token,
});
```

### Static Bearer Token

```typescript
const client = new HerokuApiClient({
  service: 'platform',
  token: 'your_static_heroku_bearer_token',
});
```

### Dynamic Token Provider

Use a function to dynamically retrieve or refresh tokens:

```typescript
const client = new HerokuApiClient({
  service: 'platform',
  token: async () => {
    // Fetch token from secure store or refresh mechanism
    const token = await fetchFreshHerokuToken();
    return token;
  },
});
```

### Two-Factor Authentication

Handle 2FA challenges automatically:

```typescript
const client = new HerokuApiClient({
  service: 'platform',
  token: 'your_token',
  twoFactor: {
    onChallenge: async () => {
      // Prompt user for 2FA code
      const code = await promptUserFor2FA();
      return code;
    },
  },
});
```

## HTTP Methods

The client provides convenience methods for common HTTP operations:

### GET

```typescript
const response = await client.get('/apps');
const apps = await response.json();
```

### POST

```typescript
const response = await client.post('/apps', {
  name: 'my-new-app',
  region: 'us',
});
const app = await response.json();
```

### PUT

```typescript
const response = await client.put('/apps/my-app', {
  maintenance: true,
});
```

### PATCH

```typescript
const response = await client.patch('/apps/my-app', {
  name: 'renamed-app',
});
```

### DELETE

```typescript
const response = await client.delete('/apps/my-app');
```

## Request Options

All HTTP methods accept an optional `RequestOptions` object:

```typescript
const response = await client.get('/apps', {
  headers: {
    'X-Custom-Header': 'value',
  },
  timeout: 5000, // Override default timeout
  searchParams: {
    limit: 10,
    offset: 0,
  },
});
```

### Cancellation

Pass an `AbortSignal` to cancel an in-flight request. Aborting rejects the
returned promise with an `AbortError`:

```typescript
const controller = new AbortController();

// Cancel after 2 seconds
const timer = setTimeout(() => controller.abort(), 2000);

try {
  const response = await client.get('/apps', {signal: controller.signal});
  const apps = await response.json();
  clearTimeout(timer);
  console.log(apps);
} catch (error) {
  if ((error as Error).name === 'AbortError') {
    console.log('Request cancelled');
  } else {
    throw error;
  }
}
```

`signal` is also forwarded to `client.stream()`, so the same controller can
cancel a long-lived streaming response.

## Streaming

Stream data from endpoints like Logplex:

```typescript
const response = await client.stream('/apps/my-app/log-sessions/session-id');

// Node.js - use the response body as a stream
if (response.body) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    console.log(chunk);
  }
}
```

### Server-Sent Events (SSE)

```typescript
const response = await client.stream('/apps/my-app/log-sessions/session-id');

// Process SSE events
const reader = response.body?.getReader();
const decoder = new TextDecoder();

if (reader) {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    // Parse SSE format: "data: {...}\n\n"
    const events = text.split('\n\n').filter(Boolean);

    for (const event of events) {
      if (event.startsWith('data: ')) {
        const data = event.slice(6);
        console.log('Event:', data);
      }
    }
  }
}
```

## Error Handling

The client throws specific error types for different scenarios:

```typescript
import {
  HerokuApiError,
  AuthenticationError,
  NotFoundError,
  TwoFactorRequiredError,
  RateLimitError,
} from '@heroku/heroku-fetch';

try {
  const response = await client.get('/apps/nonexistent');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error('App not found');
  } else if (error instanceof AuthenticationError) {
    console.error('Invalid credentials');
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof TwoFactorRequiredError) {
    console.error('2FA required but not configured');
  } else if (error instanceof HerokuApiError) {
    console.error(`API Error: ${error.message}`);
    console.error(`Status: ${error.statusCode}`);
    console.error(`ID: ${error.id}`);
    console.error(`Errors: ${JSON.stringify(error.errors)}`);
  }
}
```

## Debugging

Enable debugging output using the `DEBUG` environment variable (Node.js) or `localStorage.debug` (browser):

```bash
# Enable all heroku-fetch debugging
DEBUG=heroku-fetch:* node your-script.js

# Enable specific namespaces
DEBUG=heroku-fetch:request,heroku-fetch:response node your-script.js
```

Available debug namespaces:
- `heroku-fetch:request` - Outgoing HTTP requests
- `heroku-fetch:response` - Incoming HTTP responses
- `heroku-fetch:auth` - Authentication and token management
- `heroku-fetch:error` - Error details

In the browser:
```javascript
localStorage.debug = 'heroku-fetch:*';
```

## Configuration Options

```typescript
interface HerokuApiClientOptions {
  /** Heroku service type */
  service?: 'platform' | 'data' | 'particleboard' | 'custom';

  /** Static bearer token or function to retrieve token */
  token?: string | (() => string | Promise<string>);

  /** Two-factor authentication configuration */
  twoFactor?: {
    onChallenge: () => string | Promise<string>;
  };

  /** Custom base URL (required for 'custom' service) */
  baseUrl?: string;

  /** Service region (e.g., 'eu', 'us') */
  region?: string;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Additional custom headers */
  headers?: Record<string, string>;

  /** Enable debug output */
  debug?: boolean;
}
```

## Updating Options

You can update client options after instantiation:

```typescript
const client = new HerokuApiClient({ service: 'platform' });

// Update token
client.setOption('token', 'new_token');

// Update timeout
client.setOption('timeout', 5000);
```

## TypeScript Support

The library is written in TypeScript and provides full type definitions:

```typescript
import type {
  HerokuApiClientOptions,
  RequestOptions,
  HerokuService,
  TokenProvider,
} from '@heroku/heroku-fetch';
```

## Examples

### Create and Deploy an App

```typescript
const client = new HerokuApiClient({
  service: 'platform',
  token: process.env.HEROKU_TOKEN,
});

// Create app
const createResponse = await client.post('/apps', {
  name: 'my-awesome-app',
  region: 'us',
});
const app = await createResponse.json();
console.log('Created app:', app.name);

// Get app details
const appResponse = await client.get(`/apps/${app.name}`);
const appDetails = await appResponse.json();
console.log('App details:', appDetails);
```

### Stream Logs

```typescript
const client = new HerokuApiClient({
  service: 'platform',
  token: process.env.HEROKU_TOKEN,
});

// Create log session
const sessionResponse = await client.post('/apps/my-app/log-sessions', {
  dyno: 'web.1',
  lines: 100,
  tail: true,
});
const session = await sessionResponse.json();

// Stream logs
const logsResponse = await client.stream(session.logplex_url);
const reader = logsResponse.body?.getReader();
const decoder = new TextDecoder();

if (reader) {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const logs = decoder.decode(value, { stream: true });
    process.stdout.write(logs);
  }
}
```

### Work with Postgres

```typescript
const client = new HerokuApiClient({
  service: 'data',
  token: process.env.HEROKU_TOKEN,
});

// List databases
const response = await client.get('/databases');
const databases = await response.json();
console.log('Databases:', databases);
```

### Oclif CLI Commands

Complete examples for building oclif CLI commands are available in `examples/oclif/`:

```typescript
import { Command } from '@oclif/core';
import { HerokuApiClient } from '@heroku/heroku-fetch';

export default class AppsList extends Command {
  async run() {
    // Client automatically uses token from the HEROKU_API_KEY env var
    const client = new HerokuApiClient({
      service: 'platform',
    });

    const response = await client.get('/apps');
    const apps = await response.json();

    // Display apps...
  }
}
```

See [examples/oclif/README.md](examples/oclif/README.md) for complete working examples including:
- Listing apps with table formatting
- Creating apps with validation
- Streaming logs in real-time
- Error handling patterns
- 2FA support

## Contributing

Contributions are welcome! Please see the repository for contribution guidelines.

## License

MIT

## Related Projects

- [ky](https://github.com/sindresorhus/ky) - The underlying HTTP client
- [debug](https://github.com/debug-js/debug) - Debugging utility

## Support

For issues and questions, please visit the [GitHub repository](https://github.com/heroku/heroku-fetch).
