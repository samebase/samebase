import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { buildPathWithTanStackSearch, parseTanStackSearch } from "./tanstackSearchParams";

const {
  buildLocationMock,
  navigateMock,
  replaceStateMock,
  useAutoSignInMock,
  useCloseOAuthPopupMock,
  useConvexAuthMock,
} = vi.hoisted(() => ({
  buildLocationMock: vi.fn(),
  navigateMock: vi.fn(),
  replaceStateMock: vi.fn(),
  useAutoSignInMock: vi.fn(),
  useCloseOAuthPopupMock: vi.fn(),
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

vi.mock("@/authClient", () => ({
  useAutoSignIn: useAutoSignInMock,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    buildLocation: buildLocationMock,
    navigate: navigateMock,
  }),
}));

vi.mock("./useCloseOAuthPopup", () => ({
  useCloseOAuthPopup: useCloseOAuthPopupMock,
}));

vi.mock("convex/react", () => ({
  useConvexAuth: useConvexAuthMock,
}));

import { useAppAuthRuntimeEffects } from "./useAppAuthRuntimeEffects";

describe("useAppAuthRuntimeEffects", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    buildLocationMock.mockReset();
    navigateMock.mockReset();
    replaceStateMock.mockReset();
    useAutoSignInMock.mockReset();
    useCloseOAuthPopupMock.mockReset();
    useConvexAuthMock.mockReset();
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
  });

  function mockCurrentRouteLocationBuilder() {
    buildLocationMock.mockImplementation(
      (options: {
        hash?: true;
        search?: (currentSearch: Record<string, unknown>) => Record<string, unknown>;
      }) => {
        const currentSearch = parseTanStackSearch(window.location.search);
        const nextSearch =
          typeof options.search === "function" ? options.search(currentSearch) : currentSearch;
        return {
          href: buildPathWithTanStackSearch({
            pathname: window.location.pathname,
            search: nextSearch,
            hash: options.hash === true ? window.location.hash : undefined,
          }),
        };
      },
    );
  }

  it("clears the Google signup marker after successful authentication", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/",
          search: "?prod-ui&signup=google",
          hash: "#top",
        },
        history: {
          state: { __TSR_index: 4, __TSR_key: "landing" },
          replaceState: replaceStateMock,
        },
      },
      configurable: true,
    });
    mockCurrentRouteLocationBuilder();

    useAppAuthRuntimeEffects("/", {
      "prod-ui": true,
      signup: "google",
    });

    expect(useAutoSignInMock).toHaveBeenCalledWith({
      "prod-ui": true,
      signup: "google",
    });
    expect(useCloseOAuthPopupMock).toHaveBeenCalledWith("/", true);
    expect(replaceStateMock).toHaveBeenCalledWith(
      { __TSR_index: 4, __TSR_key: "landing" },
      "",
      "/?prod-ui#top",
    );
  });

  it("leaves the URL alone while still unauthenticated", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/",
          search: "?signup=google",
          hash: "",
        },
        history: {
          replaceState: replaceStateMock,
        },
      },
      configurable: true,
    });

    useAppAuthRuntimeEffects("/", {
      signup: "google",
    });

    expect(useAutoSignInMock).toHaveBeenCalledWith({
      signup: "google",
    });
    expect(navigateMock).not.toHaveBeenCalled();
    expect(replaceStateMock).not.toHaveBeenCalled();
  });

  it("redirects signed-out dashboard loads to the public root route", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/home",
          search: "?new-app",
          hash: "#vaults",
        },
        history: {
          replaceState: replaceStateMock,
        },
      },
      configurable: true,
    });

    useAppAuthRuntimeEffects("/home", {
      "new-app": true,
    });

    expect(navigateMock).toHaveBeenCalledWith({
      href: "/",
      replace: true,
      state: true,
    });
    expect(replaceStateMock).not.toHaveBeenCalled();
  });

  it("waits for auth loading before redirecting dashboard loads", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: true });
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/home",
          search: "",
          hash: "",
        },
        history: {
          replaceState: replaceStateMock,
        },
      },
      configurable: true,
    });

    useAppAuthRuntimeEffects("/home", {});

    expect(navigateMock).not.toHaveBeenCalled();
    expect(replaceStateMock).not.toHaveBeenCalled();
  });

  it("moves successful public auth handoff to the dashboard route", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/",
          search: "?auth-return=dashboard&signup=google",
          hash: "",
        },
        history: {
          replaceState: replaceStateMock,
        },
      },
      configurable: true,
    });

    useAppAuthRuntimeEffects("/", {
      "auth-return": "dashboard",
      signup: "google",
    });

    expect(navigateMock).toHaveBeenCalledWith({
      replace: true,
      search: expect.any(Function),
      state: true,
      to: "/home",
    });
    const navigateOptions = navigateMock.mock.calls[0]?.[0];
    if (!navigateOptions || typeof navigateOptions.search !== "function") {
      throw new Error("Expected dashboard navigation with search updater.");
    }
    expect(
      navigateOptions.search({
        "auth-return": "dashboard",
        "prod-ui": true,
        signup: "google",
      }),
    ).toEqual({
      "auth-return": undefined,
      "prod-ui": true,
      signup: undefined,
    });
    expect(replaceStateMock).not.toHaveBeenCalled();
  });
});
