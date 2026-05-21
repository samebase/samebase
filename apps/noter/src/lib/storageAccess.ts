function createInMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  const storage: Storage & Record<string, string> = Object.create(null);

  Object.defineProperties(storage, {
    clear: {
      enumerable: false,
      value() {
        for (const key of entries.keys()) {
          delete storage[key];
        }
        entries.clear();
      },
    },
    getItem: {
      enumerable: false,
      value(key: string) {
        return entries.get(String(key)) ?? null;
      },
    },
    key: {
      enumerable: false,
      value(index: number) {
        return Array.from(entries.keys())[index] ?? null;
      },
    },
    length: {
      enumerable: false,
      get() {
        return entries.size;
      },
    },
    removeItem: {
      enumerable: false,
      value(key: string) {
        const normalizedKey = String(key);
        entries.delete(normalizedKey);
        delete storage[normalizedKey];
      },
    },
    setItem: {
      enumerable: false,
      value(key: string, value: string) {
        const normalizedKey = String(key);
        const normalizedValue = String(value);
        entries.set(normalizedKey, normalizedValue);
        Object.defineProperty(storage, normalizedKey, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: normalizedValue,
        });
      },
    },
  });

  return storage;
}

export function ensureWindowStorageAccess(storageKey: "localStorage" | "sessionStorage") {
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
