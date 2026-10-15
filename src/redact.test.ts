import {
  describe, expect, it, vi,
} from 'vitest'

import {logScrubbed, scrubForLog} from './redact.js'

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
