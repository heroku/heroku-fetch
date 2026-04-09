import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { HerokuApiClient, HerokuApiError } from '@heroku/api-client';

export default class HerokuAppsComponent extends Component {
  @tracked apps = [];
  @tracked loading = false;
  @tracked error = null;
  @tracked apiToken = '';

  constructor(owner, args) {
    super(owner, args);
    // Load token from localStorage if available
    if (typeof localStorage !== 'undefined') {
      this.apiToken = localStorage.getItem('heroku_api_token') || '';
    }
  }

  get isTokenEmpty() {
    return !this.apiToken;
  }

  @action
  updateToken(event) {
    this.apiToken = event.target.value;
  }

  @action
  async fetchApps() {
    if (!this.apiToken) {
      this.error = 'Please enter your Heroku API token';
      return;
    }

    this.loading = true;
    this.error = null;

    try {
      // Create API client with the provided token
      const client = new HerokuApiClient({
        service: 'platform',
        token: this.apiToken,
      });

      // Fetch apps from Heroku Platform API
      const response = await client.get('/apps');
      this.apps = await response.json();

      // Save token to localStorage for convenience
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('heroku_api_token', this.apiToken);
      }
    } catch (error) {
      if (error instanceof HerokuApiError) {
        this.error = `API Error: ${error.message} (Status: ${error.statusCode})`;
      } else {
        this.error = `Error: ${error.message}`;
      }
      this.apps = [];
    } finally {
      this.loading = false;
    }
  }

  @action
  clearToken() {
    this.apiToken = '';
    this.apps = [];
    this.error = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('heroku_api_token');
    }
  }
}
