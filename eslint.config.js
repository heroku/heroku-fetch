import herokuEslintConfig from '@heroku-cli/test-utils/eslint-config';

export default [
  // Spread the Heroku CLI ESLint config
  ...herokuEslintConfig,

  // Project-specific overrides
  {
    files: ['src/**/*.ts', 'examples/**/*.ts'],
    rules: {
      // Allow explicit any for now (already at warn level from heroku config)
      '@typescript-eslint/no-explicit-any': 'warn',

      // Allow snake_case for API field names
      'camelcase': ['error', {
        properties: 'never',
        ignoreDestructuring: true,
      }],

      // Prefer no semicolons unless necessary
      '@stylistic/semi': ['warn', 'never'],
    },
  },

  // Test file specific rules
  {
    files: ['src/**/*.test.ts', 'test/**/*.ts'],
    rules: {
      // Tests may use new for side effects
      'no-new': 'off',

      // Vitest doesn't restrict top-level suites the way mocha does
      'mocha/max-top-level-suites': 'off',
    },
  },

  // Additional ignore patterns specific to this project
  {
    ignores: [
      'examples/ember-app/**/*',
      'node_modules/**/*',
    ],
  },
];
