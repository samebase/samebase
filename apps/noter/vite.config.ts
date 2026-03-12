import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const gitRoot = path.resolve(__dirname, "..", "..");
const require = createRequire(import.meta.url);

function readPackageVersion(packageName: string): string {
  const packageJson: unknown = require(`${packageName}/package.json`);
  if (
    typeof packageJson !== "object" ||
    packageJson === null ||
    !("version" in packageJson) ||
    typeof packageJson.version !== "string"
  ) {
    throw new Error(`Package ${packageName} is missing a string version field`);
  }

  return packageJson.version;
}

function readGitOutput(command: string): string | null {
  try {
    const output = execSync(command, {
      cwd: gitRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

const appCommit =
  process.env.VITE_APP_COMMIT ??
  readGitOutput("git rev-parse HEAD") ??
  "unknown";

const appRepoUrl = "https://github.com/nicu-chiciuc/noter";
const daytonaSdkVersion = readPackageVersion("@daytonaio/sdk");

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_COMMIT__: JSON.stringify(appCommit),
    __APP_REPO_URL__: JSON.stringify(appRepoUrl),
    __DAYTONA_SDK_VERSION__: JSON.stringify(daytonaSdkVersion),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MiB – Monaco bundle is ~5 MB
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: "index.html",
      },
      manifest: {
        name: "noter",
        short_name: "noter",
        description: "Code Editor",
        theme_color: "#000000",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "192x192",
            type: "image/svg+xml",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    logOverride: { "this-is-undefined-in-esm": "silent" },
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // Skip certain warnings
        if (warning.code === "UNUSED_EXTERNAL_IMPORT") return;
        if (warning.code === "CIRCULAR_DEPENDENCY") return;

        // Use default for everything else
        warn(warning);
      },
    },
  },
});
