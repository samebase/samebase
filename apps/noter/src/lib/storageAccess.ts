function createInMemoryStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    clear() {
      entries.clear();
    },
    getItem(key) {
      return entries.get(key) ?? null;
    },
    key(index) {
      return Array.from(entries.keys())[index] ?? null;
    },
    get length() {
      return entries.size;
    },
    removeItem(key) {
      entries.delete(key);
    },
    setItem(key, value) {
      entries.set(String(key), String(value));
    },
  };
}

export function ensureWindowStorageAccess(
  storageKey: "localStorage" | "sessionStorage",
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    void window[storageKey];
  } catch {
    try {
      Object.defineProperty(window, storageKey, {
        configurable: true,
        enumerable: true,
        value: createInMemoryStorage(),
      });
    } catch {
      // Leave the native failure in place when the browser prevents overrides.
    }
  }
}
