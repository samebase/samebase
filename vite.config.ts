import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import remotionEslintPlugin from "@remotion/eslint-plugin";
import { defaultClientConditions, type Plugin } from "vite";
import { defineConfig } from "vite-plus";
import type { AppBuildConfig } from "./apps/samebase/src/lib/appBuildConfig";
// The app's dependency, which the root does not install.
import { convexAuth } from "./apps/samebase/node_modules/@samebase/convex-auth-tanstack-start/dist/vite.js";
import { inlineScriptPlugin } from "./apps/samebase/dev/inlineScriptPlugin";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const testAppBuildConfig = {
  appCommit: "test",
  appCommitNumber: null,
  browserConvexProxyPath: null,
} satisfies AppBuildConfig;

/**
The Convex CLI bundles the argon2 WASM module of the Convex Auth password component as a
`WebAssembly.Module`. The Convex tests load the same component source, so Vitest loads the module
the same way.
*/
function wasmModulePlugin(): Plugin {
  return {
    name: "wasm-as-webassembly-module",
    enforce: "pre",
    load(id) {
      if (!id.endsWith(".wasm")) {
        return null;
      }
      const base64 = readFileSync(id).toString("base64");
      return `const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0));
export default new WebAssembly.Module(bytes);`;
    },
  };
}

export default defineConfig({
  run: {
    tasks: {
      "ci:workspace": {
        command: "vp run check:packages",
        cache: false,
        dependsOn: [
          "samebase#check:ci",
          "workspace-layout-v2-solid#typecheck:cached",
          "check:remotion-studio",
          "check:examples",
        ],
      },
      "remotion:check": {
        command: "vp run typecheck:remotion-studio && vp run --cache lint:remotion-studio",
        cache: false,
      },
      "remotion:typecheck": {
        command: "tsgo -p apps/remotion-studio/tsconfig.json --pretty false",
        cache: {
          // The native typechecker does not report every filesystem input to Vite Task.
          input: [
            { auto: true },
            "apps/remotion-studio/**/*.{ts,tsx,json}",
            "packages/**/*.{ts,tsx,json}",
            "scripts/**/*.ts",
            "tsconfig*.json",
            "package.json",
            "pnpm-lock.yaml",
            "pnpm-workspace.yaml",
            "!**/node_modules/**",
            "!**/dist/**",
          ],
          output: [],
        },
      },
    },
  },
  define: {
    __APP_BUILD_CONFIG__: JSON.stringify(testAppBuildConfig),
  },
  fmt: {
    ignorePatterns: [
      "**/.agents/**",
      "**/convex/_generated/**",
      "packages/git-editor/src/component/_generated/**",
      "packages/identity-broker/src/component/_generated/**",
      "packages/alchemy-convex/src/store/*/_generated/**",
      "packages/alchemy-convex/test/fixtures/**",
      "apps/samebase/AGENTS.md",
      "apps/samebase/CLAUDE.md",
      "apps/samebase/src/routeTree.gen.ts",
      "apps/sidebars-example/src/routeTree.gen.ts",
      "templates/base/**",
      "templates/base-alchemy/**",
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
    ignorePatterns: [
      "**/dist",
      "**/convex/_generated",
      "packages/git-editor/src/component/_generated/**",
      "packages/identity-broker/src/component/_generated/**",
      "packages/alchemy-convex/src/store/*/_generated/**",
      "packages/alchemy-convex/test/fixtures/**",
      // Hey API owns these SDK and validator files.
      "apps/samebase/convex/cloudflareApi/generated/**",
      "apps/samebase/convex/convexManagementApi/generated/**",
      "**/src/components/ui",
      "apps/sidebars-example/src/routeTree.gen.ts",
      // This fixture is linted after its packed Sidebars dependency is installed.
      "packages/sidebars/fixtures/packed-consumer/**",
      "templates/base/**",
      "templates/base-alchemy/**",
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
      {
        name: "@remotion",
        specifier: "@remotion/eslint-plugin",
      },
      {
        name: "samebase",
        specifier: "./scripts/lint/eslint-plugin-samebase.ts",
      },
    ],
    rules: {
      complexity: ["warn", { max: 20, variant: "modified" }],
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
          "**/*.config.ts",
          "packages/onboarding-video-tools/**/*.ts",
          "apps/samebase/public/**/*.ts",
          "apps/samebase/convex/**/*.{ts,tsx}",
          "apps/samebase/scripts/**/*.ts",
        ],
        env: {
          node: true,
        },
      },
      {
        files: ["apps/samebase/e2e/**/*.ts", "apps/samebase/playwright.config.ts"],
        rules: {
          "@typescript-eslint/no-unnecessary-condition": "off",
        },
      },
      {
        files: ["packages/sidebars/src/**/*.{ts,tsx}"],
        rules: {
          "react-refresh/only-export-components": "off",
        },
      },
      {
        files: ["apps/remotion-studio/src/**/*.{ts,tsx}"],
        rules: {
          ...remotionEslintPlugin.configs.recommended.rules,
          "no-console": "off",
          "@typescript-eslint/no-empty-object-type": "off",
          "react/jsx-key": "off",
          "react/jsx-no-target-blank": "off",
          "react/jsx-no-useless-fragment": "off",
          "react/no-array-index-key": "off",
        },
      },
      {
        files: ["packages/identity-broker/src/component/**/*.ts"],
        rules: {
          "@convex-dev/no-old-registered-function-syntax": "error",
          "@convex-dev/require-args-validator": "error",
          "@convex-dev/explicit-table-ids": "error",
          "@convex-dev/no-filter-in-query": "warn",
          "@convex-dev/no-top-of-hour-crons": "warn",
          "@convex-dev/no-schema-import-cycle": "error",
          "@convex-dev/no-duplicate-indexes": "error",
          "@convex-dev/no-process-env": "error",
        },
      },
      {
        files: ["apps/samebase/convex/**/*.ts"],
        rules: {
          "@convex-dev/import-wrong-runtime": "off",
          "@convex-dev/no-old-registered-function-syntax": "error",
          "@convex-dev/require-args-validator": ["error", { ignoreUnusedArguments: true }],
          "samebase/no-forwarded-convex-function-args": "error",
        },
      },
    ],
  },
  resolve: {
    conditions: ["samebase-source", ...defaultClientConditions],
    alias: {
      "@": path.resolve(rootDir, "./apps/samebase/src"),
      "react/jsx-dev-runtime": path.resolve(
        rootDir,
        "./apps/samebase/node_modules/react/jsx-dev-runtime.js",
      ),
    },
  },
  staged: {
    "*.{cjs,css,cts,html,js,json,jsonc,jsonl,jsx,md,mjs,mts,ts,toml,tsx,yaml,yml}":
      "vp check --fix",
  },
  test: {
    // The edge-runtime project clears `process`; Vitest fork teardown then
    // crashes while restoring `process.exit`. Threads avoid that teardown path.
    pool: "threads",
    globals: true,
    exclude: ["**/node_modules/**", "dist", "dev-dist"],
    projects: [
      {
        extends: true,
        // `@samebase/convex-auth-tanstack-start` imports `@convex-dev/auth/ssr/nextjs/client`, which
        // only its `convexAuth()` plugin resolves, so Vitest runs that package through Vite.
        // The app's inline head scripts are `?inline-script` imports, which the app compiles at build
        // time; the tests run the same compiled scripts.
        plugins: [convexAuth(), inlineScriptPlugin()],
        test: {
          name: "unit",
          environment: "node",
          // Node 25 exposes a process-global localStorage stub unless Web
          // Storage is disabled. That stub shadows jsdom's complete Storage
          // implementation and makes every browser-storage test fail.
          execArgv: ["--no-experimental-webstorage"],
          include: [
            "scripts/**/*.test.ts",
            "apps/**/*.test.ts",
            "apps/**/*.test.tsx",
            "packages/**/*.test.ts",
            "packages/**/*.test.tsx",
          ],
          setupFiles: ["./apps/samebase/src/test/reactActEnvironment.ts"],
          server: { deps: { inline: ["@samebase/convex-auth-tanstack-start"] } },
          exclude: [
            "**/node_modules/**",
            "dist",
            "dev-dist",
            "apps/samebase/convex/**/*.convex.test.ts",
            "packages/identity-broker/**",
            "packages/alchemy-convex/**",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "alchemy-convex",
          environment: "node",
          include: ["packages/alchemy-convex/test/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
          // The State tests call process.chdir, which a worker thread cannot.
          pool: "forks",
          // alchemy/Test/Vitest and @effect/vitest resolve a vitest of their own peers, so they run
          // through Vite here, with every import of vitest on the runner.
          alias: { vitest: "vite-plus/test" },
          server: { deps: { inline: true } },
        },
      },
      {
        extends: true,
        test: {
          name: "identity-broker",
          environment: "edge-runtime",
          include: ["packages/identity-broker/src/**/*.test.ts"],
          exclude: ["**/node_modules/**", "dist", "dev-dist"],
        },
      },
      {
        extends: true,
        plugins: [wasmModulePlugin()],
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["apps/samebase/convex/**/*.convex.test.ts"],
          // Vitest runs external packages in Node, which cannot import a .wasm file. Inlining this
          // one sends its WASM import through the plugin above.
          server: { deps: { inline: ["argon2id-wasm"] } },
          exclude: ["**/node_modules/**", "dist", "dev-dist"],
        },
      },
    ],
  },
});
