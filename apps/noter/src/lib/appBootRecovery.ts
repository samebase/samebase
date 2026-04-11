import { CONVEX_QUERY_CACHE_DB_NAME } from "@/lib/convexQueryCacheStorage";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import { ensureWindowStorageAccess } from "@/lib/storageAccess";

const RECOVERY_QUERY_PARAM = "__noter-reload";
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

function updateRecoveryReloadUrl(url: URL, value: string | undefined): string {
  const nextPath = buildPathWithUpdatedQuery(
    {
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    },
    (nextSearchParams) => {
      setQueryParam(nextSearchParams, RECOVERY_QUERY_PARAM, value);
    },
  );
  return new URL(nextPath, url.origin).toString();
}

function hasRecoveryReloadParam(url: URL): boolean {
  return url.searchParams.has(RECOVERY_QUERY_PARAM);
}

export function buildRecoveryReloadUrl(url: URL): string {
  return updateRecoveryReloadUrl(url, `${Date.now()}`);
}

export function stripRecoveryReloadParam(url: URL): string {
  return updateRecoveryReloadUrl(url, undefined);
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
      ? await listDatabases.call(indexedDB).catch(() => null)
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
  if (
    typeof serviceWorkerContainer === "undefined" ||
    typeof serviceWorkerContainer.getRegistrations !== "function"
  ) {
    return;
  }

  try {
    const registrations = await serviceWorkerContainer.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
  } catch {
    // Ignore browsers that reject service-worker enumeration in private modes.
  }
}

function clearWindowStorage(storageKey: "localStorage" | "sessionStorage") {
  try {
    window[storageKey].clear();
  } catch {
    // Ignore storage failures and keep clearing the remaining stores.
  }
}

export async function resetLocalAppData() {
  ensureWindowStorageAccess("localStorage");
  ensureWindowStorageAccess("sessionStorage");

  clearWindowStorage("localStorage");
  clearWindowStorage("sessionStorage");

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

function autoRecoverFromStaleAssets(event: Event): boolean {
  if (hasRecoveryReloadParam(new URL(window.location.href))) {
    return false;
  }

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

function cleanupRecoveryReloadParam() {
  const currentUrl = new URL(window.location.href);
  if (!hasRecoveryReloadParam(currentUrl)) {
    return;
  }

  tryReplaceUrl(stripRecoveryReloadParam(currentUrl));
}

function scheduleRecoveryReloadParamCleanup() {
  const currentUrl = new URL(window.location.href);
  if (!hasRecoveryReloadParam(currentUrl)) {
    return;
  }

  if (document.readyState === "complete") {
    cleanupRecoveryReloadParam();
    return;
  }

  window.addEventListener("load", cleanupRecoveryReloadParam, { once: true });
}

export function initializeAppBootRecovery() {
  if (typeof window === "undefined") {
    return;
  }

  ensureWindowStorageAccess("localStorage");
  ensureWindowStorageAccess("sessionStorage");
  scheduleRecoveryReloadParamCleanup();

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
