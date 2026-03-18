module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "plugin:@convex-dev/recommended",
  ],
  ignorePatterns: [
    "dist",
    ".eslintrc.cjs",
    "convex/_generated",
    "postcss.config.js",
    "tailwind.config.js",
    "src/components/ui",
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": [
      "error",
      { allowConstantExport: true },
    ],
    "react-hooks/exhaustive-deps": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/ban-ts-comment": [
      "error",
      {
        "ts-expect-error": false,
        "ts-ignore": true,
        "ts-nocheck": true,
      },
    ],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/consistent-type-assertions": [
      "warn",
      { assertionStyle: "never" },
    ],
  },
  overrides: [
    {
      files: ["vite.config.ts", "convex/**/*.ts"],
      env: {
        node: true,
      },
    },
  ],
};
