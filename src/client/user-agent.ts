import type {UserAgentOptions} from '../types.js'

/**
 * Assemble a canonical `User-Agent` string from a product
 * {@link UserAgentOptions} and an environment comment. The comment (a Node
 * platform/runtime token, or empty on a browser — see `getUserAgentComment` in
 * the environment-defaults modules) is appended after the `<name>/<version>`
 * product token when present:
 * `heroku-cli/11.4.0 (darwin; arm64) Node.js/22.21.0`, degrading to the bare
 * `heroku-cli/11.4.0` when the comment is empty.
 */
export function formatUserAgent(userAgent: UserAgentOptions, comment: string): string {
  const product = `${userAgent.name}/${userAgent.version}`
  return comment ? `${product} ${comment}` : product
}

/**
 * Resolve the `User-Agent` header value to apply, or `undefined` when none
 * should be set. Returns `undefined` for an absent option or an incomplete one
 * (either `name` or `version` empty), so the client never emits a malformed
 * token like `/ (darwin; arm64) …`. Otherwise delegates to {@link formatUserAgent}.
 */
export function resolveUserAgentHeader(
  userAgent: undefined | UserAgentOptions,
  comment: string,
): string | undefined {
  if (!userAgent?.name || !userAgent.version) {
    return undefined
  }

  return formatUserAgent(userAgent, comment)
}
