import { setupTypeAcquisition, ATABootstrapConfig } from "@typescript/ata";
import ts from "typescript";

// ---------------------------------------------------------------------------
// Package blocklist – skip these entirely instead of hitting the CDN.
// Add any package here that is a dev tool, build-only dep, or known to not
// have useful type definitions on npm CDN.
// ---------------------------------------------------------------------------
const BLOCKED_PACKAGES = new Set([
  // Build tools & bundlers
  "typescript",
  "vite",
  "@vitejs/plugin-react",
  "esbuild",
  "rollup",
  "webpack",
  "turbo",
  "tsup",
  "tslib",

  // Linters & formatters
  "eslint",
  "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/parser",
  "eslint-plugin-react-hooks",
  "eslint-plugin-react-refresh",
  "@convex-dev/eslint-plugin",
  "oxfmt",

  // CSS tooling
  "postcss",
  "autoprefixer",
  "tailwindcss",
  "tailwindcss-animate",

  // Testing
  "jest",
  "vitest",
  "@jest/globals",
  "ts-jest",

  // Dev utilities
  "npm-run-all",
  "dotenv",

  // Monaco (avoid self-referencing)
  "monaco-editor",
  "@monaco-editor/react",

  // Known packages without useful @types on CDN
  "server-only",
  "react-server-dom-webpack",
  "estree",
  "src",
  "readline",
]);

// Runtime cache – remember packages that returned 404 so we never retry them.
const notFoundCache = new Set<string>();

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/** Extract the npm package name from a jsdelivr URL. Handles:
 *  - /npm/react@latest           → "react"
 *  - /npm/@types/react@latest    → "@types/react"
 *  - /npm/@components@latest     → "@components"  (malformed, but captured)
 *  - /npm/@/Layout@latest        → "@/Layout"     (path alias, captured)
 */
function extractPackageName(url: string): string | null {
  const npmIdx = url.indexOf("/npm/");
  if (npmIdx === -1) return null;

  const rest = url.slice(npmIdx + 5); // everything after "/npm/"

  if (rest.startsWith("@")) {
    // Scoped or bare-@ name: find the second "@" (version separator)
    const versionAt = rest.indexOf("@", 1);
    return versionAt === -1 ? rest : rest.slice(0, versionAt);
  }

  // Unscoped package: name@version
  const atIdx = rest.indexOf("@");
  return atIdx === -1 ? rest : rest.slice(0, atIdx);
}

/** True when we should skip this request entirely. */
function isBlockedUrl(url: string): boolean {
  const pkg = extractPackageName(url);
  if (!pkg) return false;

  // Explicit blocklist or previously failed
  if (BLOCKED_PACKAGES.has(pkg) || notFoundCache.has(pkg)) return true;

  // Path aliases like "@/components", "@/lib/utils" – not real npm packages
  if (pkg.startsWith("@/")) return true;

  // Bare scoped names without a slash (e.g. "@components") are invalid npm
  // package names – they're path aliases or bundler aliases, not packages.
  if (pkg.startsWith("@") && !pkg.includes("/")) return true;

  // ALL-CAPS or clearly non-package names (e.g. "VAR_MODULE_GLOBAL_ERROR")
  if (/^[A-Z_]+$/.test(pkg)) return true;

  // @types/foo → also check if "foo" itself is blocked
  if (pkg.startsWith("@types/")) {
    const base = pkg.slice("@types/".length);
    if (BLOCKED_PACKAGES.has(base) || notFoundCache.has(base)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Concurrency-limited fetcher
// (Chrome caps connections per host; ATA can fire dozens at once)
// ---------------------------------------------------------------------------
const MAX_CONCURRENT_FETCHES = 6;
let activeFetches = 0;
const fetchQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeFetches < MAX_CONCURRENT_FETCHES) {
    activeFetches++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => fetchQueue.push(resolve));
}

function releaseSlot(): void {
  if (fetchQueue.length > 0) {
    const next = fetchQueue.shift()!;
    next();
  } else {
    activeFetches--;
  }
}

async function rateLimitedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  // Fast-path: skip blocked or previously-404'd packages
  if (isBlockedUrl(url)) {
    return new Response("", { status: 404, statusText: "Blocked" });
  }

  await acquireSlot();
  try {
    const response = await fetch(input, init);

    // Remember 400s and 404s so we don't retry the same bad/missing package
    if (response.status === 400 || response.status === 404) {
      const pkg = extractPackageName(url);
      if (pkg) notFoundCache.add(pkg);
    }

    return response;
  } catch {
    return new Response("", { status: 500, statusText: "Fetch failed" });
  } finally {
    releaseSlot();
  }
}

// ---------------------------------------------------------------------------

const delegateListener = createDelegate();

const ata = setupTypeAcquisition({
  projectName: "monaco-ts",
  typescript: ts,
  logger: console,
  fetcher(input, init) {
    return rateLimitedFetch(input, init);
  },
  delegate: {
    receivedFile: (code, path) => {
      delegateListener.receivedFile.forEach((fn) => fn(code, path));
    },
    progress: (downloaded, total) => {
      delegateListener.progress.forEach((fn) => fn(downloaded, total));
    },
    started: () => {
      delegateListener.started.forEach((fn) => fn());
    },
    finished: (_f) => {
      delegateListener.finished.forEach((fn) => fn(_f));
    },
  },
});

type DelegateListener = Required<{
  [k in keyof ATABootstrapConfig["delegate"]]: Set<
    NonNullable<ATABootstrapConfig["delegate"][k]>
  >;
}>;

function createDelegate() {
  const delegate: DelegateListener = {
    receivedFile: new Set(),
    progress: new Set(),
    errorMessage: new Set(),
    finished: new Set(),
    started: new Set(),
  };

  return delegate;
}

type InferSet<T> = T extends Set<infer U> ? U : never;

export function createATA() {
  const acquireType = (code: string) => ata(code);
  const addListener = <T extends keyof DelegateListener>(
    event: T,
    handler: InferSet<DelegateListener[T]>,
  ) => {
    // @ts-expect-error handler union narrowing
    delegateListener[event].add(handler);
  };

  const removeListener = <T extends keyof DelegateListener>(
    event: T,
    handler: InferSet<DelegateListener[T]>,
  ) => {
    // @ts-expect-error handler union narrowing
    delegateListener[event].delete(handler);
  };
  return {
    acquireType,
    addListener,
    removeListener,
    dispose: () => {
      for (const key in delegateListener) {
        delegateListener[key as keyof DelegateListener].clear();
      }
    },
  };
}
