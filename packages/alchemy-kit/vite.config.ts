import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      "github-state": "src/github-state/GitHubState.ts",
      "run-record": "src/run-record/RunRecord.ts",
      ui: "src/ui/ResourceTypeUI.ts",
      stack: "src/stack/StackDiagram.ts",
      "stack-comment": "src/stack-comment/StackComment.ts",
      cli: "src/cli.ts",
    },
    outDir: "lib",
    // "type": "module" makes the ESM output `github-state.js`, the file that `publishConfig` names.
    fixedExtension: false,
    sourcemap: true,
    dts: { sourcemap: true },
  },
});
