import { CONVEX_QUERY_CACHE_DB_NAME } from "@/lib/convexQueryCacheStorage";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import { ensureWindowStorageAccess } from "@/lib/storageAccess";
import { readAppBuildCommit } from "@/lib/appBuildMetadata";

const RECOVERY_QUERY_PARAM = "__noter-reload";
const AUTO_RECOVERY_SESSION_KEY = "noter-auto-recovery-build";
const STALE_ASSET_PATTERNS = [
  /chunkloaderror/i,
  /failed to fetch dynamically imported module/i,
  /loading chunk [^]+ failed/i,
  /importing a module script failed/i,
];

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const message = Reflect.get(error, "message");
    if (typeof message === "string") {
      return message;
    }
  }
  return "";
}

export function isLikelyStaleAssetError(error: unknown): boolean {
  const message = readErrorMessage(error).trim();
  if (message.length === 0) {
    return false;
  }

  return STALE_ASSET_PATTERNS.some((pattern) => pattern.test(message));
}

export function readBootFailureMessage(error: unknown): string | null {
  const message = readErrorMessage(error).trim();
  return message.length > 0 ? message : null;
}

export function buildRecoveryReloadUrl(url: URL): string {
  const nextPath = buildPathWithUpdatedQuery(
    {
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    },
    (nextSearchParams) => {
      setQueryParam(nextSearchParams, RECOVERY_QUERY_PARAM, `${Date.now()}`);
    },
  );
  return new URL(nextPath, url.origin).toString();
}

export function stripRecoveryReloadParam(url: URL): string {
  const nextPath = buildPathWithUpdatedQuery(
    {
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    },
    (nextSearchParams) => {
      setQueryParam(nextSearchParams, RECOVERY_QUERY_PARAM, undefined);
    },
  );
  return new URL(nextPath, url.origin).toString();
}

function tryReplaceUrl(url: string) {
  try {
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // Some embedded browsers can reject history state changes during startup.
  }
}

function deleteIndexedDbDatabase(name: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
      request.onsuccess = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function clearAllIndexedDbDatabases() {
  const listDatabases =
    typeof indexedDB === "undefined"
      ? null
      : Reflect.get(indexedDB, "databases");
  const databases =
    typeof listDatabases === "function"
      ? await listDatabases.call(indexedDB).catch(() => [])
      : null;

  if (databases === null) {
    await deleteIndexedDbDatabase(CONVEX_QUERY_CACHE_DB_NAME);
    return;
  }

  await Promise.all(
    databases
      .map((database) => database.name)
      .filter((name): name is string => typeof name === "string")
      .map((name) => deleteIndexedDbDatabase(name)),
  );
}

async function clearCacheStorage() {
  if (typeof caches === "undefined") {
    return;
  }

  try {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
  } catch {
    // Ignore storage APIs blocked by the browser.
  }
}

async function unregisterServiceWorkers() {
  if (typeof navigator === "undefined") {
    return;
  }

  const serviceWorkerContainer = navigator.serviceWorker;
  const getRegistrations = Reflect.get(
    serviceWorkerContainer,
    "getRegistrations",
  );
  if (typeof getRegistrations !== "function") {
    return;
  }

  try {
    const registrations = await getRegistrations.call(serviceWorkerContainer);
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
  } catch {
    // Ignore browsers that reject service-worker enumeration in private modes.
  }
}

export async function resetLocalAppData() {
  ensureWindowStorageAccess("localStorage");
  ensureWindowStorageAccess("sessionStorage");

  try {
    window.localStorage.clear();
  } catch {
    // Ignore storage failures and keep clearing the remaining stores.
  }

  try {
    window.sessionStorage.clear();
  } catch {
    // Ignore storage failures and keep clearing the remaining stores.
  }

  await Promise.all([
    clearAllIndexedDbDatabases(),
    clearCacheStorage(),
    unregisterServiceWorkers(),
  ]);
}

export function reloadApp() {
  window.location.replace(
    buildRecoveryReloadUrl(new URL(window.location.href)),
  );
}

function markAutoRecoveryAttempted(buildCommit: string) {
  try {
    window.sessionStorage.setItem(AUTO_RECOVERY_SESSION_KEY, buildCommit);
  } catch {
    // Ignore session-storage failures and rely on the fallback error boundary.
  }
}

function hasAutoRecoveryAttempted(buildCommit: string): boolean {
  try {
    return (
      window.sessionStorage.getItem(AUTO_RECOVERY_SESSION_KEY) === buildCommit
    );
  } catch {
    return false;
  }
}

function autoRecoverFromStaleAssets(event: Event): boolean {
  const buildCommit = readAppBuildCommit();
  if (hasAutoRecoveryAttempted(buildCommit)) {
    return false;
  }

  markAutoRecoveryAttempted(buildCommit);
  event.preventDefault();
  reloadApp();
  return true;
}

type VitePreloadErrorEvent = Event & {
  payload?: unknown;
};

function isVitePreloadErrorEvent(event: Event): event is VitePreloadErrorEvent {
  return "payload" in event;
}

export function initializeAppBootRecovery() {
  if (typeof window === "undefined") {
    return;
  }

  ensureWindowStorageAccess("localStorage");
  ensureWindowStorageAccess("sessionStorage");

  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.has(RECOVERY_QUERY_PARAM)) {
    tryReplaceUrl(stripRecoveryReloadParam(currentUrl));
  }

  window.addEventListener("vite:preloadError", (event) => {
    if (
      !isVitePreloadErrorEvent(event) ||
      !isLikelyStaleAssetError(event.payload)
    ) {
      return;
    }

    autoRecoverFromStaleAssets(event);
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (!isLikelyStaleAssetError(event.reason)) {
      return;
    }

    autoRecoverFromStaleAssets(event);
  });
}
