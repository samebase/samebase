import { defineConfig } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  run: {
    tasks: {
      "typecheck:cached": {
        command: "tsc -b --pretty false",
        cache: { input: [{ auto: true }, "!node_modules/.tmp/**"] },
      },
    },
  },
  server: {
    port: 43130,
    strictPort: false,
  },
  preview: {
    port: 43131,
    strictPort: false,
  },
  plugins: [tailwindcss(), solid()],
  resolve: {
    alias: {
      "@": path.resolve(currentDir, "./src"),
    },
  },
});
