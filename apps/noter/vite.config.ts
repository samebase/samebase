import { defineConfig, type ViteDevServer } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import path from "path";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { formatWithVpFmt } from "../../scripts/format-with-vp-fmt.ts";
import { createInstallIconSvgMarkup } from "./src/components/installIconSvgAsset";
import {
  createLogoIdentitySvgAssets,
  createStaticLogoSvgMarkup,
} from "./src/components/logo/logoStaticSvgAsset";
import { buildNoterSyncPublicScript } from "./noterSyncPublicScript";
import { readEnvFileValue, resolveBrowserConvexProxyTarget } from "./browserConvexProxy";
import { resolveAppCommitNumber } from "./dev/appBuildMetadata";
import { codexAppServerResearchBridgePlugin } from "./dev/codexAppServerResearchBridge";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const gitRoot = path.resolve(currentDir, "..", "..");
const appTsconfigPath = path.resolve(currentDir, "tsconfig.json");
const BROWSER_CONVEX_PROXY_PATH = "/__noter_convex_proxy";
const devPortRaw = process.env.NOTER_DEV_PORT?.trim();
const devPort = devPortRaw ? Number(devPortRaw) : undefined;
const devStrictPort = readBooleanEnv(process.env.NOTER_DEV_STRICT_PORT);
const devAllowedHosts = readAllowedHostsEnv(process.env.NOTER_DEV_ALLOWED_HOSTS);

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

function readAllowedHostsEnv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
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

/**
 * Execute a git command at the repo root for build metadata probing.
 * Callers rely on this helper to swallow failures and return `false` instead
 * of throwing so shallow-checkout resolution can fail closed.
 */
function runGitCommand(command: string): boolean {
  try {
    execSync(command, {
      cwd: gitRoot,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

const appCommit = process.env.VITE_APP_COMMIT ?? readGitOutput("git rev-parse HEAD") ?? "unknown";
process.env.JITI_TSCONFIG_PATHS ??= appTsconfigPath;
const appCommitNumber = resolveAppCommitNumber({
  envCommitNumber: process.env.VITE_APP_COMMIT_NUMBER,
  readGitOutput,
  runGitCommand,
});

const appRepoUrl = "https://github.com/noter-md/noter";
const localEnvPath = path.resolve(currentDir, ".env.local");
const browserConvexProxyTarget = resolveBrowserConvexProxyTarget({
  devOrigin: process.env.DEV_ENV_ORIGIN,
  envProxyTarget: process.env.NOTER_BROWSER_CONVEX_PROXY_TARGET,
  localEnvConvexUrl: readEnvFileValue(localEnvPath, "VITE_CONVEX_URL"),
});
const browserConvexProxyPath = browserConvexProxyTarget ? BROWSER_CONVEX_PROXY_PATH : null;
const staticLogoSvgAssetPath = path.resolve(currentDir, "public/logo-static.svg");
const staticInstallIconSvgAssetPath = path.resolve(currentDir, "public/install-icon.svg");
const noterSyncPackageScriptPath = path.resolve(gitRoot, "packages/sync/noter.ts");
const staticNoterSyncScriptPath = path.resolve(currentDir, "public/noter.ts");
const noterConnectConfigPathname = "/noter-connect.json";
const runtimeNoterConnectConfigPath = path.resolve(
  currentDir,
  `dist/client${noterConnectConfigPathname}`,
);
function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function parseValidatedNoterConnectConvexSiteUrl(value: string): string {
  try {
    const convexSiteUrl = new URL(value);
    const isLoopbackHttp =
      convexSiteUrl.protocol === "http:" && isLoopbackHostname(convexSiteUrl.hostname);
    if (convexSiteUrl.protocol !== "https:" && !isLoopbackHttp) {
      throw new Error(
        "The runtime Convex site URL must use https, except for explicit localhost testing.",
      );
    }
    if (convexSiteUrl.username || convexSiteUrl.password) {
      throw new Error("The runtime Convex site URL must not include credentials.");
    }
    if (convexSiteUrl.search.length > 0 || convexSiteUrl.hash.length > 0) {
      throw new Error("The runtime Convex site URL must not include query params or hashes.");
    }
    if (convexSiteUrl.pathname !== "/") {
      throw new Error("The runtime Convex site URL must be an origin with no path.");
    }
    return convexSiteUrl.toString();
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Invalid noter-connect.json convexSiteUrl: ${error.message}`
        : "Invalid noter-connect.json convexSiteUrl.",
    );
  }
}

function readNoterSyncPackageScript(): string {
  return readFileSync(noterSyncPackageScriptPath, "utf8").replace(/\r\n/g, "\n").trimEnd();
}

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

function syncLogoIdentitySvgAssets() {
  const publicRoot = path.resolve(currentDir, "public");
  for (const asset of createLogoIdentitySvgAssets()) {
    // Fail closed: logo asset paths must be URL-rooted and resolve within public/.
    if (!asset.assetPath.startsWith("/")) {
      throw new Error(`Logo identity asset path must be root-relative: ${asset.assetPath}`);
    }

    const relativeAssetPath = asset.assetPath.replace(/^\//, "");
    const targetAssetPath = path.resolve(publicRoot, relativeAssetPath);
    const relativeToPublicRoot = path.relative(publicRoot, targetAssetPath);
    if (relativeToPublicRoot.startsWith("..") || path.isAbsolute(relativeToPublicRoot)) {
      throw new Error(`Logo identity asset path escapes public/: ${asset.assetPath}`);
    }

    const nextAssetMarkup = asset.markup.trim();
    const currentAssetMarkup = (() => {
      try {
        return readFileSync(targetAssetPath, "utf8").trim();
      } catch {
        return null;
      }
    })();

    if (currentAssetMarkup === nextAssetMarkup) {
      continue;
    }

    mkdirSync(path.dirname(targetAssetPath), { recursive: true });
    writeFileSync(targetAssetPath, `${nextAssetMarkup}\n`, "utf8");
  }
}

/**
 * Keep the checked-in install icon SVG stable by comparing trimmed markup and
 * only rewriting when the canonical source output has semantically changed.
 */
function syncStaticInstallIconSvgAsset() {
  const nextInstallIconSvgMarkup = createInstallIconSvgMarkup().trim();
  const currentInstallIconSvgMarkup = (() => {
    try {
      return readFileSync(staticInstallIconSvgAssetPath, "utf8").trim();
    } catch {
      return null;
    }
  })();

  if (currentInstallIconSvgMarkup === nextInstallIconSvgMarkup) {
    return;
  }

  writeFileSync(staticInstallIconSvgAssetPath, `${nextInstallIconSvgMarkup}\n`, "utf8");
}

/**
 * Mirror the package entrypoint into `public/noter.ts` without any mutation so
 * the hosted file stays byte-for-byte identical to the source a user can audit
 * in the package.
 */
async function syncStaticNoterSyncScriptAsset() {
  const nextNoterSyncScript = buildNoterSyncPublicScript({
    packageScript: readNoterSyncPackageScript(),
  });
  const nextNoterSyncScriptWithNewline = nextNoterSyncScript.endsWith("\n")
    ? nextNoterSyncScript
    : `${nextNoterSyncScript}\n`;
  const currentNoterSyncScript = (() => {
    try {
      return readFileSync(staticNoterSyncScriptPath, "utf8");
    } catch {
      return null;
    }
  })();

  if (currentNoterSyncScript === nextNoterSyncScriptWithNewline) {
    return;
  }

  writeFileSync(staticNoterSyncScriptPath, nextNoterSyncScriptWithNewline, "utf8");
}

async function buildRuntimeNoterSyncScript() {
  const script = buildNoterSyncPublicScript({
    packageScript: readNoterSyncPackageScript(),
  });
  return script.endsWith("\n") ? script : `${script}\n`;
}

function readNoterConnectConvexSiteUrl(): string {
  const configuredSiteUrl = process.env.CONVEX_SITE_URL?.trim();
  if (configuredSiteUrl) {
    return parseValidatedNoterConnectConvexSiteUrl(configuredSiteUrl);
  }

  const configuredViteSiteUrl = process.env.VITE_CONVEX_SITE_URL?.trim();
  if (
    configuredViteSiteUrl &&
    (configuredViteSiteUrl.startsWith("https://") || configuredViteSiteUrl.startsWith("http://"))
  ) {
    return parseValidatedNoterConnectConvexSiteUrl(configuredViteSiteUrl);
  }

  const localEnvSiteUrl = readEnvFileValue(localEnvPath, "VITE_CONVEX_SITE_URL");
  if (
    localEnvSiteUrl &&
    (localEnvSiteUrl.startsWith("https://") || localEnvSiteUrl.startsWith("http://"))
  ) {
    return parseValidatedNoterConnectConvexSiteUrl(localEnvSiteUrl);
  }

  throw new Error(
    "Missing CONVEX_SITE_URL or an absolute VITE_CONVEX_SITE_URL for noter-connect.json.",
  );
}

async function buildRuntimeNoterConnectConfig() {
  return await formatGeneratedFileContents({
    filepath: runtimeNoterConnectConfigPath,
    content: JSON.stringify(
      {
        convexSiteUrl: readNoterConnectConvexSiteUrl(),
      },
      null,
      2,
    ),
  });
}

async function formatGeneratedFileContents(args: { content: string; filepath: string }) {
  return formatWithVpFmt(args.filepath, args.content);
}

function syncStaticLogoSvgAssetPlugin() {
  let hasSyncedStaticLogoSvgAsset = false;

  const syncOnce = () => {
    if (hasSyncedStaticLogoSvgAsset) {
      return;
    }

    hasSyncedStaticLogoSvgAsset = true;
    syncStaticLogoSvgAsset();
    syncLogoIdentitySvgAssets();
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

/**
 * The install icon SVG is a generated artifact, so the plugin syncs it only
 * once per Vite process instead of rewriting on every hook invocation.
 */
function syncStaticInstallIconSvgAssetPlugin() {
  let hasSyncedStaticInstallIconSvgAsset = false;

  const syncOnce = () => {
    if (hasSyncedStaticInstallIconSvgAsset) {
      return;
    }

    // One-time sync avoids repeated write churn while keeping the tracked SVG current.
    hasSyncedStaticInstallIconSvgAsset = true;
    syncStaticInstallIconSvgAsset();
  };

  return {
    name: "sync-static-install-icon-svg-asset",
    buildStart() {
      syncOnce();
    },
    configureServer() {
      syncOnce();
    },
  };
}

function syncStaticNoterSyncScriptAssetPlugin() {
  let hasSyncedStaticNoterSyncScriptAsset = false;

  const syncOnce = async () => {
    if (hasSyncedStaticNoterSyncScriptAsset) {
      return;
    }

    hasSyncedStaticNoterSyncScriptAsset = true;
    await syncStaticNoterSyncScriptAsset();
  };

  return {
    name: "sync-static-noter-sync-script-asset",
    async buildStart() {
      await syncOnce();
    },
    async configureServer(server: ViteDevServer) {
      await syncOnce();

      // Serve a deploy-stamped installer in dev without dirtying the tracked
      // `public/noter.ts` file away from its production default.
      server.middlewares.use(
        (
          request: IncomingMessage,
          response: ServerResponse<IncomingMessage>,
          next: (error?: Error) => void,
        ) => {
          const requestPath = (() => {
            if (!request.url) {
              return null;
            }

            try {
              return new URL(request.url, "http://vite.local").pathname;
            } catch {
              return null;
            }
          })();

          if (requestPath !== "/noter.ts") {
            next();
            return;
          }

          void buildRuntimeNoterSyncScript()
            .then((runtimeScript) => {
              response.statusCode = 200;
              response.setHeader("Content-Type", "application/typescript; charset=utf-8");
              response.end(runtimeScript);
            })
            .catch(next);
        },
      );
    },
    async closeBundle() {
      const builtScriptPath = path.resolve(currentDir, "dist/client/noter.ts");
      const runtimeScript = await buildRuntimeNoterSyncScript();
      mkdirSync(path.dirname(builtScriptPath), { recursive: true });
      writeFileSync(builtScriptPath, runtimeScript, "utf8");
    },
  };
}

function syncRuntimeNoterConnectConfigAssetPlugin() {
  const writeRuntimeConfig = async () => {
    const runtimeConfig = await buildRuntimeNoterConnectConfig();
    mkdirSync(path.dirname(runtimeNoterConnectConfigPath), { recursive: true });
    writeFileSync(runtimeNoterConnectConfigPath, runtimeConfig, "utf8");
  };

  return {
    name: "sync-runtime-noter-connect-config-asset",
    async configureServer(server: ViteDevServer) {
      server.middlewares.use(
        (
          request: IncomingMessage,
          response: ServerResponse<IncomingMessage>,
          next: (error?: Error) => void,
        ) => {
          const requestPath = (() => {
            if (!request.url) {
              return null;
            }

            try {
              return new URL(request.url, "http://vite.local").pathname;
            } catch {
              return null;
            }
          })();

          if (requestPath !== noterConnectConfigPathname) {
            next();
            return;
          }

          void buildRuntimeNoterConnectConfig()
            .then((runtimeConfig) => {
              response.statusCode = 200;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(runtimeConfig);
            })
            .catch(next);
        },
      );
    },
    async closeBundle() {
      await writeRuntimeConfig();
    },
  };
}

function stripBrowserConvexProxyPrefix(requestPath: string): string {
  if (
    requestPath !== BROWSER_CONVEX_PROXY_PATH &&
    !requestPath.startsWith(`${BROWSER_CONVEX_PROXY_PATH}/`)
  ) {
    return requestPath;
  }
  const strippedPath = requestPath.slice(BROWSER_CONVEX_PROXY_PATH.length);
  return strippedPath.length > 0 ? strippedPath : "/";
}

const browserConvexProxyServerConfig = (() => {
  const server: {
    port?: number;
    strictPort?: boolean;
    allowedHosts?: string[];
    proxy?: Record<
      string,
      {
        target: string;
        changeOrigin: boolean;
        ws: boolean;
        rewrite: (requestPath: string) => string;
      }
    >;
  } = {};

  if (devPort !== undefined && !Number.isNaN(devPort)) {
    server.port = devPort;
  }
  if (devStrictPort !== undefined) {
    server.strictPort = devStrictPort;
  }
  if (devAllowedHosts.length > 0) {
    // Quick tunnels terminate on a random trycloudflare.com host, so Vite
    // needs an explicit allowlist instead of rejecting the public Host header.
    server.allowedHosts = devAllowedHosts;
  }
  if (browserConvexProxyTarget) {
    // The browser proxy path keeps the anonymous Convex backend private even
    // when the frontend is being shared from a public tunnel origin.
    server.proxy = {
      [BROWSER_CONVEX_PROXY_PATH]: {
        target: browserConvexProxyTarget,
        changeOrigin: true,
        ws: true,
        rewrite: stripBrowserConvexProxyPrefix,
      },
    };
  }

  return Object.keys(server).length > 0 ? server : undefined;
})();

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_COMMIT__: JSON.stringify(appCommit),
    __APP_COMMIT_NUMBER__: JSON.stringify(appCommitNumber),
    __APP_REPO_URL__: JSON.stringify(appRepoUrl),
    __BROWSER_CONVEX_PROXY_PATH__: JSON.stringify(browserConvexProxyPath),
  },
  plugins: [
    syncStaticLogoSvgAssetPlugin(),
    syncStaticInstallIconSvgAssetPlugin(),
    syncStaticNoterSyncScriptAssetPlugin(),
    syncRuntimeNoterConnectConfigAssetPlugin(),
    codexAppServerResearchBridgePlugin({
      workspaceRoot: gitRoot,
    }),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart({
      router: {
        quoteStyle: "double",
        semicolons: true,
        virtualRouteConfig: "./src/routes.ts",
      },
    }),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@": path.resolve(currentDir, "./src"),
    },
  },
  server: browserConvexProxyServerConfig,
  preview: {
    host: "127.0.0.1",
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
