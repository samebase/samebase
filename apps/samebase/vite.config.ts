import { defineConfig } from "vite-plus";
import type { ViteDevServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import path from "path";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { createCompactIdentitySvgMarkup } from "./src/components/compactIdentitySvgAsset";
import {
  createLogoIdentitySvgAssets,
  createStaticLogoSvgMarkup,
} from "./src/components/logo/logoStaticSvgAsset";
import { readEnvFileValue, resolveBrowserConvexProxyTarget } from "./browserConvexProxy";
import { resolveAppCommitNumber } from "./dev/appBuildMetadata";
import { readBuildLandingSlogan } from "./dev/landingSlogan";
import { readPublicPrerenderPages } from "./dev/publicPrerenderPages";
import { writePublicPrerenderWithoutModulePreloads } from "./scripts/strip-public-prerender-modulepreloads";
import type { AppBuildConfig } from "./src/lib/appBuildConfig";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const gitRoot = path.resolve(currentDir, "..", "..");
const appTsconfigPath = path.resolve(currentDir, "tsconfig.json");
const slogansPath = path.resolve(gitRoot, "slogans.md");
const BROWSER_CONVEX_PROXY_PATH = "/__samebase_convex_proxy";
const devPortRaw = process.env["SAMEBASE_DEV_PORT"]?.trim();
const devPort = devPortRaw ? Number(devPortRaw) : undefined;
const devStrictPort = readBooleanEnv(process.env["SAMEBASE_DEV_STRICT_PORT"]);
const devAllowedHosts = readAllowedHostsEnv(process.env["SAMEBASE_DEV_ALLOWED_HOSTS"]);

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

const appCommit =
  process.env["VITE_APP_COMMIT"] ?? readGitOutput("git rev-parse HEAD") ?? "unknown";
process.env["JITI_TSCONFIG_PATHS"] ??= appTsconfigPath;
const appCommitNumber = resolveAppCommitNumber({
  envCommitNumber: process.env["VITE_APP_COMMIT_NUMBER"],
  readGitOutput,
  runGitCommand,
});

const appRepoUrl = "https://github.com/samebase/samebase";
const localEnvPath = path.resolve(currentDir, ".env.local");
const browserConvexProxyTarget = resolveBrowserConvexProxyTarget({
  devOrigin: process.env["DEV_ENV_ORIGIN"],
  envProxyTarget: process.env["SAMEBASE_BROWSER_CONVEX_PROXY_TARGET"],
  localEnvConvexUrl: readEnvFileValue(localEnvPath, "VITE_CONVEX_URL"),
});
const browserConvexProxyPath = browserConvexProxyTarget ? BROWSER_CONVEX_PROXY_PATH : null;
const landingPageSlogan = readBuildLandingSlogan({
  buildSeed: process.env["PLAYWRIGHT"] === "1" ? "" : `${appCommitNumber ?? appCommit}`,
  slogansPath,
});
const appBuildConfig: AppBuildConfig = {
  appCommit,
  appCommitNumber,
  appRepoUrl,
  browserConvexProxyPath,
  landingPageSlogan,
};
const staticLogoSvgAssetPath = path.resolve(currentDir, "public/logo-static.svg");
const staticCompactIdentitySvgAssetPaths = [
  path.resolve(currentDir, "public/samebase-icon.svg"),
  path.resolve(currentDir, "public/install-icon.svg"),
];
const spaShellOutputPath = "/index";
const spaShellMaskPath = "/#__samebase-spa-shell";
const publicPrerenderPages = readPublicPrerenderPages();
const prerenderHeaders = readPrerenderHeaders(process.env["SAMEBASE_PRERENDER_ORIGIN"]);

function readPrerenderHeaders(originValue: string | undefined) {
  const origin = originValue?.trim();
  if (!origin) {
    return undefined;
  }

  const url = new URL(origin);
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error(
      "SAMEBASE_PRERENDER_ORIGIN must be an origin, for example https://example.com.",
    );
  }

  return {
    "x-forwarded-host": url.host,
    "x-forwarded-proto": url.protocol.replace(/:$/, ""),
  };
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
 * Keep the checked-in compact identity SVG aliases stable by comparing trimmed
 * markup and only rewriting when the canonical source has changed.
 */
function syncStaticCompactIdentitySvgAssets() {
  const nextCompactIdentitySvgMarkup = createCompactIdentitySvgMarkup().trim();

  for (const assetPath of staticCompactIdentitySvgAssetPaths) {
    const currentCompactIdentitySvgMarkup = (() => {
      try {
        return readFileSync(assetPath, "utf8").trim();
      } catch {
        return null;
      }
    })();

    if (currentCompactIdentitySvgMarkup === nextCompactIdentitySvgMarkup) {
      continue;
    }

    writeFileSync(assetPath, `${nextCompactIdentitySvgMarkup}\n`, "utf8");
  }
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
 * The compact identity SVGs are generated artifacts, so the plugin syncs them
 * only once per Vite process instead of rewriting on every hook invocation.
 */
function syncStaticCompactIdentitySvgAssetsPlugin() {
  let hasSyncedStaticCompactIdentitySvgAssets = false;

  const syncOnce = () => {
    if (hasSyncedStaticCompactIdentitySvgAssets) {
      return;
    }

    // One-time sync avoids repeated write churn while keeping the tracked SVG current.
    hasSyncedStaticCompactIdentitySvgAssets = true;
    syncStaticCompactIdentitySvgAssets();
  };

  return {
    name: "sync-static-compact-identity-svg-assets",
    buildStart() {
      syncOnce();
    },
    configureServer() {
      syncOnce();
    },
  };
}

/**
 * Corpus docs pages are markdown-sourced (`src/content/docs-*.md`) and rendered
 * as HTML routes. Agents also fetch them raw, so the same source files ship as
 * static `.md` assets alongside the prerendered pages (rfcs/093, Phase 1).
 */
const contentDocsMarkdownAssets = [
  { assetPath: "docs/cloudflare-setup.md", sourcePath: "src/content/docs-cloudflare-setup.md" },
  { assetPath: "docs/do-it-yourself.md", sourcePath: "src/content/docs-do-it-yourself.md" },
  {
    assetPath: "docs/operate/agent-plugin.md",
    sourcePath: "src/content/docs-operate-agent-plugin.md",
  },
  {
    assetPath: "docs/operate/custom-domain.md",
    sourcePath: "src/content/docs-operate-custom-domain.md",
  },
  {
    assetPath: "docs/operate/production-logs.md",
    sourcePath: "src/content/docs-operate-production-logs.md",
  },
  { assetPath: "docs/receipts.md", sourcePath: "src/content/docs-receipts.md" },
  { assetPath: "docs/the-stack.md", sourcePath: "src/content/docs-the-stack.md" },
  { assetPath: "pricing.md", sourcePath: "src/content/docs-pricing.md" },
] as const;

function serveContentDocsMarkdownPlugin() {
  const readContentMarkdown = (sourcePath: string) =>
    readFileSync(path.resolve(currentDir, sourcePath), "utf8");

  return {
    name: "serve-content-docs-markdown",
    configureServer(server: ViteDevServer) {
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

          const asset = contentDocsMarkdownAssets.find(
            ({ assetPath }) => requestPath === `/${assetPath}`,
          );
          if (!asset) {
            next();
            return;
          }

          response.statusCode = 200;
          response.setHeader("Content-Type", "text/markdown; charset=utf-8");
          response.end(readContentMarkdown(asset.sourcePath));
        },
      );
    },
    closeBundle() {
      for (const { assetPath, sourcePath } of contentDocsMarkdownAssets) {
        const builtAssetPath = path.resolve(currentDir, "dist/client", assetPath);
        mkdirSync(path.dirname(builtAssetPath), { recursive: true });
        writeFileSync(builtAssetPath, readContentMarkdown(sourcePath), "utf8");
      }
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
    __APP_BUILD_CONFIG__: JSON.stringify(appBuildConfig),
  },
  plugins: [
    syncStaticLogoSvgAssetPlugin(),
    syncStaticCompactIdentitySvgAssetsPlugin(),
    serveContentDocsMarkdownPlugin(),
    tailwindcss(),
    tanstackStart({
      router: {
        quoteStyle: "double",
        semicolons: true,
        virtualRouteConfig: "./src/routes.ts",
      },
      pages: publicPrerenderPages,
      prerender: {
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        enabled: true,
        ...(prerenderHeaders ? { headers: prerenderHeaders } : {}),
        onSuccess({ page, html }) {
          const publicPrerenderPage = publicPrerenderPages.find(
            (candidate) => candidate.path === page.path,
          );
          if (!publicPrerenderPage) {
            return;
          }

          writePublicPrerenderWithoutModulePreloads({
            clientDistDir: path.resolve(currentDir, "dist/client"),
            html,
            page: publicPrerenderPage,
          });
        },
      },
      spa: {
        enabled: true,
        // wrangler.jsonc uses Cloudflare's single-page-application asset mode,
        // and that mode serves /index.html for unknown app routes. TanStack
        // Start defaults the SPA shell to /_shell.html, so emit it here
        // instead. The hash marker keeps the shell request on the public root
        // route while staying distinct from the explicit / prerender entry.
        maskPath: spaShellMaskPath,
        prerender: {
          outputPath: spaShellOutputPath,
        },
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
