import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
