// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "./appWorkspaceSidebarPreferences";
import {
  AUTH_FLAG_STORAGE_KEY,
  AUTH_PROVIDER_STORAGE_KEY,
  PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY,
} from "./authStorageKeys";
import {
  notifyBrowserLocalStorageChanged,
  readLocalStorageSnapshot,
  subscribeBrowserLocalStorageSnapshot,
} from "./localStorageSnapshot";

class FakeLocalStorage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("readLocalStorageSnapshot", () => {
  const storage = new FakeLocalStorage();

  beforeEach(() => {
    storage.clear();
  });

  it("returns raw values sorted by key", () => {
    storage.setItem("noter.z", "last");
    storage.setItem("noter.a", "line one\nline two");

    expect(readLocalStorageSnapshot(storage)).toEqual({
      kind: "available",
      entries: [
        {
          key: "noter.a",
          value: "line one\nline two",
        },
        {
          key: "noter.z",
          value: "last",
        },
      ],
    });
  });

  it("keeps empty strings as exact values", () => {
    storage.setItem("empty", "");

    expect(readLocalStorageSnapshot(storage)).toEqual({
      kind: "available",
      entries: [
        {
          key: "empty",
          value: "",
        },
      ],
    });
  });

  it("omits app auth and runtime storage keys", () => {
    storage.setItem("__convexAuthJWT_http12700114134", "jwt");
    storage.setItem("__convexAuthRefreshToken_http12700114134", "refresh");
    storage.setItem(APP_WORKSPACE_SIDEBAR_STORAGE_KEY, "{}");
    storage.setItem(AUTH_FLAG_STORAGE_KEY, "1");
    storage.setItem(AUTH_PROVIDER_STORAGE_KEY, "google");
    storage.setItem(PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY, "local_worktree_seed");
    storage.setItem("noter.visible", "kept");

    expect(readLocalStorageSnapshot(storage)).toEqual({
      kind: "available",
      entries: [
        {
          key: "noter.visible",
          value: "kept",
        },
      ],
    });
  });

  it("subscribes to native and app-owned browser localStorage changes", () => {
    const onStoreChange = vi.fn();
    const unsubscribe = subscribeBrowserLocalStorageSnapshot(onStoreChange);

    window.dispatchEvent(new Event("storage"));
    notifyBrowserLocalStorageChanged();
    unsubscribe();
    notifyBrowserLocalStorageChanged();

    expect(onStoreChange).toHaveBeenCalledTimes(2);
  });
});
