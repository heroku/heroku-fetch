# Testing heroku-fetch

This document shows the successful testing of heroku-fetch with netrc authentication and oclif commands.

## Build and Test

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## Basic Usage Example

Test the basic usage pattern with netrc authentication:

```bash
npx tsx examples/basic-usage.ts
```

**Output:**
```
Fetching apps...
Found 200 apps

Fetching details for app: agile-beyond-18927
App details: {
  name: 'agile-beyond-18927',
  region: 'us',
  stack: 'heroku-24',
  created: '2025-06-13T19:38:04Z'
}

Fetching dynos for app: agile-beyond-18927
Found 0 dynos
```

## Oclif Command Examples

The oclif command examples demonstrate real-world CLI command usage with automatic netrc authentication.

### Run Script

Use the run script to execute commands:

```bash
./examples/oclif/run.sh <command> [args...]
```

### apps:list Command

List all apps with formatted output:

```bash
./examples/oclif/run.sh apps-list
```

**Output:**
```
=== Apps (200)

agile-beyond-18927 (us)
ai-models (us)
aistudio-canary (virginia)
...
```

With JSON output:

```bash
./examples/oclif/run.sh apps-list --json
```

**Output:**
```json
[
  {
    "name": "agile-beyond-18927",
    "region": { "name": "us" },
    "stack": { "name": "heroku-24" },
    ...
  },
  ...
]
```

### apps:info Command

Get detailed information about a specific app:

```bash
./examples/oclif/run.sh apps-info --app agile-beyond-18927
```

**Output:**
```
=== agile-beyond-18927
Owner       : heroku-dev-tools@herokumanager.com
Region      : us
Stack       : heroku-24
Web URL     : https://agile-beyond-18927-064009444f6e.herokuapp.com/
Git URL     : https://git.heroku.com/agile-beyond-18927.git
Maintenance : off
Organization: heroku-dev-tools
```

With JSON output:

```bash
./examples/oclif/run.sh apps-info --app agile-beyond-18927 --json
```

**Output:**
```json
{
  "name": "agile-beyond-18927",
  "owner": { "email": "heroku-dev-tools@herokumanager.com" },
  "region": { "name": "us" },
  "stack": { "name": "heroku-24" },
  ...
}
```

## Key Features Demonstrated

✅ **Automatic netrc authentication** - Uses `getAuthToken()` to load tokens from `~/.netrc`
✅ **Works with oclif** - Full oclif command structure with proper error handling
✅ **Multiple output formats** - Supports both formatted and JSON output
✅ **Error handling** - Proper error types and messages
✅ **TypeScript ESM** - Modern ESM modules with full TypeScript support
✅ **Service configuration** - Easy switching between Platform API, Data API, etc.

## Authentication

All examples use the built-in `getAuthToken()` utility which:

1. Checks `HEROKU_API_KEY` environment variable first
2. Falls back to `~/.netrc` file (api.heroku.com machine)
3. Lazily loads netrc to avoid unnecessary file operations

No manual netrc parsing required!

## Debug Mode

Enable debug output to see requests and responses:

```bash
DEBUG=heroku-fetch:* ./examples/oclif/run.sh apps-list
```

Available debug namespaces:
- `heroku-fetch:request` - HTTP requests
- `heroku-fetch:response` - HTTP responses
- `heroku-fetch:auth` - Authentication
- `heroku-fetch:error` - Error details
