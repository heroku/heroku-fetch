/**
 * The package's public type surface, in one place so the Node (`index.ts`) and
 * browser (`browser.ts`) entry points export an identical set and can't drift.
 * Types only — runtime values (the client class, errors, helpers) are exported
 * directly from each entry point, which differ by environment.
 */

export type {
  FetchLike,
  HerokuApiClientOptions,
  HerokuError,
  HerokuErrorResponse,
  HerokuHooks,
  HerokuService,
  RequestOptions,
  ResponseMetadata,
  ServiceConfig,
  TokenProvider,
  TwoFactorOptions,
} from './types.js'
export type {AfterResponseHook, BeforeRequestHook} from 'ky'
