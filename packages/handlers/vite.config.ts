import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["dist/**", "node_modules/**"],
    printWidth: 100,
    proseWrap: "always",
  },
  lint: {
    env: {
      builtin: true,
    },
    ignorePatterns: ["dist/**", "node_modules/**"],
    options: {
      typeAware: true,
    },
    plugins: ["eslint", "typescript"],
  },
  pack: {
    clean: true,
    deps: {
      neverBundle: true,
    },
    attw: {
      profile: "esm-only",
    },
    dts: true,
    entry: {
      index: "src/index.ts",
    },
    failOnWarn: true,
    format: "esm",
    platform: "neutral",
    publint: true,
    target: "es2020",
  },
});
