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
  sessionStorageSetItemMock,
  signInMock,
  signOutMock,
} = vi.hoisted(() => ({
  buildLocationMock: vi.fn(),
  localStorageRemoveItemMock: vi.fn(),
  localStorageSetItemMock: vi.fn(),
  replaceStateMock: vi.fn(),
  resetMock: vi.fn(),
  sessionStorageSetItemMock: vi.fn(),
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

import { signInWithPasswordAction, signOutWithAnalytics, useAutoSignIn } from "./authClient";

describe("useAutoSignIn", () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  afterEach(() => {
    buildLocationMock.mockReset();
    signInMock.mockReset();
    signOutMock.mockReset();
    resetMock.mockReset();
    replaceStateMock.mockReset();
    localStorageRemoveItemMock.mockReset();
    localStorageSetItemMock.mockReset();
    sessionStorageSetItemMock.mockReset();
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
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

    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/",
          search: popupSearch,
          hash: "",
        },
        history: {
          state: { __TSR_index: 7, __TSR_key: "popup-route" },
          replaceState: replaceStateMock,
        },
      },
      configurable: true,
    });

    Object.defineProperty(globalThis, "localStorage", {
      value: {
        removeItem: localStorageRemoveItemMock,
        setItem: localStorageSetItemMock,
      },
      configurable: true,
    });
    mockCurrentRouteLocationBuilder();

    useAutoSignIn({ auth: "google" });

    expect(localStorageSetItemMock).toHaveBeenCalledWith("noter_auth_provider", "google");
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

    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/",
          search: popupSearch,
          hash: "",
        },
        history: {
          state: { __TSR_index: 8, __TSR_key: "signup-route" },
          replaceState: replaceStateMock,
        },
      },
      configurable: true,
    });

    Object.defineProperty(globalThis, "localStorage", {
      value: {
        removeItem: localStorageRemoveItemMock,
        setItem: localStorageSetItemMock,
      },
      configurable: true,
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
      pathname: "/",
      search: {
        "auth-return": "dashboard",
        signup: "google",
      },
    });

    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/",
          search: popupSearch,
          hash: "",
        },
        history: {
          state: { __TSR_index: 9, __TSR_key: "dashboard-return" },
          replaceState: replaceStateMock,
        },
        sessionStorage: {
          setItem: sessionStorageSetItemMock,
        },
      },
      configurable: true,
    });

    Object.defineProperty(globalThis, "localStorage", {
      value: {
        removeItem: localStorageRemoveItemMock,
        setItem: localStorageSetItemMock,
      },
      configurable: true,
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
    expect(sessionStorageSetItemMock).toHaveBeenCalledWith(
      "noter_public_dashboard_auth_return",
      expect.stringMatching(/^top-level:\d+$/),
    );
  });

  it("does nothing when the routed auth search is absent", () => {
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/pricing",
          search: "",
          hash: "",
        },
        history: {
          replaceState: replaceStateMock,
        },
      },
      configurable: true,
    });

    Object.defineProperty(globalThis, "localStorage", {
      value: {
        removeItem: localStorageRemoveItemMock,
        setItem: localStorageSetItemMock,
      },
      configurable: true,
    });

    useAutoSignIn({});

    expect(localStorageSetItemMock).not.toHaveBeenCalled();
    expect(replaceStateMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("records the password provider after a successful password sign-in", async () => {
    signInMock.mockResolvedValue(undefined);

    Object.defineProperty(globalThis, "localStorage", {
      value: {
        removeItem: localStorageRemoveItemMock,
        setItem: localStorageSetItemMock,
      },
      configurable: true,
    });

    await signInWithPasswordAction({
      signIn: signInMock,
      flow: "signIn",
      email: "nicu@noter.md",
      password: "pass1234",
    });

    expect(signInMock).toHaveBeenCalledWith("password", {
      flow: "signIn",
      email: "nicu@noter.md",
      password: "pass1234",
    });
    expect(localStorageSetItemMock).toHaveBeenCalledWith("noter_auth_provider", "password");
  });

  it("always signs out even if PostHog reset throws", async () => {
    const resetError = new Error("reset failed");
    resetMock.mockImplementation(() => {
      throw resetError;
    });
    signOutMock.mockResolvedValue(undefined);

    Object.defineProperty(globalThis, "localStorage", {
      value: {
        removeItem: localStorageRemoveItemMock,
        setItem: localStorageSetItemMock,
      },
      configurable: true,
    });

    await expect(
      signOutWithAnalytics({
        signOut: signOutMock,
        posthog: { reset: resetMock },
      }),
    ).resolves.toBeUndefined();

    expect(localStorageRemoveItemMock).toHaveBeenCalledWith("noter_was_authenticated");
    expect(localStorageRemoveItemMock).toHaveBeenCalledWith("noter_auth_provider");
    expect(resetMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
