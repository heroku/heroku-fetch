/**
 * Request-Id correlation store.
 *
 * Each client accumulates the `Request-Id`s it has generated and the ones the
 * server echoes back, and sends the running list on every request so a chain of
 * related calls can be correlated server-side. Unlike the CLI's module-global
 * store this is per-client, so parallel clients don't cross-contaminate and the
 * accumulation resets when a client is discarded.
 */

/** The header the Heroku API reads/echoes for request correlation. */
export const REQUEST_ID_HEADER = 'Request-Id'

/**
 * Cap the accumulated header at 7KB. Long-running polls (e.g. `pg:wait`) have
 * been observed to push the accumulated `Request-Id` header past 8KB — Node's
 * default max header size — which fails the request. 7KB leaves room for the
 * other headers. Measured in bytes (not characters) via TextEncoder so it
 * matches what goes on the wire without depending on Node's Buffer.
 */
const MAX_REQUEST_ID_BYTES = 1024 * 7

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

export class RequestIdStore {
  private ids: string[] = []

  /**
   * @param generate UUID generator; defaults to the platform's
   *   `crypto.randomUUID` (present on Node 18+ and in browsers). Injectable for
   *   deterministic tests.
   */
  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- global `crypto` is available on Node 22 (and in browsers); the lint engine's compatibility table conservatively marks it 23+. Using node:crypto would break the Node-agnostic core.
  constructor(private readonly generate: () => string = () => globalThis.crypto.randomUUID()) {}

  /** Current accumulated ids joined for the header (comma, no space). */
  get headerValue(): string {
    return this.ids.join(',')
  }

  /** Generate a new id, prepend it to the accumulated list, return the list. */
  create(): string[] {
    this.ids = [this.generate(), ...this.ids]
    return this.ids
  }

  /** Reset the accumulated list. */
  empty(): void {
    this.ids = []
  }

  /**
   * The header value to send on the next request: generate+accumulate a fresh
   * id, then apply the overflow guard. On overflow the list is RESET (not
   * truncated) and a single fresh id is sent. Always returns the comma-joined
   * string (the CLI's overflow branch accidentally assigned an array; here it
   * is deliberately always a string).
   */
  nextHeaderValue(): string {
    this.create()
    if (byteLength(this.headerValue) > MAX_REQUEST_ID_BYTES) {
      this.empty()
      this.create()
    }

    return this.headerValue
  }

  /** Prepend server-returned ids not already tracked (dedupe), return the list. */
  track(...ids: string[]): string[] {
    const novel = ids.filter(id => !this.ids.includes(id))
    this.ids = [...novel, ...this.ids]
    return this.ids
  }
}
