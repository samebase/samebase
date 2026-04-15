import { afterEach, describe, expect, it, vi } from "vitest";

const {
  replaceStateMock,
  useAutoSignInMock,
  useCloseOAuthPopupMock,
  useConvexAuthMock,
} = vi.hoisted(() => ({
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
    replaceStateMock.mockReset();
    useAutoSignInMock.mockReset();
    useCloseOAuthPopupMock.mockReset();
    useConvexAuthMock.mockReset();
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
  });

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
          replaceState: replaceStateMock,
        },
      },
      configurable: true,
    });

    useAppAuthRuntimeEffects("/", {
      "prod-ui": true,
      signup: "google",
    });

    expect(useAutoSignInMock).toHaveBeenCalledWith(undefined);
    expect(useCloseOAuthPopupMock).toHaveBeenCalledWith("/", true);
    expect(replaceStateMock).toHaveBeenCalledWith({}, "", "/?prod-ui#top");
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

    expect(replaceStateMock).not.toHaveBeenCalled();
  });
});
