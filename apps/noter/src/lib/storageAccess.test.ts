// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { ensureWindowStorageAccess } from "./storageAccess";

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);

afterEach(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(
      window,
      "localStorage",
      originalLocalStorageDescriptor,
    );
    return;
  }

  Reflect.deleteProperty(window, "localStorage");
});

describe("storageAccess", () => {
  it("exposes fallback localStorage keys through both Storage and Object.keys", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("localStorage blocked");
      },
    });

    ensureWindowStorageAccess("localStorage");

    window.localStorage.setItem("__convexAuthToken", "secret");
    window.localStorage.setItem("theme", "dark");

    expect(window.localStorage.length).toBe(2);
    expect(window.localStorage.key(0)).toBe("__convexAuthToken");
    expect(window.localStorage.getItem("__convexAuthToken")).toBe("secret");
    expect(Object.keys(window.localStorage)).toEqual([
      "__convexAuthToken",
      "theme",
    ]);

    window.localStorage.removeItem("__convexAuthToken");
    expect(Object.keys(window.localStorage)).toEqual(["theme"]);

    window.localStorage.clear();
    expect(window.localStorage.length).toBe(0);
    expect(Object.keys(window.localStorage)).toEqual([]);
  });
});
