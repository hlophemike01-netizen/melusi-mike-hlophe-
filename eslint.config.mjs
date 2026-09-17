import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Flat ESLint config.
 *
 * The two custom rules are here on purpose:
 *   - `no-explicit-any` is an error, because widening a type to silence the
 *     compiler is how an unchecked value ends up in a database query.
 *   - `no-console` allows only `error` and `warn`. A stray `console.log` in a
 *     safety product is a plausible route for a coordinate or a token to end
 *     up in a log aggregator.
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/sw.js', 'next-env.d.ts', 'coverage/**'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    // Build-time scripts print to the developer's terminal; there is no user
    // data in scope and nothing reaches a log aggregator.
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
