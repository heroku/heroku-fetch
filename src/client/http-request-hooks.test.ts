import type {NormalizedOptions} from 'ky'

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest'

import * as debugLoggers from '../debug-loggers.js'
import {createBeforeRequestHook} from './http-request-hooks.js'

describe('createBeforeRequestHook', () => {
  let debugRequestSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    debugRequestSpy = vi.spyOn(debugLoggers, 'debugRequest').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Invoke a beforeRequest hook against a bare Request and return the
   * headers object passed to the `Headers: %O` debug line, if any.
   */
  async function loggedHeaders(
    hook: ReturnType<typeof createBeforeRequestHook>,
    request: Request,
  ): Promise<Record<string, string> | undefined> {
    await hook({options: {} as NormalizedOptions, request})
    const call = debugRequestSpy.mock.calls.find(([format]) => format === 'Headers: %O')
    return call?.[1] as Record<string, string> | undefined
  }

  it('redacts the Authorization header in debug output', async () => {
    const hook = createBeforeRequestHook(
      async () => 'super-secret-token',
      undefined,
      undefined,
      true,
    )
    const request = new Request('https://api.heroku.com/apps')

    const headers = await loggedHeaders(hook, request)

    // The token must actually be set on the request...
    expect(request.headers.get('Authorization')).toBe('Bearer super-secret-token')
    // ...but must never appear in the logged headers.
    expect(headers?.authorization).toBe('[REDACTED]')
    expect(JSON.stringify(headers)).not.toContain('super-secret-token')
  })

  it('redacts other sensitive headers passed as custom headers', async () => {
    const hook = createBeforeRequestHook(
      async () => {},
      undefined,
      {'X-Addon-SSO': 'sso-secret', 'X-Safe': 'ok'},
      true,
    )
    const request = new Request('https://api.heroku.com/apps')

    const headers = await loggedHeaders(hook, request)

    expect(headers?.['x-addon-sso']).toBe('[REDACTED]')
    expect(headers?.['x-safe']).toBe('ok')
    expect(JSON.stringify(headers)).not.toContain('sso-secret')
  })

  it('does not log headers when debug is disabled', async () => {
    const hook = createBeforeRequestHook(
      async () => 'super-secret-token',
      undefined,
      undefined,
      false,
    )
    const request = new Request('https://api.heroku.com/apps')

    const headers = await loggedHeaders(hook, request)

    expect(headers).toBeUndefined()
  })
})
