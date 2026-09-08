import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defaultClientConditions } from "vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: fileURLToPath(new URL("../../.tmp/pane-study-vite", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    conditions: ["samebase-source", ...defaultClientConditions],
  },
  server: {
    host: "127.0.0.1",
    port: 5197,
    strictPort: true,
    allowedHosts: [".trycloudflare.com"],
  },
});
