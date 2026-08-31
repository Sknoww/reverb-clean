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
    ...reactHooks,
    rules: Object.fromEntries(Object.keys(reactHooks.rules).map((rule) => [rule, 'warn']))
  },
  {
    settings: { react: { version: 'detect' } },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',

      '@typescript-eslint/no-explicit-any': 'warn',

      'react/prop-types': 'off',

      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  },
  eslintConfigPrettier
)
