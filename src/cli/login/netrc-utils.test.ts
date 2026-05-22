import {
  beforeEach, describe, expect, it, vi,
} from 'vitest'

// Mock netrc-parser so the tests don't read or write the real ~/.netrc.
// The mock keeps an in-memory `machines` map and no-ops load/save.
vi.mock('netrc-parser', () => {
  class Netrc {
    machines: Record<string, Record<string, string> | undefined> = {}

    load() {
      return Promise.resolve()
    }

    loadSync() {}

    save() {
      return Promise.resolve({})
    }

    saveSync() {/* no-op */}
  }

  return {Netrc}
})

import {
  clearTokens, getNetrc, getStoredLogin, getStoredToken, saveToken,
} from './netrc-utils.js'

const API_HOST = 'api.heroku.com'
const GIT_HOST = 'git.heroku.com'

describe('Netrc utilities', () => {
  beforeEach(() => {
    // Reset the in-memory machines on the singleton between tests.
    const netrc = getNetrc()
    for (const host of Object.keys(netrc.machines)) {
      delete netrc.machines[host]
    }
  })

  describe('getNetrc', () => {
    it('returns the same instance on subsequent calls', () => {
      expect(getNetrc()).toBe(getNetrc())
    })
  })

  describe('saveToken', () => {
    it('writes the entry to both api and git hosts', async () => {
      await saveToken(
        {login: 'test@example.com', password: 'test-token'},
        API_HOST,
        GIT_HOST,
      )

      const netrc = getNetrc()
      expect(netrc.machines[API_HOST]).toMatchObject({
        login: 'test@example.com',
        password: 'test-token',
      })
      expect(netrc.machines[GIT_HOST]).toMatchObject({
        login: 'test@example.com',
        password: 'test-token',
      })
    })
  })

  describe('clearTokens', () => {
    it('removes entries for api and git hosts', async () => {
      await saveToken(
        {login: 'test@example.com', password: 'test-token'},
        API_HOST,
        GIT_HOST,
      )
      await clearTokens(API_HOST, GIT_HOST)

      const netrc = getNetrc()
      expect(netrc.machines[API_HOST]).toBeUndefined()
      expect(netrc.machines[GIT_HOST]).toBeUndefined()
    })
  })

  describe('getStoredToken', () => {
    it('returns the saved token', async () => {
      await saveToken(
        {login: 'test@example.com', password: 'test-token'},
        API_HOST,
        GIT_HOST,
      )

      expect(await getStoredToken(API_HOST)).toBe('test-token')
    })

    it('returns undefined when no entry exists', async () => {
      expect(await getStoredToken(API_HOST)).toBeUndefined()
    })
  })

  describe('getStoredLogin', () => {
    it('returns the saved login', async () => {
      await saveToken(
        {login: 'test@example.com', password: 'test-token'},
        API_HOST,
        GIT_HOST,
      )

      expect(await getStoredLogin(API_HOST)).toBe('test@example.com')
    })

    it('returns undefined when no entry exists', async () => {
      expect(await getStoredLogin(API_HOST)).toBeUndefined()
    })
  })
})
