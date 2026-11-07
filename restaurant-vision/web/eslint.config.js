// ESLint flat config for the whole web workspace (each package runs `eslint .` from its folder).
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// RTL support: only logical Tailwind utilities (ms-/me-/ps-/pe-/start-/end-/text-start ...).
// Physical ones (ml-, pr-, left-, text-right, rounded-l, border-r ...) break Hebrew layouts.
const PHYSICAL_TW =
  String.raw`(^|\s|:)-?(ml|mr|pl|pr|left|right|scroll-ml|scroll-mr|scroll-pl|scroll-pr|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|border-l|border-r|text-left|text-right|float-left|float-right|clear-left|clear-right)(-|\s|$)`;
const physicalMessage =
  'Use logical Tailwind utilities (ms-/me-/ps-/pe-/start-/end-/text-start/rounded-s ...) so layouts mirror in RTL.';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      'packages/shared/src/contracts/types.ts',
      'apps/edge-ui/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
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
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=/${PHYSICAL_TW}/]`, message: physicalMessage },
        { selector: `TemplateElement[value.raw=/${PHYSICAL_TW}/]`, message: physicalMessage },
      ],
    },
  },
  {
    // Tests, configs and node scripts.
    files: [
      '**/*.test.{ts,tsx}',
      '**/test/**/*.{ts,tsx}',
      '**/*.config.{js,ts,cjs,mjs}',
      '**/scripts/**/*.{js,mjs}',
      '**/src/vite/**/*.ts',
      'tailwind-preset.js',
      '**/tailwind-preset.js',
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);
