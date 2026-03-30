import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { format as formatWithPrettier } from "prettier";
import { readPackageVersion } from "../../scripts/readPackageVersion.js";
import { createInstallIconSvgMarkup } from "./src/components/installIconSvgAsset";
import { createStaticLogoSvgMarkup } from "./src/components/logoStaticSvgAsset";
import {
  type PageMetadata,
  PRIVACY_PAGE_METADATA,
  TERMS_PAGE_METADATA,
} from "./src/lib/pageMetadata";
import { renderStaticLegalPageHtml } from "./src/lib/staticLegalPage";
import {
  buildNoterSyncPublicScript,
  resolveNoterSyncPublicScriptSourceUrl,
} from "./noterSyncPublicScript";
import {
  readEnvFileValue,
  resolveDaytonaConvexProxyTarget,
} from "./daytonaConvexProxy";
import { codexAppServerResearchBridgePlugin } from "./dev/codexAppServerResearchBridge";

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

const appRepoUrl = "https://github.com/noter-md/noter";
const daytonaSdkVersion = readPackageVersion("@daytonaio/sdk", import.meta.url);
const cloudflarePagesUrl = process.env.CF_PAGES_URL ?? null;
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
const staticInstallIconSvgAssetPath = path.resolve(
  __dirname,
  "public/install-icon.svg",
);
const noterSyncPackageScriptPath = path.resolve(
  gitRoot,
  "packages/sync/noter.js",
);
const staticNoterSyncScriptPath = path.resolve(__dirname, "public/noter.js");
const privacyPolicyMarkdownPath = path.resolve(
  __dirname,
  "src/content/privacy-policy.md",
);
const termsOfServiceMarkdownPath = path.resolve(
  __dirname,
  "src/content/terms-of-service.md",
);
const staticPrivacyHtmlPath = path.resolve(
  __dirname,
  "public/privacy/index.html",
);
const staticTermsHtmlPath = path.resolve(__dirname, "public/terms/index.html");

function readNoterSyncPackageScript(): string {
  return readFileSync(noterSyncPackageScriptPath, "utf8")
    .replace(/\r\n/g, "\n")
    .trimEnd();
}

function getRuntimeNoterSyncSourceUrl(): string {
  return resolveNoterSyncPublicScriptSourceUrl({
    devOrigin: process.env.DEV_ENV_ORIGIN,
    pagesUrl: cloudflarePagesUrl,
  });
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

  writeFileSync(
    staticInstallIconSvgAssetPath,
    `${nextInstallIconSvgMarkup}\n`,
    "utf8",
  );
}

/**
 * The public script is checked into a different path than the package entrypoint,
 * so normalize the copied source through Prettier using the public filepath
 * before writing it. That keeps future Vite syncs aligned with the file shape
 * that commit hooks actually enforce for `public/noter.js`.
 */
async function syncStaticNoterSyncScriptAsset() {
  const nextNoterSyncScript = buildNoterSyncPublicScript({
    packageScript: readNoterSyncPackageScript(),
    sourceUrl: resolveNoterSyncPublicScriptSourceUrl(),
  });
  const nextNoterSyncScriptWithNewline = await formatGeneratedFileContents({
    filepath: staticNoterSyncScriptPath,
    content: nextNoterSyncScript,
  });
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

  writeFileSync(
    staticNoterSyncScriptPath,
    nextNoterSyncScriptWithNewline,
    "utf8",
  );
}

async function buildRuntimeNoterSyncScript(args: { filepath: string }) {
  return formatGeneratedFileContents({
    filepath: args.filepath,
    content: buildNoterSyncPublicScript({
      packageScript: readNoterSyncPackageScript(),
      sourceUrl: getRuntimeNoterSyncSourceUrl(),
    }),
  });
}

async function formatGeneratedFileContents(args: {
  content: string;
  filepath: string;
}) {
  const formattedContents = await formatWithPrettier(args.content, {
    filepath: args.filepath,
  });
  return formattedContents.endsWith("\n")
    ? formattedContents
    : `${formattedContents}\n`;
}

async function syncStaticLegalPageAsset(args: {
  markdownPath: string;
  htmlPath: string;
  metadata: PageMetadata;
}) {
  const markdown = readFileSync(args.markdownPath, "utf8");
  const nextHtml = await formatGeneratedFileContents({
    filepath: args.htmlPath,
    content: renderStaticLegalPageHtml({
      metadata: args.metadata,
      markdown,
    }),
  });
  const currentHtml = (() => {
    try {
      return readFileSync(args.htmlPath, "utf8");
    } catch {
      return null;
    }
  })();

  if (currentHtml === nextHtml) {
    return;
  }

  mkdirSync(path.dirname(args.htmlPath), { recursive: true });
  writeFileSync(args.htmlPath, nextHtml, "utf8");
}

async function syncStaticLegalPageAssets() {
  await syncStaticLegalPageAsset({
    markdownPath: privacyPolicyMarkdownPath,
    htmlPath: staticPrivacyHtmlPath,
    metadata: PRIVACY_PAGE_METADATA,
  });
  await syncStaticLegalPageAsset({
    markdownPath: termsOfServiceMarkdownPath,
    htmlPath: staticTermsHtmlPath,
    metadata: TERMS_PAGE_METADATA,
  });
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
      // `public/noter.js` file away from its production default.
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

          if (requestPath !== "/noter.js") {
            next();
            return;
          }

          void buildRuntimeNoterSyncScript({
            filepath: staticNoterSyncScriptPath,
          })
            .then((runtimeScript) => {
              response.statusCode = 200;
              response.setHeader(
                "Content-Type",
                "application/javascript; charset=utf-8",
              );
              response.end(runtimeScript);
            })
            .catch(next);
        },
      );
    },
    async closeBundle() {
      const builtScriptPath = path.resolve(__dirname, "dist/noter.js");
      const runtimeScript = await buildRuntimeNoterSyncScript({
        filepath: builtScriptPath,
      });
      mkdirSync(path.dirname(builtScriptPath), { recursive: true });
      writeFileSync(builtScriptPath, runtimeScript, "utf8");
    },
  };
}

function syncStaticLegalPageAssetsPlugin() {
  let hasSyncedStaticLegalPageAssets = false;

  const syncOnce = async () => {
    if (hasSyncedStaticLegalPageAssets) {
      return;
    }

    hasSyncedStaticLegalPageAssets = true;
    await syncStaticLegalPageAssets();
  };

  return {
    name: "sync-static-legal-page-assets",
    buildStart() {
      return syncOnce();
    },
    configureServer() {
      return syncOnce();
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
  plugins: [
    syncStaticLogoSvgAssetPlugin(),
    syncStaticInstallIconSvgAssetPlugin(),
    syncStaticNoterSyncScriptAssetPlugin(),
    syncStaticLegalPageAssetsPlugin(),
    codexAppServerResearchBridgePlugin({
      workspaceRoot: gitRoot,
    }),
    react(),
  ],
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
