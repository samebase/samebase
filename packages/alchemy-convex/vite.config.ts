import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/cli.ts"],
    outDir: "lib",
    // "type": "module" makes the ESM output `index.js`, the file that `publishConfig` names.
    fixedExtension: false,
    sourcemap: true,
    dts: { sourcemap: true },
  },
});
