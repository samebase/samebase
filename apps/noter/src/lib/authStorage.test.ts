import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  browserAuthStorage,
  readBrowserAuthStorageEntries,
} from "./authStorage";

describe("browserAuthStorage", () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  afterAll(() => {
    consoleWarnSpy.mockRestore();
  });

  afterEach(() => {
    consoleWarnSpy.mockClear();
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
  });

  it("falls back to in-memory storage when localStorage writes fail", () => {
    const localStorageMock = {
      getItem: vi.fn(() => {
        throw new DOMException("Access denied", "SecurityError");
      }),
      setItem: vi.fn(() => {
        throw new DOMException("Access denied", "SecurityError");
      }),
      removeItem: vi.fn(() => {
        throw new DOMException("Access denied", "SecurityError");
      }),
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: localStorageMock,
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });

    browserAuthStorage.setItem("auth-key", "auth-value");
    expect(browserAuthStorage.getItem("auth-key")).toBe("auth-value");

    browserAuthStorage.removeItem("auth-key");
    expect(browserAuthStorage.getItem("auth-key")).toBeNull();
  });

  it("stops trusting persistent auth reads after a write failure", () => {
    const localStorageMock = {
      getItem: vi.fn((key: string) =>
        key === "__convexAuthJWT_demo" ? "stale-token" : null,
      ),
      setItem: vi.fn(() => {
        throw new DOMException("Access denied", "SecurityError");
      }),
      removeItem: vi.fn(() => {
        throw new DOMException("Access denied", "SecurityError");
      }),
      key: vi.fn(() => "__convexAuthJWT_demo"),
      length: 1,
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: localStorageMock,
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });

    browserAuthStorage.setItem("__convexAuthJWT_demo", "fresh-token");

    expect(browserAuthStorage.getItem("__convexAuthJWT_demo")).toBe(
      "fresh-token",
    );
    expect(readBrowserAuthStorageEntries("__convexAuth")).toEqual({
      __convexAuthJWT_demo: "fresh-token",
    });

    browserAuthStorage.removeItem("__convexAuthJWT_demo");

    expect(browserAuthStorage.getItem("__convexAuthJWT_demo")).toBeNull();
    expect(readBrowserAuthStorageEntries("__convexAuth")).toEqual({});
  });
});
