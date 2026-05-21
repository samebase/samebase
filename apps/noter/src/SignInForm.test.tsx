import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { buildPathWithTanStackSearch, stringifyTanStackSearch } from "./lib/tanstackSearchParams";

const { buildLocationMock, isInIframeMock, openAuthPopupMock, signInWithGoogleMock } = vi.hoisted(
  () => ({
    buildLocationMock: vi.fn(),
    isInIframeMock: vi.fn(() => false),
    openAuthPopupMock: vi.fn(),
    signInWithGoogleMock: vi.fn(),
  }),
);

vi.mock("@/authClient", () => ({
  isInIframe: isInIframeMock,
  openAuthPopup: openAuthPopupMock,
  useNoterSignInActions: () => ({
    signInWithGoogle: signInWithGoogleMock,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    buildLocation: buildLocationMock,
  }),
}));

import { SignInWithGoogle } from "./SignInWithGoogle";

describe("SignInWithGoogle", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    buildLocationMock.mockReset();
    signInWithGoogleMock.mockReset();
    openAuthPopupMock.mockReset();
    isInIframeMock.mockReset();
    isInIframeMock.mockReturnValue(false);
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
        to?: string;
      }) => {
        const currentSearch = Object.fromEntries(
          new URLSearchParams(window.location.search).entries(),
        );
        const nextSearch =
          typeof options.search === "function" ? options.search(currentSearch) : currentSearch;
        return {
          href: buildPathWithTanStackSearch({
            pathname: options.to === "/" ? "/" : window.location.pathname,
            search: nextSearch,
            hash: options.hash === true ? window.location.hash : undefined,
          }),
        };
      },
    );
  }

  it("preserves the MCP consent route when starting top-level Google auth", () => {
    const consentSearch = stringifyTanStackSearch({
      mcp_consent_request: "mcpar_test",
      mcp_login_required: "1",
      auth: "google",
    });

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
    mockCurrentRouteLocationBuilder();

    const element = SignInWithGoogle();
    const expectedRedirectTo = buildPathWithTanStackSearch({
      pathname: "/oauth/mcp/consent",
      search: {
        mcp_consent_request: "mcpar_test",
        mcp_login_required: "1",
      },
    });

    element.props.onClick();

    expect(signInWithGoogleMock).toHaveBeenCalledWith(expectedRedirectTo);
    expect(expectedRedirectTo).not.toContain("auth=");
    expect(openAuthPopupMock).not.toHaveBeenCalled();
  });

  it("adds the public signup return marker when requested", () => {
    const publicLandingSearch = stringifyTanStackSearch({
      "prod-ui": true,
    });

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
    mockCurrentRouteLocationBuilder();

    const element = SignInWithGoogle({ markPublicSignupReturn: true });
    const expectedRedirectTo = buildPathWithTanStackSearch({
      pathname: "/",
      search: {
        "prod-ui": "",
        signup: "google",
      },
    });

    element.props.onClick();

    expect(signInWithGoogleMock).toHaveBeenCalledWith(expectedRedirectTo);
  });

  it("propagates the public signup marker through iframe Google auth", () => {
    isInIframeMock.mockReturnValue(true);
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          origin: "https://noter.md",
          pathname: "/",
          search: "",
          hash: "",
        },
      },
      configurable: true,
    });
    mockCurrentRouteLocationBuilder();

    const element = SignInWithGoogle({ markPublicSignupReturn: true });

    element.props.onClick();

    expect(openAuthPopupMock).toHaveBeenCalledWith("google", {
      popupPath: "/?auth=google&signup=google",
    });
    expect(signInWithGoogleMock).not.toHaveBeenCalled();
  });
});
