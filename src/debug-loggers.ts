import debug from 'debug'

export const debugRequest = debug('heroku:fetch:request')
export const debugResponse = debug('heroku:fetch:response')
export const debugAuth = debug('heroku:fetch:auth')
export const debugError = debug('heroku:fetch:error')
export const debugCliLogin = debug('heroku:fetch:cli:login')
