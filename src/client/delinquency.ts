/**
 * Account/team delinquency warnings (opt-in).
 *
 * A GET to `/account` or `/teams/<id>` on the API host can trigger a side-call
 * to Particleboard, and a scheduled suspension/deletion is surfaced to the user.
 * This module holds the pure logic — which requests qualify, and the message a
 * delinquency payload maps to; the side-call itself is wired as an afterResponse
 * hook.
 */

/** The Particleboard delinquency payload shape. */
export interface DelinquencyInfo {
  scheduled_deletion_time?: null | string;
  scheduled_suspension_time?: null | string;
}

/** A qualifying delinquency-checkable request. */
export interface DelinquencyMatch {
  /** The Particleboard path to fetch (same path as the originating request). */
  fetchUrl: string;
  resourceType: 'account' | 'team';
}

// The `/teams/<id>` segment is the team id or name; capture it up to the next
// path delimiter, query, or fragment.

const ACCOUNT_PATH = /^\/account$/i
const TEAM_PATH = /^\/teams\/([^#/?]+)/i

/**
 * Decide whether a request qualifies for a delinquency check: GET only, same
 * host as the API base, and a path of `/account` or `/teams/<id>` (the team id
 * or name). Returns the Particleboard fetch target, or `undefined` when the
 * request doesn't qualify.
 */
export function matchDelinquencyResource(
  method: string,
  requestUrl: string,
  apiHostname: string,
): DelinquencyMatch | undefined {
  if (method.toUpperCase() !== 'GET') return undefined

  const {hostname, pathname} = new URL(requestUrl)
  if (hostname !== apiHostname) return undefined

  if (ACCOUNT_PATH.test(pathname)) {
    return {fetchUrl: '/account', resourceType: 'account'}
  }

  const teamMatch = pathname.match(TEAM_PATH)
  if (teamMatch) {
    return {fetchUrl: `/teams/${teamMatch[1]}`, resourceType: 'team'}
  }

  return undefined
}

/** The outcome of evaluating a delinquency payload. */
export interface DelinquencyOutcome {
  /** The warning to surface, if any. */
  message?: string;
  /**
   * Whether the per-client "already warned" guard should trip: set whenever a
   * suspension or deletion time parsed — even when that produced no message (a
   * past suspension with no deletion) — so the side-call isn't repeated. Stays
   * `false` only when neither time parsed.
   */
  warningShown: boolean;
}

/**
 * Map a delinquency payload to the user-facing warning and the guard flag.
 * `now` is injected for testability.
 */
export function evaluateDelinquency(
  resource: 'account' | 'team',
  info: DelinquencyInfo,
  now: number,
): DelinquencyOutcome {
  const suspension = info.scheduled_suspension_time ? Date.parse(info.scheduled_suspension_time) : undefined
  const deletion = info.scheduled_deletion_time ? Date.parse(info.scheduled_deletion_time) : undefined

  // Neither time present/parseable → no warning, guard untouched.
  if (!suspension && !deletion) return {warningShown: false}

  if (suspension) {
    if (suspension > now) {
      return {
        message: `This ${resource} is delinquent with payment and we'll suspend it on ${new Date(suspension).toString()}.`,
        warningShown: true,
      }
    }

    if (deletion) {
      return {
        message:
          `This ${resource} is delinquent with payment and we suspended it on ${new Date(suspension).toString()}. `
          + `If the ${resource} is still delinquent, we'll delete it on ${new Date(deletion).toString()}.`,
        warningShown: true,
      }
    }

    // Suspension already passed and no deletion scheduled: no message, but the
    // guard still trips so the side-call isn't repeated.
    return {warningShown: true}
  }

  if (deletion) {
    return {
      message: `This ${resource} is delinquent with payment and we'll delete it on ${new Date(deletion).toString()}.`,
      warningShown: true,
    }
  }

  // Unreachable: the early return above covers "neither time present".
  return {warningShown: false}
}
