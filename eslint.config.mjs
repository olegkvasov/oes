import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'tests/.artifacts/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,ts,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      '*.{ts,mjs}',
      'mock/**/*.ts',
      'scripts/**/*.mjs',
      'tests/**/*.mjs',
      'tests/**/*.ts',
      'tests/e2e/**/*.ts',
      'tests/performance/**/*.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Browser callbacks in Playwright are serialized and executed inside the page.
    files: ['tests/e2e/**/*.ts', 'tests/performance/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    },
  },
  // Formatting belongs to Prettier; disable overlapping lint rules.
  prettier,
);
