import EmberRouter from '@ember/routing/router';
import config from 'heroku-fetch-ember-example/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  // Define your routes here
});
