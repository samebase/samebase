import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { closeMock, openerLocalStorageSetItemMock, openerReloadMock, useConvexAuthMock } =
  vi.hoisted(() => ({
    closeMock: vi.fn(),
    openerLocalStorageSetItemMock: vi.fn(),
    openerReloadMock: vi.fn(),
    useConvexAuthMock: vi.fn(),
  }));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: (effect: () => void) => {
      effect();
    },
  };
});

vi.mock("convex/react", () => ({
  useConvexAuth: useConvexAuthMock,
}));

import { useCloseOAuthPopup } from "./useCloseOAuthPopup";

describe("useCloseOAuthPopup", () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  afterEach(() => {
    closeMock.mockReset();
    openerLocalStorageSetItemMock.mockReset();
    openerReloadMock.mockReset();
    useConvexAuthMock.mockReset();
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
  });

  it("redirects the opener to the dashboard after popup auth completes on the dashboard route", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true });
    const openerLocation = {
      href: "https://noter.md/",
      reload: openerReloadMock,
    };
    Object.defineProperty(globalThis, "window", {
      value: {
        close: closeMock,
        opener: {
          localStorage: {
            setItem: openerLocalStorageSetItemMock,
          },
          location: openerLocation,
        },
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        __convexAuthAccessToken: "token",
        getItem: vi.fn(() => "token"),
      },
      configurable: true,
    });

    useCloseOAuthPopup("/home", true);

    expect(openerLocalStorageSetItemMock).toHaveBeenCalledWith("__convexAuthAccessToken", "token");
    expect(openerLocation.href).toBe("/home");
    expect(openerReloadMock).not.toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
