import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { convexQueryClientConstructorMock } = vi.hoisted(() => ({
  convexQueryClientConstructorMock: vi.fn(),
}));

vi.mock("@convex-dev/react-query", () => ({
  ConvexQueryClient: class {
    constructor(url: string, options: { expectAuth: boolean; unsavedChangesWarning: boolean }) {
      convexQueryClientConstructorMock(url, options);
    }

    connect() {}

    hashFn() {
      return () => "";
    }

    queryFn() {
      return async () => null;
    }
  },
}));

beforeEach(() => {
  convexQueryClientConstructorMock.mockClear();
});

describe("createAppQueryClients", () => {
  it("waits for the session and keeps Convex from installing the pending-request unload prompt", async () => {
    const { createAppQueryClients } = await import("./appQueryClient");

    createAppQueryClients();

    expect(convexQueryClientConstructorMock).toHaveBeenCalledWith("http://127.0.0.1:3210", {
      expectAuth: true,
      unsavedChangesWarning: false,
    });
  });
});
