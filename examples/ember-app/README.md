# Heroku Fetch - Ember Example

This is a simple Ember application that demonstrates using `@heroku/api-client` (heroku-fetch) in a browser-based Ember app.

## Features

- Fetch and display your Heroku apps using the Heroku Platform API
- Modern Ember application structure with Glimmer components
- **Zero configuration** - heroku-fetch automatically provides browser-compatible code via conditional exports
- Token management with localStorage

## Prerequisites

- Node.js 18 or higher
- A Heroku account with an API token

## Installation

```bash
npm install
```

## Running the Example

Start the development server:

```bash
npm start
```

Then open your browser to http://localhost:4200

## Usage

1. Get your Heroku API token from https://dashboard.heroku.com/account
2. Enter your token in the input field
3. Click "Fetch My Apps" to retrieve your Heroku applications
4. Your apps will be displayed with their region, stack, and creation date

## How It Works

The example uses a Glimmer component (`app/components/heroku-apps.js`) that:

1. Creates a `HerokuApiClient` instance with your API token
2. Calls the `/apps` endpoint to fetch your applications
3. Displays the results in a formatted list
4. Handles errors gracefully with specific error types

## Key Code

```javascript
import { HerokuApiClient, HerokuApiError } from '@heroku/api-client';

// Create client with your token (required in browser environments)
const client = new HerokuApiClient({
  service: 'platform',
  token: this.apiToken,
});

// Fetch apps
const response = await client.get('/apps');
const apps = await response.json();
```

## Browser Compatibility

The `@heroku/api-client` package uses **conditional exports** to automatically provide browser-compatible code when bundling for browsers. This means:

- **No webpack configuration needed** - the package automatically excludes Node.js-specific code (netrc, file system access, CLI utilities)
- **Shared core code** - The same HTTP client logic is used in both Node.js and browser environments
- **Explicit token required** - In browsers, you must provide a token explicitly (no automatic netrc/env loading)

This works because the package.json defines:

```json
{
  "exports": {
    ".": {
      "browser": "./dist/browser.js",
      "default": "./dist/index.js"
    }
  }
}
```

Bundlers like webpack and Vite automatically select the browser entry point when building for browser targets.

## Building for Production

```bash
npm run build
```

The built application will be in the `dist/` directory.
