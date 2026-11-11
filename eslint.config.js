import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default [
  // Generated / tool-output directories (all gitignored). Without these, a
  // local `npm run build-storybook` makes `npm run lint` report dozens of
  // errors from minified bundles, and a Stryker run lints its full repo copy.
  {
    ignores: [
      'dist',
      'dist-ssr',
      'node_modules',
      '.claude',
      'coverage',
      'storybook-static',
      'playwright-report',
      'test-results',
      'reports',
      '.stryker-tmp',
      '.lighthouseci',
      '.worktrees',
    ],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
]
