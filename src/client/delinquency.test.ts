import {describe, expect, it} from 'vitest'

import {evaluateDelinquency, matchDelinquencyResource} from './delinquency.js'

const API_HOST = 'api.heroku.com'
const url = (path: string): string => `https://api.heroku.com${path}`

describe('matchDelinquencyResource', () => {
  it('matches GET /account', () => {
    expect(matchDelinquencyResource('GET', url('/account'), API_HOST)).toEqual({
      fetchUrl: '/account',
      resourceType: 'account',
    })
  })

  it('matches GET /teams/<id> and captures the id', () => {
    expect(matchDelinquencyResource('GET', url('/teams/acme'), API_HOST)).toEqual({
      fetchUrl: '/teams/acme',
      resourceType: 'team',
    })
  })

  it('stops the team id capture at the next path segment', () => {
    expect(matchDelinquencyResource('GET', url('/teams/acme/apps'), API_HOST)).toEqual({
      fetchUrl: '/teams/acme',
      resourceType: 'team',
    })
  })

  it('ignores a query string when matching', () => {
    expect(matchDelinquencyResource('GET', url('/teams/acme?foo=1'), API_HOST)?.fetchUrl).toBe('/teams/acme')
    expect(matchDelinquencyResource('GET', url('/account?x=1'), API_HOST)?.resourceType).toBe('account')
  })

  it('does not match a non-GET method', () => {
    expect(matchDelinquencyResource('POST', url('/account'), API_HOST)).toBeUndefined()
  })

  it('does not match a non-qualifying path', () => {
    expect(matchDelinquencyResource('GET', url('/apps'), API_HOST)).toBeUndefined()
    expect(matchDelinquencyResource('GET', url('/account/features'), API_HOST)).toBeUndefined()
  })

  it('does not match a request on a different host', () => {
    expect(matchDelinquencyResource('GET', 'https://evil.example/account', API_HOST)).toBeUndefined()
  })
})

describe('evaluateDelinquency', () => {
  const now = Date.parse('2026-06-01T00:00:00.000Z')

  it('returns no warning and leaves the guard untripped when neither time is present', () => {
    expect(evaluateDelinquency('account', {}, now)).toEqual({warningShown: false})
  })

  it('leaves the guard untripped when the times are unparseable', () => {
    expect(evaluateDelinquency('account', {
      scheduled_deletion_time: 'not-a-date',
      scheduled_suspension_time: 'nonsense',
    }, now)).toEqual({warningShown: false})
  })

  it('warns about a future suspension', () => {
    const suspension = '2026-07-01T00:00:00.000Z'
    const result = evaluateDelinquency('account', {scheduled_suspension_time: suspension}, now)

    expect(result).toEqual({
      message: `This account is delinquent with payment and we'll suspend it on ${new Date(Date.parse(suspension)).toString()}.`,
      warningShown: true,
    })
  })

  it('warns about a past suspension with a pending deletion', () => {
    const suspension = '2026-05-01T00:00:00.000Z'
    const deletion = '2026-07-01T00:00:00.000Z'
    const result = evaluateDelinquency('team', {
      scheduled_deletion_time: deletion,
      scheduled_suspension_time: suspension,
    }, now)

    expect(result).toEqual({
      message:
        `This team is delinquent with payment and we suspended it on ${new Date(Date.parse(suspension)).toString()}. `
        + `If the team is still delinquent, we'll delete it on ${new Date(Date.parse(deletion)).toString()}.`,
      warningShown: true,
    })
  })

  it('trips the guard without a message for a past suspension and no deletion', () => {
    const result = evaluateDelinquency('account', {scheduled_suspension_time: '2026-05-01T00:00:00.000Z'}, now)

    expect(result).toEqual({warningShown: true})
  })

  it('warns about a deletion when there is no suspension', () => {
    const deletion = '2026-07-01T00:00:00.000Z'
    const result = evaluateDelinquency('account', {scheduled_deletion_time: deletion}, now)

    expect(result).toEqual({
      message: `This account is delinquent with payment and we'll delete it on ${new Date(Date.parse(deletion)).toString()}.`,
      warningShown: true,
    })
  })
})
