import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vite-plus";

const prerenderPages = [
  {
    path: "/",
    prerender: {
      enabled: true,
      outputPath: "/_home.html",
    },
  },
  {
    path: "/docs",
    prerender: {
      enabled: true,
    },
  },
  {
    path: "/workbench",
    prerender: {
      enabled: true,
    },
  },
];

export default defineConfig({
  environments: {
    ssr: {
      resolve: {
        conditions: ["samebase-source", ...defaultServerConditions],
      },
    },
  },
  fmt: {
    ignorePatterns: ["src/routeTree.gen.ts"],
  },
  lint: {
    ignorePatterns: ["src/components/ui/**", "src/routeTree.gen.ts"],
    options: { typeAware: true },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      pages: prerenderPages,
      prerender: {
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        enabled: true,
      },
      spa: {
        enabled: true,
        maskPath: "/#__sidebars-example-spa-shell",
        prerender: {
          outputPath: "/index.html",
        },
      },
    }),
    react(),
  ],
  preview: {
    host: "127.0.0.1",
    port: 43133,
    strictPort: true,
  },
  server: {
    host: "127.0.0.1",
    port: 43132,
    strictPort: true,
  },
  resolve: {
    conditions: ["samebase-source", ...defaultClientConditions],
    tsconfigPaths: true,
  },
  ssr: {
    noExternal: ["@samebase/sidebars"],
  },
  staged: {
    "*": "vp check --fix",
  },
});
