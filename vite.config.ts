import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import type { AppBuildConfig } from "./apps/samebase/src/lib/appBuildConfig";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const testAppBuildConfig = {
  appCommit: "test",
  appCommitNumber: null,
  appRepoUrl: "https://github.com/samebase/samebase",
  browserConvexProxyPath: null,
  landingPageSlogan: "test landing slogan",
} satisfies AppBuildConfig;

export default defineConfig({
  define: {
    __APP_BUILD_CONFIG__: JSON.stringify(testAppBuildConfig),
  },
  fmt: {
    ignorePatterns: [
      "**/.agents/**",
      "**/convex/_generated/**",
      "apps/samebase/AGENTS.md",
      "apps/samebase/CLAUDE.md",
      "apps/samebase/src/routeTree.gen.ts",
    ],
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
    ignorePatterns: ["**/dist", "**/convex/_generated", "**/src/components/ui"],
    jsPlugins: [
      {
        name: "@convex-dev",
        specifier: "@convex-dev/eslint-plugin",
      },
      {
        name: "react-refresh",
        specifier: "eslint-plugin-react-refresh",
      },
      {
        name: "samebase",
        specifier: "./scripts/lint/eslint-plugin-samebase.js",
      },
    ],
    rules: {
      "samebase/no-hand-written-type-predicate": "error",
      "samebase/no-ios-small-text-entry-control": "error",
      "samebase/no-raw-public-convex-function-builders": "error",
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
        // Generated output cannot carry in-file disables; its predicates are
        // derived from a named source of truth, not hand-written.
        files: ["**/*.generated.ts", "**/*.generated.d.ts"],
        rules: {
          "samebase/no-hand-written-type-predicate": "off",
        },
      },
      {
        files: [
          "scripts/**/*.ts",
          "runtime/**/*.ts",
          "**/*.config.js",
          "**/*.config.cjs",
          "**/*.config.ts",
          "**/*.cjs",
          "packages/onboarding-video-tools/**/*.ts",
          "apps/samebase/public/**/*.ts",
          "apps/samebase/convex/**/*.{ts,tsx}",
          "apps/samebase-starter-template/convex/**/*.{ts,tsx}",
          "apps/samebase/scripts/**/*.ts",
        ],
        env: {
          node: true,
        },
      },
      {
        files: [
          "apps/samebase/e2e/**/*.ts",
          "apps/samebase/playwright.config.ts",
          "apps/samebase-starter-template/convex/**/*.ts",
        ],
        rules: {
          "@typescript-eslint/no-unnecessary-condition": "off",
        },
      },
      {
        files: ["apps/samebase/src/components/workspace-layout-v2/**/*.{ts,tsx}"],
        rules: {
          "react-refresh/only-export-components": "off",
        },
      },
      {
        files: ["apps/samebase/convex/**/*.ts", "apps/samebase-starter-template/convex/**/*.ts"],
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
      "@": path.resolve(rootDir, "./apps/samebase/src"),
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
          setupFiles: ["./apps/samebase/src/test/reactActEnvironment.ts"],
          exclude: [
            "**/node_modules/**",
            "dist",
            "dev-dist",
            "apps/samebase/convex/**/*.convex.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["apps/samebase/convex/**/*.convex.test.ts"],
          exclude: ["**/node_modules/**", "dist", "dev-dist"],
        },
      },
    ],
  },
});
