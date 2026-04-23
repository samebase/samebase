import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { readPackageVersion } from "./scripts/readPackageVersion.ts";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const daytonaSdkVersion = readPackageVersion(
  "@daytonaio/sdk",
  new URL("./apps/noter/package.json", import.meta.url),
);

export default defineConfig({
  define: {
    __DAYTONA_SDK_VERSION__: JSON.stringify(daytonaSdkVersion),
  },
  fmt: {
    printWidth: 80,
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
      "**/vite.config.ts",
      "apps/noter/public/noter.ts",
      "**/src/components/ui",
    ],
    jsPlugins: [
      {
        name: "noter-local",
        specifier: "eslint-plugin-noter-local",
      },
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
          "apps/noter-agent-template/scripts/**/*.ts",
          "eslint-rules/**/*.ts",
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
        files: ["apps/noter/src/**/*.{ts,tsx}"],
        rules: {
          "noter-local/use-query-param-helpers": "error",
        },
      },
      {
        files: [
          "apps/noter/src/lib/queryParams.ts",
          "apps/noter/src/lib/landingDevMode.ts",
          "apps/noter/src/**/*.test.ts",
        ],
        rules: {
          "noter-local/use-query-param-helpers": "off",
        },
      },
      {
        files: [
          "apps/noter/convex/**/*.ts",
          "apps/noter-starter-template/convex/**/*.ts",
        ],
        rules: {
          "@convex-dev/import-wrong-runtime": "off",
          "@convex-dev/no-old-registered-function-syntax": "error",
          "@convex-dev/no-missing-args-validator": "off",
          "@convex-dev/no-args-without-validator": "error",
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
    environment: "node",
    include: [
      "scripts/**/*.test.ts",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
    ],
    exclude: ["**/node_modules/**", "dist", "dev-dist"],
  },
});
