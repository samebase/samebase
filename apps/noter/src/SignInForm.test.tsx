import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPathWithQuery,
  buildSearchString,
  cloneQueryParams,
  setQueryParam,
} from "./lib/queryParams";

const { openAuthPopupMock, signInWithGoogleMock } = vi.hoisted(() => ({
  openAuthPopupMock: vi.fn(),
  signInWithGoogleMock: vi.fn(),
}));

vi.mock("@/authClient", () => ({
  isInIframe: () => false,
  openAuthPopup: openAuthPopupMock,
  useNoterAuthActions: () => ({
    signInWithGoogle: signInWithGoogleMock,
  }),
}));

import { SignInWithGoogle } from "./SignInWithGoogle";

describe("SignInWithGoogle", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    signInWithGoogleMock.mockReset();
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
    setQueryParam(consentSearchParams, "auth", "google");
    const consentSearch = buildSearchString(consentSearchParams);
    const expectedSearchParams = cloneQueryParams(consentSearch);
    setQueryParam(expectedSearchParams, "auth", false);

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
      search: buildSearchString(expectedSearchParams),
    });

    element.props.onClick();

    expect(signInWithGoogleMock).toHaveBeenCalledWith(expectedRedirectTo);
    expect(expectedRedirectTo).not.toContain("auth=");
    expect(openAuthPopupMock).not.toHaveBeenCalled();
  });

  it("adds the public signup return marker when requested", () => {
    const publicLandingSearchParams = cloneQueryParams();
    setQueryParam(publicLandingSearchParams, "prod-ui", true);
    const publicLandingSearch = buildSearchString(publicLandingSearchParams);

    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          origin: "https://noter.md",
          pathname: "/",
          search: publicLandingSearch,
          hash: "",
        },
      },
      configurable: true,
    });

    const element = SignInWithGoogle({ markPublicSignupReturn: true });
    const expectedSearchParams = cloneQueryParams(publicLandingSearch);
    setQueryParam(expectedSearchParams, "signup", "google");
    const expectedRedirectTo = buildPathWithQuery({
      pathname: "/",
      search: buildSearchString(expectedSearchParams),
    });

    element.props.onClick();

    expect(signInWithGoogleMock).toHaveBeenCalledWith(expectedRedirectTo);
  });
});
