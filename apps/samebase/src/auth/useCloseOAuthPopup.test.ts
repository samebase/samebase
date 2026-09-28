import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const {
  closeMock,
  openerLocalStorageSetItemMock,
  openerPostMessageMock,
  openerReloadMock,
  useConvexAuthMock,
} = vi.hoisted(() => ({
  closeMock: vi.fn(),
  openerLocalStorageSetItemMock: vi.fn(),
  openerPostMessageMock: vi.fn(),
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
  afterEach(() => {
    closeMock.mockReset();
    openerLocalStorageSetItemMock.mockReset();
    openerPostMessageMock.mockReset();
    openerReloadMock.mockReset();
    useConvexAuthMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("returns the public dashboard marker to the opener after popup auth completes", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true });
    const openerLocation = {
      href: "https://samebase.com/",
      origin: "https://samebase.com",
      reload: openerReloadMock,
    };
    vi.stubGlobal("window", {
      close: closeMock,
      location: {
        hash: "#ready",
        origin: "https://samebase.com",
        pathname: "/",
        search: "?auth-return=dashboard&prod-ui&signup=github",
      },
      opener: {
        localStorage: {
          setItem: openerLocalStorageSetItemMock,
        },
        location: openerLocation,
      },
    });
    vi.stubGlobal("localStorage", {
      __convexAuthAccessToken: "token",
      getItem: vi.fn(() => "token"),
    });

    useCloseOAuthPopup("/", "dashboard", true);

    expect(openerLocalStorageSetItemMock).toHaveBeenCalledWith("__convexAuthAccessToken", "token");
    expect(openerLocation.href).toBe("/?auth-return=dashboard&prod-ui&signup=github#ready");
    expect(openerReloadMock).not.toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("uses same-origin postMessage fallback when opener storage is unavailable", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true });
    const opener = {
      location: {
        href: "https://samebase.com/",
        origin: "https://samebase.com",
        reload: openerReloadMock,
      },
      postMessage: openerPostMessageMock,
    };
    Object.defineProperty(opener, "localStorage", {
      get: () => {
        throw new Error("storage denied");
      },
      configurable: true,
    });
    vi.stubGlobal("window", {
      close: closeMock,
      location: {
        hash: "",
        origin: "https://samebase.com",
        pathname: "/",
        search: "?auth-return=dashboard&prod-ui&signup=google",
      },
      opener,
    });
    vi.stubGlobal("localStorage", {
      __convexAuthAccessToken: "token",
      getItem: vi.fn(() => "token"),
    });

    useCloseOAuthPopup("/", "dashboard", true);

    expect(openerPostMessageMock).toHaveBeenCalledWith(
      {
        redirectTo: "/?auth-return=dashboard&prod-ui&signup=google",
        type: "convex-auth-tokens",
        tokens: {
          __convexAuthAccessToken: "token",
        },
      },
      "https://samebase.com",
    );
    expect(openerReloadMock).not.toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("does not relay tokens to a cross-origin opener", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true });
    vi.stubGlobal("window", {
      close: closeMock,
      location: {
        hash: "",
        origin: "https://samebase.com",
        pathname: "/",
        search: "?auth-return=dashboard&signup=google",
      },
      opener: {
        localStorage: {
          setItem: openerLocalStorageSetItemMock,
        },
        location: {
          href: "https://evil.test/",
          origin: "https://evil.test",
          reload: openerReloadMock,
        },
        postMessage: openerPostMessageMock,
      },
    });
    vi.stubGlobal("localStorage", {
      __convexAuthAccessToken: "token",
      getItem: vi.fn(() => "token"),
    });

    useCloseOAuthPopup("/", "dashboard", true);

    expect(openerLocalStorageSetItemMock).not.toHaveBeenCalled();
    expect(openerPostMessageMock).not.toHaveBeenCalled();
    expect(openerReloadMock).not.toHaveBeenCalled();
    expect(closeMock).not.toHaveBeenCalled();
  });
});
