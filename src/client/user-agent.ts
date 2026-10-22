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
