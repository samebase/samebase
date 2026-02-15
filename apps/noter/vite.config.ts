import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { execSync } from "node:child_process";

const gitRoot = path.resolve(__dirname, "..", "..");

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

function toGithubRepoUrl(remote: string): string | null {
  const trimmed = remote.trim();
  const patterns = [
    /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/,
    /^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
    /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
    /^git:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return `https://github.com/${match[1]}/${match[2]}`;
    }
  }

  return null;
}

const appCommit =
  process.env.VITE_APP_COMMIT ??
  readGitOutput("git rev-parse HEAD") ??
  "unknown";

const appRepoUrl =
  process.env.VITE_APP_REPO_URL ??
  (() => {
    const remote = readGitOutput("git config --get remote.origin.url");
    if (!remote) return "";
    return toGithubRepoUrl(remote) ?? "";
  })();

function readBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

const devHost = process.env.NOTER_DEV_HOST?.trim() || undefined;
const devPortRaw = process.env.NOTER_DEV_PORT?.trim();
const devPort = devPortRaw ? Number(devPortRaw) : undefined;
const devStrictPort = readBooleanEnv(process.env.NOTER_DEV_STRICT_PORT);

const serverConfig = (() => {
  const server: { host?: string; port?: number; strictPort?: boolean } = {};
  if (devHost) {
    server.host = devHost;
  }
  if (devPort !== undefined && !Number.isNaN(devPort)) {
    server.port = devPort;
  }
  if (devStrictPort !== undefined) {
    server.strictPort = devStrictPort;
  }
  return Object.keys(server).length > 0 ? server : undefined;
})();

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_COMMIT__: JSON.stringify(appCommit),
    __APP_REPO_URL__: JSON.stringify(appRepoUrl),
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
  server: serverConfig,
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
