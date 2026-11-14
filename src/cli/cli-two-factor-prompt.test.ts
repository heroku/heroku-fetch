import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest'

const HUX = '@heroku/heroku-cli-util/hux'

async function loadModule() {
  return import('./cli-two-factor-prompt.js')
}

describe('CLI Two-Factor Prompt', () => {
  const prompt = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    prompt.mockReset()
    vi.doMock(HUX, () => ({prompt}))
  })

  afterEach(() => {
    vi.doUnmock(HUX)
  })

  describe('cliTwoFactorPrompt', () => {
    it('prompts with masked input and the default message', async () => {
      prompt.mockResolvedValue('123456')
      const {cliTwoFactorPrompt} = await loadModule()

      await expect(cliTwoFactorPrompt()).resolves.toBe('123456')
      expect(prompt).toHaveBeenCalledWith('Enter your 2FA code', {type: 'password'})
    })

    it('propagates errors from the prompt unchanged', async () => {
      const failure = new Error('Cannot find module in the prompt itself')
      prompt.mockRejectedValue(failure)
      const {cliTwoFactorPrompt} = await loadModule()

      await expect(cliTwoFactorPrompt()).rejects.toBe(failure)
    })
  })

  describe('createCliTwoFactorPrompt', () => {
    it('prompts with a custom message', async () => {
      prompt.mockResolvedValue('654321')
      const {createCliTwoFactorPrompt} = await loadModule()

      await expect(createCliTwoFactorPrompt({message: 'Heroku 2FA code'})()).resolves.toBe('654321')
      expect(prompt).toHaveBeenCalledWith('Heroku 2FA code', {type: 'password'})
    })

    it('falls back to the default message', async () => {
      prompt.mockResolvedValue('000000')
      const {createCliTwoFactorPrompt} = await loadModule()

      await createCliTwoFactorPrompt()()
      expect(prompt).toHaveBeenCalledWith('Enter your 2FA code', {type: 'password'})
    })
  })

  describe('when @heroku/heroku-cli-util is not installed', () => {
    beforeEach(() => {
      // Vitest wraps errors thrown from a mock factory (dropping `code`), so
      // raise Node's missing-package error from the export accessor instead;
      // it's read inside the same guarded import.
      vi.doMock(HUX, () => ({
        get prompt() {
          throw Object.assign(new Error(`Cannot find package '${HUX}'`), {code: 'ERR_MODULE_NOT_FOUND'})
        },
      }))
    })

    it('loads the module without importing the prompt', async () => {
      const module = await loadModule()
      expect(typeof module.cliTwoFactorPrompt).toBe('function')
    })

    it('cliTwoFactorPrompt throws an install hint', async () => {
      const {cliTwoFactorPrompt} = await loadModule()
      await expect(cliTwoFactorPrompt()).rejects.toThrow('cliTwoFactorPrompt requires @heroku/heroku-cli-util to be installed')
    })

    it('createCliTwoFactorPrompt throws an install hint', async () => {
      const {createCliTwoFactorPrompt} = await loadModule()
      await expect(createCliTwoFactorPrompt()()).rejects.toThrow('createCliTwoFactorPrompt requires @heroku/heroku-cli-util to be installed')
    })
  })
})
