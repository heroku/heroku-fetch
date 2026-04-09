'use strict';

module.exports = function (environment) {
  const ENV = {
    modulePrefix: 'heroku-fetch-ember-example',
    environment,
    rootURL: '/',
    locationType: 'history',
    EmberENV: {
      EXTEND_PROTOTYPES: false,
      FEATURES: {},
    },

    APP: {
      rootElement: '#ember-app',
    },
  };

  if (environment === 'development') {
    // Development settings
  }

  if (environment === 'test') {
    ENV.locationType = 'none';
    ENV.APP.LOG_ACTIVE_GENERATION = false;
    ENV.APP.LOG_VIEW_LOOKUPS = false;
    ENV.APP.rootElement = '#ember-testing';
    ENV.APP.autoboot = false;
  }

  if (environment === 'production') {
    // Production settings
  }

  return ENV;
};
