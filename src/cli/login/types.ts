/**
 * Shared types and interfaces for login functionality
 */

export interface NetrcEntry {
  login: string;
  password: string;
}

export interface OAuthAuthorization {
  access_token?: {
    token: string;
  };
  id: string;
  user?: {
    email: string;
  };
}

export interface Account {
  email: string;
  id: string;
}

export interface LoginOptions {
  /** Browser to use for browser-based login */
  browser?: string;
  /** Token expiration time in seconds */
  expiresIn?: number;
  /** Login method to use */
  method?: 'browser' | 'interactive' | 'sso';
}

export interface LoginConfig {
  apiHost: string;
  apiUrl: string;
  httpGitHost: string;
  loginHost: string;
}

/** Helper to create HTTP headers with bearer token */
export const headers = (token: string) => ({
  Accept: 'application/vnd.heroku+json; version=3',
  Authorization: `Bearer ${token}`,
})

/** Constants */
export const THIRTY_DAYS = 60 * 60 * 24 * 30
export const LOGIN_TIMEOUT = 1000 * 60 * 10 // 10 minutes
