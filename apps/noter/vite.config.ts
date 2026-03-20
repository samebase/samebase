import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { readPackageVersion } from "../../scripts/readPackageVersion.js";
import { createStaticLogoSvgMarkup } from "./src/components/logoStaticSvgAsset";
import {
  readEnvFileValue,
  resolveDaytonaConvexProxyTarget,
} from "./daytonaConvexProxy";

const gitRoot = path.resolve(__dirname, "..", "..");
const DAYTONA_CONVEX_PROXY_PATH = "/__noter_daytona_convex";

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
const daytonaSdkVersion = readPackageVersion("@daytonaio/sdk", import.meta.url);
const daytonaLocalEnvPath = path.resolve(__dirname, ".env.local");
const daytonaConvexProxyTarget = resolveDaytonaConvexProxyTarget({
  devOrigin: process.env.DEV_ENV_ORIGIN,
  envProxyTarget: process.env.NOTER_DAYTONA_BROWSER_CONVEX_PROXY_TARGET,
  localEnvConvexUrl: readEnvFileValue(daytonaLocalEnvPath, "VITE_CONVEX_URL"),
});
const daytonaConvexProxyPath = daytonaConvexProxyTarget
  ? DAYTONA_CONVEX_PROXY_PATH
  : null;
const shouldIncludeVisualFixture = process.env.PLAYWRIGHT === "1";
const staticLogoSvgAssetPath = path.resolve(
  __dirname,
  "public/logo-static.svg",
);

function syncStaticLogoSvgAsset() {
  const nextStaticLogoSvgMarkup = createStaticLogoSvgMarkup().trim();
  const currentStaticLogoSvgMarkup = (() => {
    try {
      return readFileSync(staticLogoSvgAssetPath, "utf8").trim();
    } catch {
      return null;
    }
  })();

  if (currentStaticLogoSvgMarkup === nextStaticLogoSvgMarkup) {
    return;
  }

  writeFileSync(staticLogoSvgAssetPath, `${nextStaticLogoSvgMarkup}\n`, "utf8");
}

function syncStaticLogoSvgAssetPlugin() {
  let hasSyncedStaticLogoSvgAsset = false;

  const syncOnce = () => {
    if (hasSyncedStaticLogoSvgAsset) {
      return;
    }

    hasSyncedStaticLogoSvgAsset = true;
    syncStaticLogoSvgAsset();
  };

  return {
    name: "sync-static-logo-svg-asset",
    buildStart() {
      syncOnce();
    },
    configureServer() {
      syncOnce();
    },
  };
}

function stripDaytonaConvexProxyPrefix(requestPath: string): string {
  if (
    requestPath !== DAYTONA_CONVEX_PROXY_PATH &&
    !requestPath.startsWith(`${DAYTONA_CONVEX_PROXY_PATH}/`)
  ) {
    return requestPath;
  }
  const strippedPath = requestPath.slice(DAYTONA_CONVEX_PROXY_PATH.length);
  return strippedPath.length > 0 ? strippedPath : "/";
}

const daytonaConvexProxyServerConfig = daytonaConvexProxyTarget
  ? {
      proxy: {
        [DAYTONA_CONVEX_PROXY_PATH]: {
          target: daytonaConvexProxyTarget,
          changeOrigin: true,
          ws: true,
          rewrite: stripDaytonaConvexProxyPrefix,
        },
      },
    }
  : undefined;

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_COMMIT__: JSON.stringify(appCommit),
    __APP_REPO_URL__: JSON.stringify(appRepoUrl),
    __DAYTONA_SDK_VERSION__: JSON.stringify(daytonaSdkVersion),
    __DAYTONA_CONVEX_PROXY_PATH__: JSON.stringify(daytonaConvexProxyPath),
  },
  plugins: [syncStaticLogoSvgAssetPlugin(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    logOverride: { "this-is-undefined-in-esm": "silent" },
  },
  server: daytonaConvexProxyServerConfig,
  build: {
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, "index.html"),
        ...(shouldIncludeVisualFixture
          ? {
              visualFixture: path.resolve(__dirname, "visual-fixture.html"),
            }
          : {}),
      },
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
