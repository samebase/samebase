import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  buildPathWithTanStackSearch,
  parseTanStackSearch,
  stringifyTanStackSearch,
} from "./lib/tanstackSearchParams";

const {
  buildLocationMock,
  localStorageRemoveItemMock,
  localStorageSetItemMock,
  replaceStateMock,
  resetMock,
  signInMock,
  signOutMock,
} = vi.hoisted(() => ({
  buildLocationMock: vi.fn(),
  localStorageRemoveItemMock: vi.fn(),
  localStorageSetItemMock: vi.fn(),
  replaceStateMock: vi.fn(),
  resetMock: vi.fn(),
  signInMock: vi.fn(),
  signOutMock: vi.fn(),
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

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: signInMock,
    signOut: signOutMock,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    buildLocation: buildLocationMock,
  }),
}));

import {
  openAuthPopup,
  signInWithAgentBrowserHandoffAction,
  signOutWithAnalytics,
  useAutoSignIn,
} from "./authClient";

describe("useAutoSignIn", () => {
  afterEach(() => {
    buildLocationMock.mockReset();
    signInMock.mockReset();
    signOutMock.mockReset();
    resetMock.mockReset();
    replaceStateMock.mockReset();
    localStorageRemoveItemMock.mockReset();
    localStorageSetItemMock.mockReset();
    vi.unstubAllGlobals();
  });

  function mockCurrentRouteLocationBuilder() {
    buildLocationMock.mockImplementation(
      (options: {
        hash?: true;
        search?: (currentSearch: Record<string, unknown>) => Record<string, unknown>;
        to?: string;
      }) => {
        const currentSearch = parseTanStackSearch(window.location.search);
        const nextSearch =
          typeof options.search === "function" ? options.search(currentSearch) : currentSearch;
        return {
          href: buildPathWithTanStackSearch({
            pathname:
              typeof options.to === "string" && options.to !== "."
                ? options.to
                : window.location.pathname,
            search: nextSearch,
            hash: options.hash === true ? window.location.hash : undefined,
          }),
        };
      },
    );
  }

  it.each(["google", "github"] as const)(
    "passes redirectTo when auto-starting %s auth from the popup or shell route",
    (provider) => {
      const popupSearch = stringifyTanStackSearch({
        mcp_consent_request: "mcpar_test",
        mcp_login_required: "1",
        auth: provider,
      });
      const expectedRedirectTo = buildPathWithTanStackSearch({
        pathname: "/",
        search: {
          mcp_consent_request: "mcpar_test",
          mcp_login_required: "1",
        },
      });

      vi.stubGlobal("window", {
        location: {
          pathname: "/",
          search: popupSearch,
          hash: "",
        },
        history: {
          state: { __TSR_index: 7, __TSR_key: "popup-route" },
          replaceState: replaceStateMock,
        },
      });

      mockCurrentRouteLocationBuilder();

      useAutoSignIn({ auth: provider });

      expect(replaceStateMock).toHaveBeenCalledWith(
        { __TSR_index: 7, __TSR_key: "popup-route" },
        "",
        expectedRedirectTo,
      );
      expect(signInMock).toHaveBeenCalledWith(provider, {
        redirectTo: expectedRedirectTo,
      });
    },
  );

  it.each(["google", "github"] as const)(
    "preserves the public signup marker when popup %s auth auto-starts",
    (provider) => {
      const popupSearch = stringifyTanStackSearch({
        auth: provider,
        signup: provider,
      });
      const expectedRedirectTo = buildPathWithTanStackSearch({
        pathname: "/",
        search: {
          signup: provider,
        },
      });

      vi.stubGlobal("window", {
        location: {
          pathname: "/",
          search: popupSearch,
          hash: "",
        },
        history: {
          state: { __TSR_index: 8, __TSR_key: "signup-route" },
          replaceState: replaceStateMock,
        },
      });

      mockCurrentRouteLocationBuilder();

      useAutoSignIn({ auth: provider, signup: provider });

      expect(replaceStateMock).toHaveBeenCalledWith(
        { __TSR_index: 8, __TSR_key: "signup-route" },
        "",
        expectedRedirectTo,
      );
      expect(signInMock).toHaveBeenCalledWith(provider, {
        redirectTo: expectedRedirectTo,
      });
    },
  );

  it.each(["google", "github"] as const)(
    "preserves the dashboard return marker when public %s auth auto-starts",
    (provider) => {
      const popupSearch = stringifyTanStackSearch({
        auth: provider,
        "auth-return": "dashboard",
        signup: provider,
      });
      const expectedRedirectTo = buildPathWithTanStackSearch({
        pathname: "/",
        search: {
          "auth-return": "dashboard",
          signup: provider,
        },
      });

      vi.stubGlobal("window", {
        location: {
          pathname: "/",
          search: popupSearch,
          hash: "",
        },
        history: {
          state: { __TSR_index: 9, __TSR_key: "dashboard-return" },
          replaceState: replaceStateMock,
        },
      });

      mockCurrentRouteLocationBuilder();

      useAutoSignIn({
        auth: provider,
        "auth-return": "dashboard",
        signup: provider,
      });

      expect(replaceStateMock).toHaveBeenCalledWith(
        { __TSR_index: 9, __TSR_key: "dashboard-return" },
        "",
        expectedRedirectTo,
      );
      expect(signInMock).toHaveBeenCalledWith(provider, {
        redirectTo: expectedRedirectTo,
      });
    },
  );

  it("does nothing when the routed auth search is absent", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/pricing",
        search: "",
        hash: "",
      },
      history: {
        replaceState: replaceStateMock,
      },
    });

    useAutoSignIn({});

    expect(replaceStateMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("accepts only a completed browser handoff sign-in", async () => {
    signInMock.mockResolvedValue({ signingIn: true });

    await expect(
      signInWithAgentBrowserHandoffAction({
        signIn: signInMock,
        token: `agbh_${"a".repeat(43)}`,
      }),
    ).resolves.toBeUndefined();

    expect(signInMock).toHaveBeenCalledWith("agent-browser-handoff", {
      token: `agbh_${"a".repeat(43)}`,
    });
  });

  it("rejects a browser handoff when Convex Auth creates no session", async () => {
    signInMock.mockResolvedValue({ signingIn: false });

    await expect(
      signInWithAgentBrowserHandoffAction({
        signIn: signInMock,
        token: `agbh_${"a".repeat(43)}`,
      }),
    ).rejects.toThrow("Browser handoff is invalid or no longer available.");
  });

  it("always signs out even if PostHog reset throws", async () => {
    const resetError = new Error("reset failed");
    resetMock.mockImplementation(() => {
      throw resetError;
    });
    signOutMock.mockResolvedValue(undefined);

    await expect(
      signOutWithAnalytics({
        signOut: signOutMock,
        posthog: { reset: resetMock },
      }),
    ).resolves.toBeUndefined();

    expect(resetMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("redirects the opener when popup token fallback carries a dashboard redirect", () => {
    let messageHandler: ((event: MessageEvent) => void) | undefined;
    const locationReloadMock = vi.fn();
    const locationState = {
      href: "https://samebase.com/",
      origin: "https://samebase.com",
      reload: locationReloadMock,
    };
    const popupSource = new MessageChannel().port1;
    vi.stubGlobal("window", {
      addEventListener: vi.fn((eventName: string, handler: (event: MessageEvent) => void) => {
        if (eventName === "message") {
          messageHandler = handler;
        }
      }),
      clearInterval: vi.fn(),
      clearTimeout: vi.fn(),
      location: locationState,
      open: vi.fn(() => popupSource),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(() => 1),
      setTimeout: vi.fn(() => 2),
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      removeItem: localStorageRemoveItemMock,
      setItem: localStorageSetItemMock,
    });

    openAuthPopup("google", { popupPath: "/?auth=google" });
    if (!messageHandler) {
      throw new Error("Expected popup message handler to be registered.");
    }
    messageHandler(
      new MessageEvent("message", {
        data: {
          redirectTo: "/?auth-return=dashboard&prod-ui&signup=google",
          tokens: {
            __convexAuthAccessToken: "token",
          },
          type: "convex-auth-tokens",
        },
        origin: "https://samebase.com",
        source: popupSource,
      }),
    );

    expect(localStorageSetItemMock).toHaveBeenCalledWith("__convexAuthAccessToken", "token");
    expect(locationState.href).toBe("/?auth-return=dashboard&prod-ui&signup=google");
    expect(locationReloadMock).not.toHaveBeenCalled();
  });

  it("rejects untrusted popup redirect values after storing fallback auth tokens", () => {
    let messageHandler: ((event: MessageEvent) => void) | undefined;
    const locationReloadMock = vi.fn();
    const locationState = {
      href: "https://samebase.com/",
      origin: "https://samebase.com",
      reload: locationReloadMock,
    };
    const popupSource = new MessageChannel().port1;
    vi.stubGlobal("window", {
      addEventListener: vi.fn((eventName: string, handler: (event: MessageEvent) => void) => {
        if (eventName === "message") {
          messageHandler = handler;
        }
      }),
      clearInterval: vi.fn(),
      clearTimeout: vi.fn(),
      location: locationState,
      open: vi.fn(() => popupSource),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(() => 1),
      setTimeout: vi.fn(() => 2),
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      removeItem: localStorageRemoveItemMock,
      setItem: localStorageSetItemMock,
    });

    openAuthPopup("google", { popupPath: "/?auth=google" });
    if (!messageHandler) {
      throw new Error("Expected popup message handler to be registered.");
    }
    messageHandler(
      new MessageEvent("message", {
        data: {
          redirectTo: "https://evil.test/vault",
          tokens: {
            __convexAuthAccessToken: "token",
          },
          type: "convex-auth-tokens",
        },
        origin: "https://samebase.com",
        source: popupSource,
      }),
    );

    expect(localStorageSetItemMock).toHaveBeenCalledWith("__convexAuthAccessToken", "token");
    expect(locationState.href).toBe("https://samebase.com/");
    expect(locationReloadMock).toHaveBeenCalledTimes(1);
  });

  it("does not reload or redirect when popup fallback token storage fails", () => {
    let messageHandler: ((event: MessageEvent) => void) | undefined;
    const locationReloadMock = vi.fn();
    const locationState = {
      href: "https://samebase.com/",
      origin: "https://samebase.com",
      reload: locationReloadMock,
    };
    const popupSource = new MessageChannel().port1;
    vi.stubGlobal("window", {
      addEventListener: vi.fn((eventName: string, handler: (event: MessageEvent) => void) => {
        if (eventName === "message") {
          messageHandler = handler;
        }
      }),
      clearInterval: vi.fn(),
      clearTimeout: vi.fn(),
      location: locationState,
      open: vi.fn(() => popupSource),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(() => 1),
      setTimeout: vi.fn(() => 2),
    });
    localStorageSetItemMock.mockImplementation((key: string) => {
      if (key === "__convexAuthAccessToken") {
        throw new Error("storage denied");
      }
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      removeItem: localStorageRemoveItemMock,
      setItem: localStorageSetItemMock,
    });

    openAuthPopup("google", { popupPath: "/?auth=google" });
    if (!messageHandler) {
      throw new Error("Expected popup message handler to be registered.");
    }
    messageHandler(
      new MessageEvent("message", {
        data: {
          redirectTo: "/vault?prod-ui",
          tokens: {
            __convexAuthRefreshToken: "refresh",
            __convexAuthAccessToken: "token",
          },
          type: "convex-auth-tokens",
        },
        origin: "https://samebase.com",
        source: popupSource,
      }),
    );

    expect(localStorageSetItemMock).toHaveBeenCalledWith("__convexAuthRefreshToken", "refresh");
    expect(localStorageSetItemMock).toHaveBeenCalledWith("__convexAuthAccessToken", "token");
    expect(localStorageRemoveItemMock).toHaveBeenCalledWith("__convexAuthRefreshToken");
    expect(localStorageRemoveItemMock).toHaveBeenCalledWith("__convexAuthAccessToken");
    expect(locationState.href).toBe("https://samebase.com/");
    expect(locationReloadMock).not.toHaveBeenCalled();
  });
});
