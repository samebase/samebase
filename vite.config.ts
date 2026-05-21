import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  fmt: {
    ignorePatterns: ["**/convex/_generated/**"],
    printWidth: 100,
    proseWrap: "always",
  },
  lint: {
    options: {
      typeAware: true,
    },
    plugins: ["eslint", "typescript", "react"],
    env: {
      builtin: true,
      browser: true,
    },
    ignorePatterns: [
      "**/dist",
      "**/.codespace-agent/**",
      "**/convex/_generated",
      "apps/noter/public/noter.ts",
      "**/src/components/ui",
    ],
    jsPlugins: [
      {
        name: "@convex-dev",
        specifier: "@convex-dev/eslint-plugin",
      },
      {
        name: "react-refresh",
        specifier: "eslint-plugin-react-refresh",
      },
    ],
    rules: {
      "react-refresh/only-export-components": [
        "error",
        {
          allowConstantExport: true,
        },
      ],
      "react/only-export-components": "off",
      "react-hooks/exhaustive-deps": "error",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": false,
          "ts-ignore": true,
          "ts-nocheck": true,
          minimumDescriptionLength: 3,
        },
      ],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-implied-eval": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unsafe-enum-comparison": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "warn",
        {
          assertionStyle: "never",
        },
      ],
      "@typescript-eslint/restrict-plus-operands": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/unbound-method": "error",
      "no-restricted-globals": [
        "warn",
        {
          name: "URLSearchParams",
          message:
            "Prefer typed route search objects or route-specific helpers for app search; native URL/query APIs should stay at explicit protocol boundaries.",
        },
      ],
      "@typescript-eslint/require-await": "off",
      "require-await": "off",
    },
    overrides: [
      {
        files: [
          "scripts/**/*.ts",
          "runtime/**/*.ts",
          "**/*.config.js",
          "**/*.config.cjs",
          "**/*.config.ts",
          "**/*.cjs",
          "packages/sync/**/*.ts",
          "packages/onboarding-video-tools/**/*.ts",
          "apps/noter/public/**/*.ts",
          "apps/noter/convex/**/*.{ts,tsx}",
          "apps/noter-starter-template/convex/**/*.{ts,tsx}",
          "apps/noter/scripts/**/*.ts",
        ],
        env: {
          node: true,
        },
      },
      {
        files: [
          "apps/noter/e2e/**/*.ts",
          "apps/noter/playwright.config.ts",
          "apps/noter-starter-template/convex/**/*.ts",
        ],
        rules: {
          "@typescript-eslint/no-unnecessary-condition": "off",
        },
      },
      {
        files: ["apps/noter/src/components/workspace-layout-v2/**/*.{ts,tsx}"],
        rules: {
          "react-refresh/only-export-components": "off",
        },
      },
      {
        files: ["apps/noter/convex/**/*.ts", "apps/noter-starter-template/convex/**/*.ts"],
        rules: {
          "@convex-dev/import-wrong-runtime": "off",
          "@convex-dev/no-old-registered-function-syntax": "error",
          "@convex-dev/require-args-validator": ["error", { ignoreUnusedArguments: true }],
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./apps/noter/src"),
    },
  },
  staged: {
    "*.{cjs,css,cts,html,js,json,jsonc,jsonl,jsx,md,mjs,mts,ts,toml,tsx,yaml,yml}":
      "vp check --fix",
  },
  test: {
    globals: true,
    exclude: ["**/node_modules/**", "dist", "dev-dist"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: [
            "scripts/**/*.test.ts",
            "apps/**/*.test.ts",
            "apps/**/*.test.tsx",
            "packages/**/*.test.ts",
            "packages/**/*.test.tsx",
          ],
          exclude: [
            "**/node_modules/**",
            "dist",
            "dev-dist",
            "apps/noter/convex/**/*.convex.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["apps/noter/convex/**/*.convex.test.ts"],
          exclude: ["**/node_modules/**", "dist", "dev-dist"],
        },
      },
    ],
  },
});
