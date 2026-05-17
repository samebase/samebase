// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  buildRecoveryReloadUrl,
  initializeAppBootRecovery,
  isLikelyStaleAssetError,
  resetLocalAppData,
  stripRecoveryReloadParam,
} from "#src/lib/appBootRecovery.ts";
import { CONVEX_QUERY_CACHE_DB_NAME } from "#src/lib/convexQueryCacheStorage.ts";

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);
const originalSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "sessionStorage",
);

function createTestStorage() {
  const entries = new Map<string, string>();

  return {
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(String(key)) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    get length() {
      return entries.size;
    },
    removeItem(key: string) {
      entries.delete(String(key));
    },
    setItem(key: string, value: string) {
      entries.set(String(key), String(value));
    },
  } satisfies Storage;
}

afterEach(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(
      window,
      "localStorage",
      originalLocalStorageDescriptor,
    );
  } else {
    Reflect.deleteProperty(window, "localStorage");
  }

  if (originalSessionStorageDescriptor) {
    Object.defineProperty(
      window,
      "sessionStorage",
      originalSessionStorageDescriptor,
    );
  } else {
    Reflect.deleteProperty(window, "sessionStorage");
  }

  Reflect.deleteProperty(document, "readyState");
  window.history.replaceState(null, "", "/");
});

describe("appBootRecovery", () => {
  it("recognizes stale chunk and dynamic import failures", () => {
    expect(
      isLikelyStaleAssetError(
        new Error("Failed to fetch dynamically imported module"),
      ),
    ).toBe(true);
    expect(isLikelyStaleAssetError(new Error("Loading chunk 42 failed."))).toBe(
      true,
    );
    expect(isLikelyStaleAssetError(new Error("Network timeout"))).toBe(false);
  });

  it("adds a cache-busting recovery query param", () => {
    const reloadedUrl = new URL(
      buildRecoveryReloadUrl(new URL("https://noter.md/?devtools=true")),
    );

    expect(reloadedUrl.searchParams.get("devtools")).toBe("true");
    expect(reloadedUrl.searchParams.has("__noter-reload")).toBe(true);
  });

  it("removes the cache-busting recovery query param without dropping others", () => {
    const strippedUrl = new URL(
      stripRecoveryReloadParam(
        new URL("https://noter.md/?devtools=true&__noter-reload=123"),
      ),
    );

    expect(strippedUrl.searchParams.get("devtools")).toBe("true");
    expect(strippedUrl.searchParams.has("__noter-reload")).toBe(false);
  });

  it("waits until load before removing the recovery query param", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    Object.defineProperty(document, "readyState", {
      configurable: true,
      value: "loading",
    });
    window.history.replaceState(null, "", "/?devtools=true&__noter-reload=123");

    initializeAppBootRecovery();

    expect(
      new URL(window.location.href).searchParams.has("__noter-reload"),
    ).toBe(true);

    window.dispatchEvent(new Event("load"));

    const currentUrl = new URL(window.location.href);
    expect(currentUrl.searchParams.get("devtools")).toBe("true");
    expect(currentUrl.searchParams.has("__noter-reload")).toBe(false);
  });

  it("clears local app data even when service workers are unavailable", async () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    window.localStorage.setItem("theme", "dark");
    window.sessionStorage.setItem("auth", "token");

    await expect(resetLocalAppData()).resolves.toBeUndefined();

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("falls back to deleting the query cache database when indexedDB.databases rejects", async () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: createTestStorage(),
    });

    const deleteDatabase = vi.fn(() => {
      const request: {
        onblocked: ((event: Event) => void) | null;
        onerror: ((event: Event) => void) | null;
        onsuccess: ((event: Event) => void) | null;
      } = {
        onblocked: null,
        onerror: null,
        onsuccess: null,
      };
      queueMicrotask(() => {
        request.onsuccess?.(new Event("success"));
      });
      return request;
    });

    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: {
        databases: vi.fn(async () => {
          throw new Error("blocked");
        }),
        deleteDatabase,
      },
    });

    await expect(resetLocalAppData()).resolves.toBeUndefined();
    expect(deleteDatabase).toHaveBeenCalledWith(CONVEX_QUERY_CACHE_DB_NAME);
  });
});
