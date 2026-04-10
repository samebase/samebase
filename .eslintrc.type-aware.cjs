module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  ignorePatterns: [
    "**/dist",
    "**/convex/_generated",
    "**/postcss.config.js",
    "**/tailwind.config.js",
    "**/vite.config.ts",
    "**/src/components/ui",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    EXPERIMENTAL_useProjectService: true,
    tsconfigRootDir: __dirname,
  },
  plugins: ["@typescript-eslint", "react-refresh"],
  rules: {
    // Keep the semantic rules that still depend on ESLint's project service for
    // the app tsconfig until Oxlint type-aware can handle the repo's alias
    // setup.
    "react-refresh/only-export-components": [
      "error",
      {
        allowConstantExport: true,
      },
    ],
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/no-base-to-string": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-implied-eval": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/no-unnecessary-condition": "error",
    "@typescript-eslint/no-unnecessary-type-assertion": "error",
    "@typescript-eslint/no-unsafe-enum-comparison": "error",
    "@typescript-eslint/restrict-plus-operands": "error",
    "@typescript-eslint/restrict-template-expressions": "error",
    "@typescript-eslint/unbound-method": "error",
  },
  overrides: [
    {
      files: [
        "**/*.config.js",
        "**/*.config.cjs",
        "**/*.config.mjs",
        "**/*.config.ts",
        "apps/noter/convex/**/*.{ts,tsx}",
      ],
      env: {
        node: true,
      },
    },
    {
      files: ["apps/noter/e2e/**/*.ts", "apps/noter/playwright.config.ts"],
      rules: {
        "@typescript-eslint/no-unnecessary-condition": "off",
      },
    },
  ],
};
