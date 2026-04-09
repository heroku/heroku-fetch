import {expect} from 'chai'
import {beforeEach, describe, it} from 'mocha'

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
      expect(login).to.be.instanceOf(Login)
    })

    it('should accept a HerokuApiClient', () => {
      const login = new Login(client)
      expect(login).to.exist
    })
  })

  describe('methods', () => {
    let login: Login

    beforeEach(() => {
      login = new Login(client)
    })

    it('should have a login method', () => {
      expect(login).to.have.property('login')
      expect(login.login).to.be.a('function')
    })

    it('should have a logout method', () => {
      expect(login).to.have.property('logout')
      expect(login.logout).to.be.a('function')
    })
  })

  describe('login', () => {
    it('should throw error when HEROKU_API_KEY is set', async () => {
      const login = new Login(client)
      const oldValue = process.env.HEROKU_API_KEY

      try {
        process.env.HEROKU_API_KEY = 'test-key'
        await login.login()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Cannot log in with HEROKU_API_KEY set')
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

      try {
        await login.login({expiresIn: thirtyOneDays})
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Cannot set an expiration longer than thirty days')
      }
    })
  })
})
