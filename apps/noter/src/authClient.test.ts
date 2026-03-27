import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPathWithQuery,
  buildSearchString,
  cloneQueryParams,
  setQueryParam,
} from "./lib/queryParams";

const { localStorageSetItemMock, replaceStateMock, signInMock } = vi.hoisted(
  () => ({
    localStorageSetItemMock: vi.fn(),
    replaceStateMock: vi.fn(),
    signInMock: vi.fn(),
  }),
);

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
  }),
}));

import { useAutoSignIn } from "./authClient";

describe("useAutoSignIn", () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  afterAll(() => {
    consoleWarnSpy.mockRestore();
  });

  afterEach(() => {
    signInMock.mockReset();
    replaceStateMock.mockReset();
    localStorageSetItemMock.mockReset();
    consoleWarnSpy.mockClear();
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

    const localStorageMock = {
      setItem: localStorageSetItemMock,
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/",
          search: popupSearch,
          hash: "",
        },
        history: {
          replaceState: replaceStateMock,
        },
        localStorage: localStorageMock,
      },
      configurable: true,
    });

    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });

    useAutoSignIn();

    expect(localStorageSetItemMock).toHaveBeenCalledWith(
      "noter_auth_provider",
      "google",
    );
    expect(replaceStateMock).toHaveBeenCalledWith({}, "", expectedRedirectTo);
    expect(signInMock).toHaveBeenCalledWith("google", {
      redirectTo: expectedRedirectTo,
    });
  });

  it("still starts Google auth when local storage is unavailable", () => {
    const localStorageMock = {
      setItem: vi.fn(() => {
        throw new DOMException("Access denied", "SecurityError");
      }),
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/",
          search: "?auth=google",
          hash: "",
        },
        history: {
          replaceState: replaceStateMock,
        },
        localStorage: localStorageMock,
      },
      configurable: true,
    });

    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });

    useAutoSignIn();

    expect(replaceStateMock).toHaveBeenCalledWith({}, "", "/");
    expect(signInMock).toHaveBeenCalledWith("google", {
      redirectTo: "/",
    });
  });
});
