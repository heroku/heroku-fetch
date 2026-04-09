import {expect} from 'chai'
import {describe, it} from 'mocha'

import {HerokuApiClient} from '../client/index.js'
import {Login} from './cli-login.js'

describe('CLI Login (re-export)', () => {
  it('should export Login class', () => {
    expect(Login).to.be.a('function')
  })

  it('should be able to instantiate Login', () => {
    const client = new HerokuApiClient({
      service: 'platform',
      token: 'test-token',
    })
    const login = new Login(client)
    expect(login).to.be.instanceOf(Login)
  })
})
