import {expect} from 'chai'
import {describe, it} from 'mocha'

import {HerokuApiClient} from './index.js'
import {SERVICE_CONFIGS} from './service-configurations.js'

describe('HerokuApiClient', () => {
  describe('constructor', () => {
    it('should create a client with default options', () => {
      const client = new HerokuApiClient()
      expect(client).to.be.instanceOf(HerokuApiClient)
    })

    it('should create a client for platform service', () => {
      const client = new HerokuApiClient({service: 'platform'})
      expect(client).to.be.instanceOf(HerokuApiClient)
    })

    it('should create a client for data service', () => {
      const client = new HerokuApiClient({service: 'data'})
      expect(client).to.be.instanceOf(HerokuApiClient)
    })

    it('should create a client with static token', () => {
      const client = new HerokuApiClient({
        service: 'platform',
        token: 'test-token',
      })
      expect(client).to.be.instanceOf(HerokuApiClient)
    })

    it('should create a client with token function', () => {
      const client = new HerokuApiClient({
        service: 'platform',
        token: async () => 'test-token',
      })
      expect(client).to.be.instanceOf(HerokuApiClient)
    })

    it('should throw error when custom service without baseUrl', () => {
      expect(() => {
        new HerokuApiClient({service: 'custom'})
      }).to.throw('baseUrl is required when service is "custom"')
    })

    it('should create a client with custom baseUrl', () => {
      const client = new HerokuApiClient({
        baseUrl: 'https://custom.example.com',
        service: 'custom',
      })
      expect(client).to.be.instanceOf(HerokuApiClient)
    })

    it('should support region for data service', () => {
      const client = new HerokuApiClient({
        region: 'eu',
        service: 'data',
      })
      expect(client).to.be.instanceOf(HerokuApiClient)
    })

    it('should support custom headers', () => {
      const client = new HerokuApiClient({
        headers: {
          'X-Custom-Header': 'test',
        },
        service: 'platform',
      })
      expect(client).to.be.instanceOf(HerokuApiClient)
    })
  })

  describe('setOption', () => {
    it('should update token', () => {
      const client = new HerokuApiClient()
      client.setOption('token', 'new-token')
      // Token is updated internally
    })

    it('should update timeout', () => {
      const client = new HerokuApiClient()
      client.setOption('timeout', 5000)
      // Timeout is updated internally
    })
  })

  describe('HTTP methods', () => {
    it('should have get method', () => {
      const client = new HerokuApiClient({token: 'test'})
      expect(client.get).to.be.a('function')
    })

    it('should have post method', () => {
      const client = new HerokuApiClient({token: 'test'})
      expect(client.post).to.be.a('function')
    })

    it('should have put method', () => {
      const client = new HerokuApiClient({token: 'test'})
      expect(client.put).to.be.a('function')
    })

    it('should have patch method', () => {
      const client = new HerokuApiClient({token: 'test'})
      expect(client.patch).to.be.a('function')
    })

    it('should have delete method', () => {
      const client = new HerokuApiClient({token: 'test'})
      expect(client.delete).to.be.a('function')
    })

    it('should have stream method', () => {
      const client = new HerokuApiClient({token: 'test'})
      expect(client.stream).to.be.a('function')
    })
  })
})

describe('SERVICE_CONFIGS', () => {
  it('should have platform config', () => {
    expect(SERVICE_CONFIGS.platform).to.deep.equal({
      baseUrl: 'https://api.heroku.com',
    })
  })

  it('should have data config', () => {
    expect(SERVICE_CONFIGS.data).to.deep.equal({
      baseUrl: 'https://postgres-api.heroku.com',
    })
  })

  it('should have particleboard config', () => {
    expect(SERVICE_CONFIGS.particleboard).to.deep.equal({
      baseUrl: 'https://particleboard.heroku.com',
    })
  })

  it('should have custom config', () => {
    expect(SERVICE_CONFIGS.custom).to.deep.equal({
      baseUrl: '',
    })
  })
})
