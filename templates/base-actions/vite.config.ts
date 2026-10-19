import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [".agents/**", "convex/_generated/**", "src/routeTree.gen.ts"],
  },
  lint: {
    ignorePatterns: [".agents/**", "convex/_generated/**", "src/routeTree.gen.ts"],
    options: { typeAware: true },
  },
  plugins: [
    tailwindcss(),
    // Vitest loads this config for the script tests, and the Cloudflare plugin rejects its setup.
    !process.env["VITEST"] && cloudflare({ viteEnvironment: { name: "ssr" } }),
    // Prerenders /about only, into a file of the build. `prerender: { enabled: true }` would also
    // prerender every static route, and crawling would follow /about's links.
    tanstackStart({
      pages: [{ path: "/about", prerender: { enabled: true, crawlLinks: false } }],
    }),
    react(),
  ],
  staged: {
    "*": "vp check --fix",
  },
});
