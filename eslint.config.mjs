import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'

const reactHooks = eslintPluginReactHooks.configs.flat.recommended

export default tseslint.config(
  { ignores: ['**/node_modules', '**/dist', '**/out', '**/release', '**/*.tsbuildinfo'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    // react-hooks ships every rule at "error".
    ...reactHooks,
    rules: Object.fromEntries(Object.keys(reactHooks.rules).map((rule) => [rule, 'warn']))
  },
  {
    settings: { react: { version: 'detect' } },
    rules: {
      // Style, not safety — 175 annotations across 49 files catch no bugs.
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Real debt, kept visible rather than dropped. Mostly the main-process
      // managers; see the roadmap's area 20 for the per-file counts.
      '@typescript-eslint/no-explicit-any': 'warn',
      // TypeScript already checks props, so this only fires false positives.
      'react/prop-types': 'off',
      // `catch {}` is the deliberate best-effort-cleanup idiom in configManager.
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    // The tooling configs and the electron-builder hook are CommonJS by design.
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  },
  eslintConfigPrettier
)
