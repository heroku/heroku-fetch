import {describe, expect, it} from 'vitest'

import {HerokuApiClient} from '../client/index.js'
import {Login} from './cli-login.js'

describe('CLI Login (re-export)', () => {
  it('should export Login class', () => {
    expect(typeof Login).toBe('function')
  })

  it('should be able to instantiate Login', () => {
    const client = new HerokuApiClient({
      service: 'platform',
      token: 'test-token',
    })
    const login = new Login(client)
    expect(login).toBeInstanceOf(Login)
  })
})
