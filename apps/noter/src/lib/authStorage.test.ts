import { afterEach, describe, expect, it, vi } from "vitest";
import { browserAuthStorage } from "./authStorage";

describe("browserAuthStorage", () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

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
});
