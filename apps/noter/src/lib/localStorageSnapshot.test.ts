// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
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
