// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { ConvexReactClientMock, convexReactClientConstructorMock } = vi.hoisted(() => {
  const convexReactClientConstructorMock = vi.fn();

  class ConvexReactClientMock {
    constructor(url: string, options: { unsavedChangesWarning: boolean }) {
      convexReactClientConstructorMock(url, options);
    }
  }

  return { ConvexReactClientMock, convexReactClientConstructorMock };
});

vi.mock("convex/react", () => ({
  ConvexReactClient: ConvexReactClientMock,
}));

beforeEach(() => {
  vi.resetModules();
  convexReactClientConstructorMock.mockClear();
});

describe("convex client", () => {
  it("keeps Convex from installing the generic pending-request unload prompt", async () => {
    await import("./convexClient");

    expect(convexReactClientConstructorMock).toHaveBeenCalledWith("http://127.0.0.1:3210", {
      unsavedChangesWarning: false,
    });
  });
});
