import type {NormalizedOptions} from 'ky'

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest'

import type {ResponseMetadata} from '../types.js'

import * as debugLoggers from '../debug-loggers.js'
import {
  createBeforeRequestHook,
  createMetadataAfterHook,
  createRequestIdAfterHook,
  createRequestIdBeforeHook,
  createWarningAfterHook,
} from './http-request-hooks.js'
import {REQUEST_ID_HEADER, RequestIdStore} from './request-id.js'

/** Feed a response (optionally carrying a Request-Id) through the after hook. */
function trackResponse(store: RequestIdStore, responseRequestId?: string): void {
  const headers = new Headers()
  if (responseRequestId !== undefined) headers.set(REQUEST_ID_HEADER, responseRequestId)
  const response = new Response(null, {headers})
  const hook = createRequestIdAfterHook(store)
  hook({options: {} as NormalizedOptions, request: new Request('https://api.heroku.com/apps'), response})
}

/** Feed a response carrying the given headers through the warning after hook. */
function emitWarning(headers: Record<string, string>, warn: (message: string) => void, shown = new Set<string>()): void {
  const response = new Response(null, {headers})
  const hook = createWarningAfterHook(shown, warn)
  hook({options: {} as NormalizedOptions, request: new Request('https://api.heroku.com/apps'), response})
}

/** Feed a response through the metadata hook and return the captured metadata. */
function collectMetadata(headers: Record<string, string>, status = 200): ResponseMetadata {
  let captured: ResponseMetadata | undefined
  const response = new Response(null, {headers, status})
  const hook = createMetadataAfterHook(metadata => {
    captured = metadata
  })
  hook({options: {} as NormalizedOptions, request: new Request('https://api.heroku.com/apps'), response})
  if (!captured) throw new Error('metadata hook did not fire')
  return captured
}

describe('createBeforeRequestHook', () => {
  let debugRequestSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    debugRequestSpy = vi.spyOn(debugLoggers, 'debugRequest').mockImplementation(() => true)
    // logScrubbed() gates on the logger's `.enabled` flag; the mock fn
    // doesn't carry one, so set it so the scrubbed header line is emitted.
    Object.assign(debugRequestSpy, {enabled: true})
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

  describe('default Accept header', () => {
    it('applies the resolved default when the request has no Accept', async () => {
      const hook = createBeforeRequestHook(
        async () => {},
        'application/vnd.heroku+json; version=3.sdk',
        undefined,
        false,
      )
      const request = new Request('https://api.heroku.com/apps')

      await hook({options: {} as NormalizedOptions, request})

      expect(request.headers.get('Accept')).toBe('application/vnd.heroku+json; version=3.sdk')
    })

    it('does not clobber an Accept the caller already set (per-call withHeaders wins)', async () => {
      const hook = createBeforeRequestHook(
        async () => {},
        'application/vnd.heroku+json; version=3.sdk',
        undefined,
        false,
      )
      const request = new Request('https://api.heroku.com/apps', {
        headers: {Accept: 'application/vnd.heroku+json; version=3'},
      })

      await hook({options: {} as NormalizedOptions, request})

      // The per-request Accept survives; the default is only a fallback.
      expect(request.headers.get('Accept')).toBe('application/vnd.heroku+json; version=3')
    })

    it('applies no Accept when neither a default nor a request Accept is present', async () => {
      const hook = createBeforeRequestHook(async () => {}, undefined, undefined, false)
      const request = new Request('https://api.heroku.com/apps')

      await hook({options: {} as NormalizedOptions, request})

      expect(request.headers.has('Accept')).toBe(false)
    })
  })
})

describe('createRequestIdBeforeHook', () => {
  it('sets the Request-Id header to the store\'s next accumulated value', async () => {
    let n = 0
    const store = new RequestIdStore(() => `id-${n++}`)
    const hook = createRequestIdBeforeHook(store)
    const request = new Request('https://api.heroku.com/apps')

    await hook({options: {} as NormalizedOptions, request})
    expect(request.headers.get(REQUEST_ID_HEADER)).toBe('id-0')

    // A second request carries the accumulated chain.
    const next = new Request('https://api.heroku.com/apps')
    await hook({options: {} as NormalizedOptions, request: next})
    expect(next.headers.get(REQUEST_ID_HEADER)).toBe('id-1,id-0')
  })
})

describe('createRequestIdAfterHook', () => {
  it('tracks the server-echoed Request-Ids into the store', () => {
    let n = 0
    const store = new RequestIdStore(() => `local-${n++}`)
    store.create() // local-0

    trackResponse(store, 'server-a,server-b')

    // Novel server ids are prepended ahead of the locally-generated one.
    expect(store.headerValue).toBe('server-a,server-b,local-0')
  })

  it('is a no-op when the response carries no Request-Id', () => {
    const store = new RequestIdStore(() => 'local-0')
    store.create()

    trackResponse(store)

    expect(store.headerValue).toBe('local-0')
  })
})

describe('createWarningAfterHook', () => {
  it('surfaces an x-heroku-warning to the warn callback', () => {
    const warn = vi.fn()
    emitWarning({'x-heroku-warning': 'Your app is deprecated.'}, warn)
    expect(warn).toHaveBeenCalledWith('Your app is deprecated.')
  })

  it('falls back to warning-message when x-heroku-warning is absent', () => {
    const warn = vi.fn()
    emitWarning({'warning-message': 'A fallback warning.'}, warn)
    expect(warn).toHaveBeenCalledWith('A fallback warning.')
  })

  it('prefers x-heroku-warning over warning-message when both are present', () => {
    const warn = vi.fn()
    emitWarning({'warning-message': 'ignored', 'x-heroku-warning': 'preferred'}, warn)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('preferred')
  })

  it('strips a leading "warning:" prefix (case-insensitive) and trims', () => {
    const warn = vi.fn()
    emitWarning({'x-heroku-warning': '  Warning: heads up  '}, warn)
    expect(warn).toHaveBeenCalledWith('heads up')
  })

  it('dedupes repeated warnings across responses sharing a store', () => {
    const warn = vi.fn()
    const shown = new Set<string>()
    emitWarning({'x-heroku-warning': 'same warning'}, warn, shown)
    emitWarning({'x-heroku-warning': 'warning: same warning'}, warn, shown) // normalizes equal
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no warning header is present', () => {
    const warn = vi.fn()
    emitWarning({}, warn)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('createMetadataAfterHook', () => {
  it('reports request-ids (split from the header), status, url, and the normalized warning', () => {
    const metadata = collectMetadata({
      [REQUEST_ID_HEADER]: 'abc,def',
      'x-heroku-warning': 'warning: heads up',
    })

    expect(metadata).toEqual({
      requestIds: ['abc', 'def'],
      status: 200,
      url: 'https://api.heroku.com/apps',
      warnings: ['heads up'],
    })
  })

  it('reports a single request-id as a one-element array', () => {
    const metadata = collectMetadata({[REQUEST_ID_HEADER]: 'only-one'})

    expect(metadata.requestIds).toEqual(['only-one'])
  })

  it('reports empty lists for request-ids and warnings when neither is present', () => {
    const metadata = collectMetadata({})

    expect(metadata.requestIds).toEqual([])
    expect(metadata.warnings).toEqual([])
  })
})
