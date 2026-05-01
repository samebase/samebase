import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const {
  buildLocationMock,
  replaceStateMock,
  useAutoSignInMock,
  useCloseOAuthPopupMock,
  useConvexAuthMock,
} = vi.hoisted(() => ({
  buildLocationMock: vi.fn(),
  replaceStateMock: vi.fn(),
  useAutoSignInMock: vi.fn(),
  useCloseOAuthPopupMock: vi.fn(),
  useConvexAuthMock: vi.fn(),
}));

function buildSearchStringFromObject(search: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(search)) {
    if (value === false || value === null || typeof value === "undefined") {
      continue;
    }
    if (value === true) {
      searchParams.set(key, "");
      continue;
    }
    if (typeof value === "string" || typeof value === "number") {
      searchParams.set(key, `${value}`);
    }
  }

  const parts: string[] = [];
  for (const [key, value] of searchParams.entries()) {
    const encodedKey = encodeURIComponent(key);
    parts.push(
      value.length === 0
        ? encodedKey
        : `${encodedKey}=${encodeURIComponent(value)}`,
    );
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

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
        search?: (
          currentSearch: Record<string, unknown>,
        ) => Record<string, unknown>;
      }) => {
        const currentSearch = Object.fromEntries(
          new URLSearchParams(window.location.search).entries(),
        );
        const nextSearch =
          typeof options.search === "function"
            ? options.search(currentSearch)
            : currentSearch;
        return {
          href: `${window.location.pathname}${buildSearchStringFromObject(nextSearch)}${options.hash === true ? window.location.hash : ""}`,
        };
      },
    );
  }

  it("clears the Google signup marker after successful authentication", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true });
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
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false });
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
    expect(replaceStateMock).not.toHaveBeenCalled();
  });
});
