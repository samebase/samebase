import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildPathWithTanStackSearch,
  parseTanStackSearch,
  stringifyTanStackSearch,
} from "./lib/tanstackSearchParams";

const {
  buildLocationMock,
  isInIframeMock,
  openAuthPopupMock,
  sessionStorageSetItemMock,
  signInWithGoogleMock,
} = vi.hoisted(() => ({
  buildLocationMock: vi.fn(),
  isInIframeMock: vi.fn(() => false),
  openAuthPopupMock: vi.fn(),
  sessionStorageSetItemMock: vi.fn(),
  signInWithGoogleMock: vi.fn(),
}));

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
    sessionStorageSetItemMock.mockReset();
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
        const currentSearch = parseTanStackSearch(window.location.search);
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

  function renderVisibleGoogleButton(props?: Parameters<typeof SignInWithGoogle>[0]) {
    return SignInWithGoogle(props);
  }

  it("reserves hidden provider space without leaving a button in the DOM", () => {
    const markup = renderToStaticMarkup(<SignInWithGoogle visible={false} />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("h-[42px]");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("Google");
  });

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

    const element = renderVisibleGoogleButton();
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

    const element = renderVisibleGoogleButton({ markPublicSignupReturn: true });
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

  it("marks public root Google auth for a dashboard return", () => {
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          origin: "https://noter.md",
          pathname: "/",
          search: "",
          hash: "",
        },
        sessionStorage: {
          setItem: sessionStorageSetItemMock,
        },
      },
      configurable: true,
    });
    mockCurrentRouteLocationBuilder();

    const element = renderVisibleGoogleButton({
      authReturn: "dashboard",
      markPublicSignupReturn: true,
    });
    const expectedRedirectTo = buildPathWithTanStackSearch({
      pathname: "/",
      search: {
        "auth-return": "dashboard",
        signup: "google",
      },
    });

    element.props.onClick();

    expect(signInWithGoogleMock).toHaveBeenCalledWith(expectedRedirectTo);
    expect(sessionStorageSetItemMock).toHaveBeenCalledWith(
      "noter_public_dashboard_auth_return",
      expect.stringMatching(/^top-level:\d+$/),
    );
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
        sessionStorage: {
          setItem: sessionStorageSetItemMock,
        },
      },
      configurable: true,
    });
    mockCurrentRouteLocationBuilder();

    const element = renderVisibleGoogleButton({
      authReturn: "dashboard",
      markPublicSignupReturn: true,
    });

    element.props.onClick();

    expect(openAuthPopupMock).toHaveBeenCalledWith("google", {
      popupPath: "/?auth=google&auth-return=dashboard&signup=google",
    });
    expect(sessionStorageSetItemMock).toHaveBeenCalledWith(
      "noter_public_dashboard_auth_return",
      expect.stringMatching(/^popup:\d+$/),
    );
    expect(signInWithGoogleMock).not.toHaveBeenCalled();
  });

  it("keeps iframe Google auth on the requested private route", () => {
    isInIframeMock.mockReturnValue(true);
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          origin: "https://noter.md",
          pathname: "/vault/noter-md/noter/main/README.md",
          search: "",
          hash: "",
        },
      },
      configurable: true,
    });
    mockCurrentRouteLocationBuilder();

    const element = renderVisibleGoogleButton();

    element.props.onClick();

    expect(openAuthPopupMock).toHaveBeenCalledWith("google", {
      popupPath: "/vault/noter-md/noter/main/README.md?auth=google",
    });
    expect(signInWithGoogleMock).not.toHaveBeenCalled();
  });
});
