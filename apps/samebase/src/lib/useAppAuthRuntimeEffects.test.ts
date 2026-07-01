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
  afterEach(() => {
    buildLocationMock.mockReset();
    navigateMock.mockReset();
    replaceStateMock.mockReset();
    useAutoSignInMock.mockReset();
    useCloseOAuthPopupMock.mockReset();
    useConvexAuthMock.mockReset();
    vi.unstubAllGlobals();
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

  it("clears the Google signup marker after successful authentication away from root", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
    vi.stubGlobal("window", {
      location: {
        pathname: "/pricing",
        search: "?prod-ui&signup=google",
        hash: "#top",
      },
      history: {
        state: { __TSR_index: 4, __TSR_key: "landing" },
        replaceState: replaceStateMock,
      },
    });
    mockCurrentRouteLocationBuilder();

    useAppAuthRuntimeEffects("/pricing", {
      "prod-ui": true,
      signup: "google",
    });

    expect(useAutoSignInMock).toHaveBeenCalledWith({
      "prod-ui": true,
      signup: "google",
    });
    expect(useCloseOAuthPopupMock).toHaveBeenCalledWith("/pricing", true);
    expect(replaceStateMock).toHaveBeenCalledWith(
      { __TSR_index: 4, __TSR_key: "landing" },
      "",
      "/pricing?prod-ui#top",
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("leaves the URL alone while still unauthenticated", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });
    vi.stubGlobal("window", {
      location: {
        pathname: "/",
        search: "?signup=google",
        hash: "",
      },
      history: {
        replaceState: replaceStateMock,
      },
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
    vi.stubGlobal("window", {
      location: {
        pathname: "/vault",
        search: "?delete",
        hash: "#vaults",
      },
      history: {
        replaceState: replaceStateMock,
      },
    });

    useAppAuthRuntimeEffects("/vault", {
      delete: true,
    });

    expect(navigateMock).toHaveBeenCalledWith({
      href: "/",
      replace: true,
      state: true,
    });
    expect(replaceStateMock).not.toHaveBeenCalled();
  });

  it("preserves failed public Google signup returns when redirecting signed-out dashboard loads", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });
    vi.stubGlobal("window", {
      location: {
        pathname: "/vault",
        search: "?signup=google",
        hash: "",
      },
      history: {
        replaceState: replaceStateMock,
      },
    });

    useAppAuthRuntimeEffects("/vault", {
      signup: "google",
    });

    expect(navigateMock).toHaveBeenCalledWith({
      replace: true,
      search: expect.any(Function),
      state: true,
      to: "/",
    });
    const navigateOptions = navigateMock.mock.calls[0]?.[0];
    if (!navigateOptions || typeof navigateOptions.search !== "function") {
      throw new Error("Expected failed signup redirect with search updater.");
    }
    expect(
      navigateOptions.search({
        "auth-return": "dashboard",
        "prod-ui": true,
        signup: "google",
      }),
    ).toEqual({
      auth: undefined,
      "auth-return": undefined,
      "create-account": undefined,
      "prod-ui": true,
      signup: "google",
      "sign-in": undefined,
    });
    expect(replaceStateMock).not.toHaveBeenCalled();
  });

  it("keeps authenticated root loads on the public landing route without the dashboard return marker", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
    vi.stubGlobal("window", {
      location: {
        pathname: "/",
        search: "",
        hash: "",
      },
      history: {
        replaceState: replaceStateMock,
      },
    });

    useAppAuthRuntimeEffects("/", {});

    expect(navigateMock).not.toHaveBeenCalled();
    expect(replaceStateMock).not.toHaveBeenCalled();
  });

  it("does not redirect authenticated root loads from the old dashboard return URL", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
    vi.stubGlobal("window", {
      location: {
        pathname: "/",
        search: "?auth-return=dashboard",
        hash: "",
      },
      history: {
        replaceState: replaceStateMock,
      },
    });

    useAppAuthRuntimeEffects("/", {
      "auth-return": "dashboard",
    });

    expect(navigateMock).not.toHaveBeenCalled();
    expect(replaceStateMock).not.toHaveBeenCalled();
  });

  it("waits for auth loading before redirecting dashboard loads", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: true });
    vi.stubGlobal("window", {
      location: {
        pathname: "/vault",
        search: "",
        hash: "",
      },
      history: {
        replaceState: replaceStateMock,
      },
    });

    useAppAuthRuntimeEffects("/vault", {});

    expect(navigateMock).not.toHaveBeenCalled();
    expect(replaceStateMock).not.toHaveBeenCalled();
  });

  it("clears the Google signup marker after successful authentication on the dashboard route", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
    vi.stubGlobal("window", {
      location: {
        pathname: "/vault",
        search: "?signup=google",
        hash: "",
      },
      history: {
        state: { __TSR_index: 9, __TSR_key: "dashboard-return" },
        replaceState: replaceStateMock,
      },
    });
    mockCurrentRouteLocationBuilder();

    useAppAuthRuntimeEffects("/vault", {
      signup: "google",
    });

    expect(replaceStateMock).toHaveBeenCalledWith(
      { __TSR_index: 9, __TSR_key: "dashboard-return" },
      "",
      "/vault",
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
