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
  signInWithPasswordAction,
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

  it("passes redirectTo when auto-starting Google auth from the popup or shell route", () => {
    const popupSearch = stringifyTanStackSearch({
      mcp_consent_request: "mcpar_test",
      mcp_login_required: "1",
      auth: "google",
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

    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      removeItem: localStorageRemoveItemMock,
      setItem: localStorageSetItemMock,
    });
    mockCurrentRouteLocationBuilder();

    useAutoSignIn({ auth: "google" });

    expect(localStorageSetItemMock).toHaveBeenCalledWith("samebase_auth_provider", "google");
    expect(replaceStateMock).toHaveBeenCalledWith(
      { __TSR_index: 7, __TSR_key: "popup-route" },
      "",
      expectedRedirectTo,
    );
    expect(signInMock).toHaveBeenCalledWith("google", {
      redirectTo: expectedRedirectTo,
    });
  });

  it("preserves the public signup marker when popup Google auth auto-starts", () => {
    const popupSearch = stringifyTanStackSearch({
      auth: "google",
      signup: "google",
    });
    const expectedRedirectTo = buildPathWithTanStackSearch({
      pathname: "/",
      search: {
        signup: "google",
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

    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      removeItem: localStorageRemoveItemMock,
      setItem: localStorageSetItemMock,
    });
    mockCurrentRouteLocationBuilder();

    useAutoSignIn({ auth: "google", signup: "google" });

    expect(replaceStateMock).toHaveBeenCalledWith(
      { __TSR_index: 8, __TSR_key: "signup-route" },
      "",
      expectedRedirectTo,
    );
    expect(signInMock).toHaveBeenCalledWith("google", {
      redirectTo: expectedRedirectTo,
    });
  });

  it("preserves the dashboard return marker when public Google auth auto-starts", () => {
    const popupSearch = stringifyTanStackSearch({
      auth: "google",
      "auth-return": "dashboard",
      signup: "google",
    });
    const expectedRedirectTo = buildPathWithTanStackSearch({
      pathname: "/vault",
      search: {
        signup: "google",
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

    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      removeItem: localStorageRemoveItemMock,
      setItem: localStorageSetItemMock,
    });
    mockCurrentRouteLocationBuilder();

    useAutoSignIn({
      auth: "google",
      "auth-return": "dashboard",
      signup: "google",
    });

    expect(replaceStateMock).toHaveBeenCalledWith(
      { __TSR_index: 9, __TSR_key: "dashboard-return" },
      "",
      expectedRedirectTo,
    );
    expect(signInMock).toHaveBeenCalledWith("google", {
      redirectTo: expectedRedirectTo,
    });
  });

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

    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      removeItem: localStorageRemoveItemMock,
      setItem: localStorageSetItemMock,
    });

    useAutoSignIn({});

    expect(localStorageSetItemMock).not.toHaveBeenCalled();
    expect(replaceStateMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("records the password provider after a successful password sign-in", async () => {
    signInMock.mockResolvedValue(undefined);

    vi.stubGlobal("localStorage", {
      removeItem: localStorageRemoveItemMock,
      setItem: localStorageSetItemMock,
    });

    await signInWithPasswordAction({
      signIn: signInMock,
      flow: "signIn",
      email: "nicu@samebase.com",
      password: "pass1234",
    });

    expect(signInMock).toHaveBeenCalledWith("password", {
      flow: "signIn",
      email: "nicu@samebase.com",
      password: "pass1234",
    });
    expect(localStorageSetItemMock).toHaveBeenCalledWith("samebase_auth_provider", "password");
  });

  it("always signs out even if PostHog reset throws", async () => {
    const resetError = new Error("reset failed");
    resetMock.mockImplementation(() => {
      throw resetError;
    });
    signOutMock.mockResolvedValue(undefined);

    vi.stubGlobal("localStorage", {
      removeItem: localStorageRemoveItemMock,
      setItem: localStorageSetItemMock,
    });

    await expect(
      signOutWithAnalytics({
        signOut: signOutMock,
        posthog: { reset: resetMock },
      }),
    ).resolves.toBeUndefined();

    expect(localStorageRemoveItemMock).toHaveBeenCalledWith("samebase_was_authenticated");
    expect(localStorageRemoveItemMock).toHaveBeenCalledWith("samebase_auth_provider");
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
          redirectTo: "/vault?prod-ui",
          tokens: {
            __convexAuthAccessToken: "token",
          },
          type: "convex-auth-tokens",
        },
        origin: "https://samebase.com",
        source: popupSource,
      }),
    );

    expect(localStorageSetItemMock).toHaveBeenCalledWith("samebase_auth_provider", "google");
    expect(localStorageSetItemMock).toHaveBeenCalledWith("__convexAuthAccessToken", "token");
    expect(locationState.href).toBe("/vault?prod-ui");
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

    expect(localStorageSetItemMock).toHaveBeenCalledWith("samebase_auth_provider", "google");
    expect(localStorageSetItemMock).toHaveBeenCalledWith("__convexAuthRefreshToken", "refresh");
    expect(localStorageSetItemMock).toHaveBeenCalledWith("__convexAuthAccessToken", "token");
    expect(localStorageRemoveItemMock).toHaveBeenCalledWith("__convexAuthRefreshToken");
    expect(localStorageRemoveItemMock).toHaveBeenCalledWith("__convexAuthAccessToken");
    expect(localStorageRemoveItemMock).toHaveBeenCalledWith("samebase_auth_provider");
    expect(locationState.href).toBe("https://samebase.com/");
    expect(locationReloadMock).not.toHaveBeenCalled();
  });

  it("clears the pending provider marker when the popup is blocked", () => {
    const locationReloadMock = vi.fn();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      clearInterval: vi.fn(),
      clearTimeout: vi.fn(),
      location: {
        href: "https://samebase.com/",
        origin: "https://samebase.com",
        reload: locationReloadMock,
      },
      open: vi.fn(() => null),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(() => 1),
      setTimeout: vi.fn(() => 2),
    });
    vi.stubGlobal("localStorage", {
      removeItem: localStorageRemoveItemMock,
      setItem: localStorageSetItemMock,
    });

    openAuthPopup("google", { popupPath: "/?auth=google" });

    expect(localStorageSetItemMock).toHaveBeenCalledWith("samebase_auth_provider", "google");
    expect(localStorageRemoveItemMock).toHaveBeenCalledWith("samebase_auth_provider");
    expect(locationReloadMock).not.toHaveBeenCalled();
  });
});
