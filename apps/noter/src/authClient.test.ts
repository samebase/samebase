import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  buildPathWithQuery,
  buildSearchString,
  cloneQueryParams,
  setQueryParam,
} from "./lib/queryParams";

const {
  localStorageRemoveItemMock,
  localStorageSetItemMock,
  replaceStateMock,
  resetMock,
  signInMock,
  signOutMock,
} = vi.hoisted(() => ({
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

import {
  signInWithPasswordAction,
  signOutWithAnalytics,
  useAutoSignIn,
} from "./authClient";

describe("useAutoSignIn", () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  afterEach(() => {
    signInMock.mockReset();
    signOutMock.mockReset();
    resetMock.mockReset();
    replaceStateMock.mockReset();
    localStorageRemoveItemMock.mockReset();
    localStorageSetItemMock.mockReset();
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
  });

  it("passes redirectTo when auto-starting Google auth from the popup or shell route", () => {
    const popupSearchParams = cloneQueryParams();
    setQueryParam(popupSearchParams, "mcp_consent_request", "mcpar_test");
    setQueryParam(popupSearchParams, "mcp_login_required", "1");
    setQueryParam(popupSearchParams, "auth", "google");
    const popupSearch = buildSearchString(popupSearchParams);
    const expectedSearchParams = cloneQueryParams(popupSearch);
    setQueryParam(expectedSearchParams, "auth", false);
    const expectedRedirectTo = buildPathWithQuery({
      pathname: "/",
      search: buildSearchString(expectedSearchParams),
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

    useAutoSignIn("google");

    expect(localStorageSetItemMock).toHaveBeenCalledWith(
      "noter_auth_provider",
      "google",
    );
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
    const popupSearchParams = cloneQueryParams();
    setQueryParam(popupSearchParams, "auth", "google");
    setQueryParam(popupSearchParams, "signup", "google");
    const popupSearch = buildSearchString(popupSearchParams);
    const expectedSearchParams = cloneQueryParams(popupSearch);
    setQueryParam(expectedSearchParams, "auth", false);
    const expectedRedirectTo = buildPathWithQuery({
      pathname: "/",
      search: buildSearchString(expectedSearchParams),
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

    useAutoSignIn("google");

    expect(replaceStateMock).toHaveBeenCalledWith(
      { __TSR_index: 8, __TSR_key: "signup-route" },
      "",
      expectedRedirectTo,
    );
    expect(signInMock).toHaveBeenCalledWith("google", {
      redirectTo: expectedRedirectTo,
    });
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

    useAutoSignIn(undefined);

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
    expect(localStorageSetItemMock).toHaveBeenCalledWith(
      "noter_auth_provider",
      "password",
    );
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

    expect(localStorageRemoveItemMock).toHaveBeenCalledWith(
      "noter_was_authenticated",
    );
    expect(localStorageRemoveItemMock).toHaveBeenCalledWith(
      "noter_auth_provider",
    );
    expect(resetMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
