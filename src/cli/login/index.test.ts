import {
  beforeEach, describe, expect, it,
} from 'vitest'

import {HerokuApiClient} from '../../client/index.js'
import {Login} from './index.js'

describe('Login', () => {
  let client: HerokuApiClient

  beforeEach(() => {
    client = new HerokuApiClient({
      service: 'platform',
      token: 'test-token',
    })
  })

  describe('constructor', () => {
    it('should create a Login instance', () => {
      const login = new Login(client)
      expect(login).toBeInstanceOf(Login)
    })

    it('should accept a HerokuApiClient', () => {
      const login = new Login(client)
      expect(login).toBeDefined()
    })
  })

  describe('methods', () => {
    let login: Login

    beforeEach(() => {
      login = new Login(client)
    })

    it('should have a login method', () => {
      expect(login).toHaveProperty('login')
      expect(typeof login.login).toBe('function')
    })

    it('should have a logout method', () => {
      expect(login).toHaveProperty('logout')
      expect(typeof login.logout).toBe('function')
    })
  })

  describe('login', () => {
    it('should throw error when HEROKU_API_KEY is set', async () => {
      const login = new Login(client)
      const oldValue = process.env.HEROKU_API_KEY

      try {
        process.env.HEROKU_API_KEY = 'test-key'
        await expect(login.login()).rejects.toThrow('Cannot log in with HEROKU_API_KEY set')
      } finally {
        if (oldValue) {
          process.env.HEROKU_API_KEY = oldValue
        } else {
          delete process.env.HEROKU_API_KEY
        }
      }
    })

    it('should throw error when expiresIn exceeds thirty days', async () => {
      const login = new Login(client)
      const thirtyOneDays = 31 * 24 * 60 * 60 // 31 days in seconds

      await expect(login.login({expiresIn: thirtyOneDays})).rejects.toThrow('Cannot set an expiration longer than thirty days')
    })
  })
})
