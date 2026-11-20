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

  it('does not import @heroku/heroku-cli-util until a prompt runs', async () => {
    const factory = vi.fn(() => ({prompt}))
    vi.doMock(HUX, factory)

    const {cliTwoFactorPrompt} = await loadModule()
    expect(factory).not.toHaveBeenCalled()

    prompt.mockResolvedValue('123456')
    await cliTwoFactorPrompt()
    expect(factory).toHaveBeenCalledOnce()
  })

  // Vitest wraps errors thrown from a mock factory (dropping `code`), so these
  // raise Node's error from the export accessor instead; it's read inside the
  // same guarded import.
  const failImport = (message: string) => {
    const error = Object.assign(new Error(message), {code: 'ERR_MODULE_NOT_FOUND'})
    vi.doMock(HUX, () => ({
      get prompt() {
        throw error
      },
    }))
    return error
  }

  describe('when @heroku/heroku-cli-util is not installed', () => {
    let notFound: Error

    beforeEach(() => {
      notFound = failImport("Cannot find package '@heroku/heroku-cli-util' imported from /app/dist/cli/cli-two-factor-prompt.js")
    })

    it('cliTwoFactorPrompt throws an install hint, caused by the import error', async () => {
      const {cliTwoFactorPrompt} = await loadModule()
      const error = await cliTwoFactorPrompt().catch((error_: unknown) => error_)
      expect(error).toMatchObject({
        cause: notFound,
        message: expect.stringContaining('cliTwoFactorPrompt requires @heroku/heroku-cli-util to be installed'),
      })
    })

    it('createCliTwoFactorPrompt throws an install hint', async () => {
      const {createCliTwoFactorPrompt} = await loadModule()
      await expect(createCliTwoFactorPrompt()()).rejects.toThrow('createCliTwoFactorPrompt requires @heroku/heroku-cli-util to be installed')
    })
  })

  it('propagates a dependency missing from cli-util\'s own install unchanged', async () => {
    const notFound = failImport("Cannot find package 'chalk' imported from /app/node_modules/@heroku/heroku-cli-util/dist/ux/prompt.js")
    const {cliTwoFactorPrompt} = await loadModule()

    await expect(cliTwoFactorPrompt()).rejects.toBe(notFound)
  })
})
