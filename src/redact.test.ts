import {
  describe, expect, it, vi,
} from 'vitest'

import {
  logScrubbed, redactUrl, redactUrlPath, scrubForLog,
} from './redact.js'

function makeLogger(enabled: boolean) {
  const logger = vi.fn() as unknown as {
    (formatter: string, ...args: unknown[]): void
    enabled: boolean
    mock: {calls: unknown[][]}
  }
  logger.enabled = enabled
  return logger
}

describe('scrubForLog', () => {
  it('redacts sensitive keys in a plain object but keeps benign ones', async () => {
    const result = await scrubForLog({
      note: 'ok',
      statusCode: 404,
      token: 'super-secret',
    }) as Record<string, unknown>

    expect(result.token).toBe('[REDACTED]')
    // `code` is deliberately not a field, so `statusCode` survives.
    expect(result.statusCode).toBe(404)
    expect(result.note).toBe('ok')
  })

  it('converts a Headers instance so its entries are scrubbed (not flattened to {})', async () => {
    const headers = new Headers({
      Authorization: 'Bearer super-secret-token',
      'X-Safe': 'ok',
    })

    const result = await scrubForLog(headers) as Record<string, unknown>

    expect(result.authorization).toBe('[REDACTED]')
    expect(result['x-safe']).toBe('ok')
    expect(JSON.stringify(result)).not.toContain('super-secret-token')
  })

  it('preserves an Error\'s message/stack (non-enumerable) and masks inline Bearer tokens', async () => {
    const error = new Error('request failed with Authorization: Bearer abc.def-123')

    const result = await scrubForLog(error) as Record<string, unknown>

    expect(result.name).toBe('Error')
    expect(typeof result.stack).toBe('string')
    expect(result.message).toContain('[REDACTED]')
    expect(JSON.stringify(result)).not.toContain('abc.def-123')
  })

  it('redacts credentials in an Error message, keeping the surrounding text', async () => {
    const error = new Error([
      'token HRKU-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'db postgres://user:p4ssw0rd@db.example.com:5432/d',
      'Authorization: Digest username="u", response="abc123"',
      'Authorization: Bearer abc.def-123',
    ].join('\n'))

    const {message} = await scrubForLog(error) as {message: string}

    expect(message).toBe([
      'token [REDACTED]',
      'db postgres://[REDACTED]@db.example.com:5432/d',
      'Authorization: Digest [REDACTED]',
      'Authorization: Bearer [REDACTED]',
    ].join('\n'))
  })

  it('redacts a PEM private key body in a nested string value', async () => {
    const result = await scrubForLog({
      detail: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----',
    }) as {detail: string}

    expect(result.detail).toBe('-----BEGIN PRIVATE KEY-----[REDACTED]')
  })

  it('leaves prose that mentions Basic or Bearer alone', async () => {
    const message = 'Basic size dynos cannot scale; see the bearer of this note'

    const result = await scrubForLog({message}) as {message: string}

    expect(result.message).toBe(message)
  })

  it('redacts sensitive own-properties attached to an Error', async () => {
    const error = Object.assign(new Error('boom'), {
      detail: 'safe',
      token: 'leaked-token',
    })

    const result = await scrubForLog(error) as Record<string, unknown>

    expect(result.token).toBe('[REDACTED]')
    expect(result.detail).toBe('safe')
  })

  it('summarizes a nested Response rather than passing the live object through', async () => {
    const error = Object.assign(new Error('http error'), {
      response: new Response(null, {status: 404, statusText: 'Not Found'}),
    })

    const result = await scrubForLog(error) as {response: Record<string, unknown>}

    expect(result.response).toEqual({
      status: 404,
      statusText: 'Not Found',
      url: '',
    })
  })

  it('recursively scrubs a nested cause', async () => {
    const cause = Object.assign(new Error('inner'), {secret: 'nope'})
    const error = new Error('outer', {cause})

    const result = await scrubForLog(error) as {cause: Record<string, unknown>}

    expect(result.cause.name).toBe('Error')
    expect(result.cause.message).toBe('inner')
    expect(result.cause.secret).toBe('[REDACTED]')
  })

  it('redacts credentials in a nested Response URL (userinfo and sensitive query params)', async () => {
    const error = Object.assign(new Error('http error'), {
      response: {
        status: 302,
        statusText: 'Found',
        url: 'https://user:pass@example.com/sso?SAMLResponse=abc&nonce=xyz&page=2',
      },
    })

    const result = await scrubForLog(error) as {response: {url: string}}
    const url = new URL(result.response.url)

    // The URL credential pattern collapses the userinfo to one token, the same
    // form js-blanket uses for a URL in any other string.
    expect(result.response.url).toMatch(/^https:\/\/\[REDACTED]@example\.com\//)
    expect(url.password).toBe('')
    expect(url.searchParams.get('SAMLResponse')).toBe('[REDACTED]')
    expect(url.searchParams.get('nonce')).toBe('[REDACTED]')
    // Benign params are preserved.
    expect(url.searchParams.get('page')).toBe('2')
    expect(result.response.url).not.toContain('pass')
    expect(result.response.url).not.toContain('abc')
  })

  it('caps cyclic cause recursion without crashing', async () => {
    const a = new Error('a') as Error & {cause?: unknown}
    const b = new Error('b') as Error & {cause?: unknown}
    a.cause = b
    b.cause = a

    const result = await scrubForLog(a) as Record<string, unknown>

    // Walk the scrubbed cause chain; it must terminate at the sentinel rather
    // than recurse forever.
    let node: Record<string, unknown> | undefined = result
    let hops = 0
    while (node && typeof node.cause === 'object') {
      node = node.cause as Record<string, unknown>
      hops++
      expect(hops).toBeLessThan(50)
    }

    expect(node?.cause).toBe('[max cause depth exceeded]')
  })

  it('passes primitives through untouched', async () => {
    expect(await scrubForLog('hello')).toBe('hello')
    expect(await scrubForLog(42)).toBe(42)
    expect(await scrubForLog(null)).toBeNull()
    expect(await scrubForLog()).toBeUndefined()
  })

  it('fails closed to "[unscrubbable]" when scrubbing throws', async () => {
    const hostile = {
      get secret() {
        throw new Error('cannot read')
      },
    }

    expect(await scrubForLog(hostile)).toBe('[unscrubbable]')
  })
})

describe('logScrubbed', () => {
  it('does not invoke the logger (or scrub) when the namespace is disabled', async () => {
    const logger = makeLogger(false)

    await logScrubbed(logger, 'secret: %O', {token: 'super-secret'})

    expect(logger.mock.calls).toHaveLength(0)
  })

  it('emits scrubbed values through the logger when enabled', async () => {
    const logger = makeLogger(true)

    await logScrubbed(logger, 'headers: %O', {safe: 'ok', token: 'super-secret'})

    expect(logger.mock.calls).toHaveLength(1)
    const [format, payload] = logger.mock.calls[0] as [string, Record<string, unknown>]
    expect(format).toBe('headers: %O')
    expect(payload.token).toBe('[REDACTED]')
    expect(payload.safe).toBe('ok')
  })

  it('scrubs each positional value independently', async () => {
    const logger = makeLogger(true)

    await logScrubbed(logger, '%d %O', 500, {secret: 'x'})

    const [, status, payload] = logger.mock.calls[0] as [string, number, Record<string, unknown>]
    expect(status).toBe(500)
    expect(payload.secret).toBe('[REDACTED]')
  })
})

describe('redactUrl', () => {
  it('redacts userinfo and sensitive query values, keeping the rest readable', () => {
    expect(redactUrl('https://user:pass@logs.heroku.com/sessions/abc?srv=1&token=s3cret&page=2'))
      .toBe('https://[REDACTED]:[REDACTED]@logs.heroku.com/sessions/abc?srv=1&token=[REDACTED]&page=2')
  })

  it('leaves a URL without credentials unchanged', () => {
    expect(redactUrl('https://api.heroku.com/apps?page=2')).toBe('https://api.heroku.com/apps?page=2')
  })

  it('passes through values it cannot parse', () => {
    expect(redactUrl('/apps?token=x')).toBe('/apps?token=x')
    expect(redactUrl(null)).toBeNull()
  })
})

describe('redactUrlPath', () => {
  it('keeps only the origin', () => {
    expect(redactUrlPath('https://logplex.heroku.com/sessions/01234567-89ab?srv=1325419200'))
      .toBe('https://logplex.heroku.com/[REDACTED]')
  })

  it('returns only the replacement for a value it cannot parse', () => {
    expect(redactUrlPath('/sessions/abc')).toBe('[REDACTED]')
  })
})
