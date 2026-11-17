import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: { GitHubState: "src/GitHubState.ts" },
    outDir: "lib",
    // "type": "module" makes the ESM output `GitHubState.js`, the file that `publishConfig` names.
    fixedExtension: false,
    sourcemap: true,
    dts: { sourcemap: true },
  },
});
