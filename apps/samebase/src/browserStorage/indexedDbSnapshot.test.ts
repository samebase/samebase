// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vite-plus/test";
import { formatIndexedDbStoredValue, readBrowserIndexedDbSnapshot } from "./indexedDbSnapshot";

const originalIndexedDbDescriptor = Object.getOwnPropertyDescriptor(window, "indexedDB");

describe("formatIndexedDbStoredValue", () => {
  it("formats JSON-looking strings like the localStorage route", () => {
    expect(formatIndexedDbStoredValue('{"enabled":true,"nested":{"count":2}}')).toBe(
      '{\n  "enabled": true,\n  "nested": {\n    "count": 2\n  }\n}',
    );
  });

  it("formats structured values without throwing on cycles or bigints", () => {
    const value: { count: bigint; self?: unknown } = { count: 2n };
    value.self = value;

    expect(formatIndexedDbStoredValue(value)).toBe(
      '{\n  "count": "2n",\n  "self": "[Circular]"\n}',
    );
  });
});

describe("readBrowserIndexedDbSnapshot", () => {
  afterEach(() => {
    if (originalIndexedDbDescriptor) {
      Object.defineProperty(window, "indexedDB", originalIndexedDbDescriptor);
      return;
    }

    Reflect.deleteProperty(window, "indexedDB");
  });

  it("returns unavailable when browser indexedDB is missing", async () => {
    Reflect.deleteProperty(window, "indexedDB");

    await expect(readBrowserIndexedDbSnapshot()).resolves.toEqual({
      kind: "unavailable",
      errorMessage: "indexedDB is only available in a browser.",
    });
  });

  it("returns an empty available snapshot when the browser lists no databases", async () => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: {
        databases: async () => [],
      },
    });

    await expect(readBrowserIndexedDbSnapshot()).resolves.toEqual({
      kind: "available",
      entries: [],
      truncatedStores: [],
    });
  });
});
