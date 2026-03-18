import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPathWithQuery,
  buildSearchString,
  cloneQueryParams,
  setQueryParam,
} from "./lib/queryParams";

const { openAuthPopupMock, setAuthProviderMock, signInMock } = vi.hoisted(
  () => ({
    openAuthPopupMock: vi.fn(),
    setAuthProviderMock: vi.fn(),
    signInMock: vi.fn(),
  }),
);

vi.mock("@/authClient", () => ({
  isInIframe: () => false,
  openAuthPopup: openAuthPopupMock,
  setAuthProvider: setAuthProviderMock,
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: signInMock,
  }),
}));

import { SignInWithGoogle } from "./SignInForm";

describe("SignInWithGoogle", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    signInMock.mockReset();
    setAuthProviderMock.mockReset();
    openAuthPopupMock.mockReset();
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
  });

  it("preserves the MCP consent route when starting top-level Google auth", () => {
    const consentSearchParams = cloneQueryParams();
    setQueryParam(consentSearchParams, "mcp_consent_request", "mcpar_test");
    setQueryParam(consentSearchParams, "mcp_login_required", "1");
    const consentSearch = buildSearchString(consentSearchParams);

    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          origin: "https://noter.md",
          pathname: "/oauth/mcp/consent",
          search: consentSearch,
          hash: "",
        },
      },
      configurable: true,
    });

    const element = SignInWithGoogle();
    const expectedRedirectTo = buildPathWithQuery({
      pathname: "/oauth/mcp/consent",
      search: consentSearch,
    });

    element.props.onClick();

    expect(setAuthProviderMock).toHaveBeenCalledWith("google");
    expect(signInMock).toHaveBeenCalledWith("google", {
      redirectTo: expectedRedirectTo,
    });
    expect(openAuthPopupMock).not.toHaveBeenCalled();
  });
});
