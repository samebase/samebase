import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: { "github-state": "src/github-state/GitHubState.ts" },
    outDir: "lib",
    // "type": "module" makes the ESM output `github-state.js`, the file that `publishConfig` names.
    fixedExtension: false,
    sourcemap: true,
    dts: { sourcemap: true },
  },
});
