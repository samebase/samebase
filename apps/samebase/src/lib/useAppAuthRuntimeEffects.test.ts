import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { buildPathWithTanStackSearch, parseTanStackSearch } from "./tanstackSearchParams";

const { buildLocationMock, navigateMock, replaceStateMock, useAutoSignInMock, useConvexAuthMock } =
  vi.hoisted(() => ({
    buildLocationMock: vi.fn(),
    navigateMock: vi.fn(),
    replaceStateMock: vi.fn(),
    useAutoSignInMock: vi.fn(),
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
        pathname: "/settings",
        search: "?prod-ui&signup=google",
        hash: "#top",
      },
      history: {
        state: { __TSR_index: 4, __TSR_key: "landing" },
        replaceState: replaceStateMock,
      },
    });
    mockCurrentRouteLocationBuilder();

    useAppAuthRuntimeEffects({
      "prod-ui": true,
      signup: "google",
    });

    expect(useAutoSignInMock).toHaveBeenCalledWith({
      "prod-ui": true,
      signup: "google",
    });
    expect(replaceStateMock).toHaveBeenCalledWith(
      { __TSR_index: 4, __TSR_key: "landing" },
      "",
      "/settings?prod-ui#top",
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("leaves the URL alone while still unauthenticated", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });
    vi.stubGlobal("window", {
      location: {
        pathname: "/settings",
        search: "?signup=google",
        hash: "",
      },
      history: {
        replaceState: replaceStateMock,
      },
    });

    useAppAuthRuntimeEffects({
      signup: "google",
    });

    expect(useAutoSignInMock).toHaveBeenCalledWith({
      signup: "google",
    });
    expect(navigateMock).not.toHaveBeenCalled();
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

    useAppAuthRuntimeEffects({});

    expect(navigateMock).not.toHaveBeenCalled();
    expect(replaceStateMock).not.toHaveBeenCalled();
  });

  it("redirects an authenticated public OAuth return to the dashboard", () => {
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

    useAppAuthRuntimeEffects({
      "auth-return": "dashboard",
    });

    expect(navigateMock).toHaveBeenCalledWith({
      replace: true,
      search: expect.any(Function),
      state: true,
      to: "/repo",
    });
    const navigateOptions = navigateMock.mock.calls[0]?.[0];
    if (!navigateOptions || typeof navigateOptions.search !== "function") {
      throw new Error("Expected dashboard return navigation with a search updater.");
    }
    expect(
      navigateOptions.search({
        "auth-return": "dashboard",
        "prod-ui": true,
        signup: "github",
      }),
    ).toEqual({
      auth: undefined,
      "auth-return": undefined,
      "prod-ui": true,
      signup: undefined,
    });
    expect(replaceStateMock).not.toHaveBeenCalled();
  });

  it("returns to the gated page in next once the session is confirmed", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });

    useAppAuthRuntimeEffects({
      "auth-return": "dashboard",
      next: "/settings?checkout=success",
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith({
      href: "/settings?checkout=success",
      replace: true,
    });
  });

  it("keeps next until the session is confirmed", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: true });

    useAppAuthRuntimeEffects({ next: "/settings" });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("ignores a next that leaves the origin", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });

    useAppAuthRuntimeEffects({ next: "//example.com/settings" });
    useAppAuthRuntimeEffects({ next: "https://example.com/settings" });

    expect(navigateMock).not.toHaveBeenCalled();
  });
});
