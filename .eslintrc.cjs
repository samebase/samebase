module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:react-hooks/recommended',
    'plugin:@convex-dev/recommended',
  ],
  ignorePatterns: [
    '**/dist',
    '**/.eslintrc.cjs',
    '**/convex/_generated',
    '**/postcss.config.js',
    '**/tailwind.config.js',
    '**/vite.config.ts',
    // shadcn components by default violate some rules
    '**/src/components/ui',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    EXPERIMENTAL_useProjectService: true,
  },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'error',
      { allowConstantExport: true },
    ],
    'react-hooks/exhaustive-deps': 'error',

    // All of these overrides ease getting into
    // TypeScript, and can be removed for stricter
    // linting down the line.

    // Ignore variables starting with `_`
    '@typescript-eslint/no-unused-vars': [
      'error',
      { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
    ],

    // Allow escaping the compiler
    '@typescript-eslint/ban-ts-comment': [
      'error',
      {
        'ts-expect-error': false,
        'ts-ignore': true,
        'ts-nocheck': true,
      },
    ],

    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-argument': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',

    '@typescript-eslint/no-unnecessary-condition': 'error',

    // Allow async functions without await
    // for consistency (esp. Convex `handler`s)
    '@typescript-eslint/require-await': 'off',
  },
  overrides: [
    {
      files: [
        '**/*.config.js',
        '**/*.config.cjs',
        '**/*.config.mjs',
        '**/*.config.ts',
        '**/*.cjs',
        'scripts/**/*.{js,ts}',
        'apps/noter/convex/**/*.{ts,tsx}',
        'apps/noter-starter-template/convex/**/*.{ts,tsx}',
        'apps/noter/*.js',
      ],
      env: {
        node: true,
      },
    },
    {
      // Temporary local relaxations while migrating legacy code.
      files: ['apps/noter/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
      },
    },
    {
      // Keep starter-template no-unsafe relaxations until that cleanup pass.
      files: ['apps/noter-starter-template/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
      },
    },
    {
      // These files are outside typed TS project includes in this repo setup.
      files: [
        'apps/noter/e2e/**/*.ts',
        'apps/noter/playwright.config.ts',
        'apps/noter-starter-template/convex/**/*.ts',
      ],
      rules: {
        '@typescript-eslint/no-unnecessary-condition': 'off',
      },
    },
  ],
}
