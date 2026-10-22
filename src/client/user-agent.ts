import type {UserAgentOptions} from '../types.js'

/**
 * Assemble a `User-Agent` string in the canonical form defined by RFC 9110
 * §10.1.5 — a `product` token (`<name>/<version>`) optionally followed by a
 * `comment` (RFC 9110 §5.6.5) carrying implementation detail. The comment (the
 * Node platform/runtime token from `getUserAgentComment` in the
 * environment-defaults modules) is appended after the product token when
 * present: `heroku-cli/11.4.0 (darwin; arm64) Node.js/22.21.0`, degrading to the
 * bare `heroku-cli/11.4.0` when the comment is empty. (The browser build opts
 * out of a client-managed `User-Agent` entirely upstream in
 * {@link resolveUserAgentHeader}, so it never reaches here.)
 *
 * Note this canonical `product (comment)` shape differs from the older Heroku
 * clients (`@heroku-cli/command` emits `heroku-cli/<v> <platform>`, `http-call`
 * emits `node-<v>`): server-side consumers that pattern-match the legacy string
 * shape will not match this one.
 */
export function formatUserAgent(userAgent: UserAgentOptions, comment: string): string {
  const product = `${userAgent.name}/${userAgent.version}`
  return comment ? `${product} ${comment}` : product
}

/**
 * Resolve the `User-Agent` header value to apply, or `undefined` when none
 * should be set. Returns `undefined` when:
 * - `comment` is `undefined` — the platform opts out of a client-managed
 *   `User-Agent` entirely (the browser build, which returns `undefined` from
 *   `getUserAgentComment`: a `fetch`-set `User-Agent` isn't CORS-safelisted, so
 *   emitting one risks a preflight rejection, and the browser sends its own
 *   anyway); or
 * - the option is absent or incomplete (either `name` or `version` empty), so
 *   the client never emits a malformed token like `/ (darwin; arm64) …`.
 *
 * Otherwise delegates to {@link formatUserAgent}.
 */
export function resolveUserAgentHeader(
  userAgent: undefined | UserAgentOptions,
  comment: string | undefined,
): string | undefined {
  if (comment === undefined || !userAgent?.name || !userAgent.version) {
    return undefined
  }

  return formatUserAgent(userAgent, comment)
}
