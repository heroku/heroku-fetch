import {expect} from 'chai'
import {describe, it} from 'mocha'

import {cliTwoFactorPrompt, createCliTwoFactorPrompt} from './cli-two-factor-prompt.js'

describe('CLI Two-Factor Prompt', () => {
  describe('cliTwoFactorPrompt', () => {
    it('should be a function', () => {
      expect(cliTwoFactorPrompt).to.be.a('function')
    })

    it('should return a promise', () => {
      const result = cliTwoFactorPrompt()
      expect(result).to.be.instanceOf(Promise)
      // Clean up the promise to avoid unhandled rejection
      result.catch(() => {})
    })
  })

  describe('createCliTwoFactorPrompt', () => {
    it('should return a function', () => {
      const promptFunc = createCliTwoFactorPrompt()
      expect(promptFunc).to.be.a('function')
    })

    it('should accept custom message option', () => {
      const promptFunc = createCliTwoFactorPrompt({message: 'Custom message'})
      expect(promptFunc).to.be.a('function')
    })

    it('should work without options', () => {
      const promptFunc = createCliTwoFactorPrompt()
      expect(promptFunc).to.be.a('function')
    })

    it('should return a function that returns a promise', () => {
      const promptFunc = createCliTwoFactorPrompt()
      const result = promptFunc()
      expect(result).to.be.instanceOf(Promise)
      // Clean up the promise to avoid unhandled rejection
      result.catch(() => {})
    })
  })
})
