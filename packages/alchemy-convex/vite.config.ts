import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      index: "src/index.ts",
      cli: "src/cli.ts",
      sealedSecret: "src/store/sealedSecret.ts",
    },
    outDir: "lib",
    // "type": "module" makes the ESM output `index.js`, the file that `publishConfig` names.
    fixedExtension: false,
    sourcemap: true,
    dts: { sourcemap: true },
  },
});
