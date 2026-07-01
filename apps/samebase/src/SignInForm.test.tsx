import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildPathWithTanStackSearch,
  parseTanStackSearch,
  stringifyTanStackSearch,
} from "./lib/tanstackSearchParams";

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
  useAppSignInActions: () => ({
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
  afterEach(() => {
    buildLocationMock.mockReset();
    signInWithGoogleMock.mockReset();
    openAuthPopupMock.mockReset();
    isInIframeMock.mockReset();
    isInIframeMock.mockReturnValue(false);
    vi.unstubAllGlobals();
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
            pathname:
              typeof options.to === "string" && options.to !== "."
                ? options.to
                : window.location.pathname,
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

    vi.stubGlobal("window", {
      location: {
        origin: "https://samebase.com",
        pathname: "/oauth/mcp/consent",
        search: consentSearch,
        hash: "",
      },
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

    vi.stubGlobal("window", {
      location: {
        origin: "https://samebase.com",
        pathname: "/",
        search: publicLandingSearch,
        hash: "",
      },
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
    vi.stubGlobal("window", {
      location: {
        origin: "https://samebase.com",
        pathname: "/",
        search: "",
        hash: "",
      },
    });
    mockCurrentRouteLocationBuilder();

    const element = renderVisibleGoogleButton({
      authReturn: "dashboard",
      markPublicSignupReturn: true,
    });
    const expectedRedirectTo = buildPathWithTanStackSearch({
      pathname: "/vault",
      search: {
        signup: "google",
      },
    });

    element.props.onClick();

    expect(signInWithGoogleMock).toHaveBeenCalledWith(expectedRedirectTo);
  });

  it("propagates the public signup marker through iframe Google auth", () => {
    isInIframeMock.mockReturnValue(true);
    vi.stubGlobal("window", {
      location: {
        origin: "https://samebase.com",
        pathname: "/",
        search: "",
        hash: "",
      },
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
    expect(signInWithGoogleMock).not.toHaveBeenCalled();
  });

  it("keeps iframe Google auth on the requested private route", () => {
    isInIframeMock.mockReturnValue(true);
    vi.stubGlobal("window", {
      location: {
        origin: "https://samebase.com",
        pathname: "/vault/samebase/samebase/fs/main/README.md",
        search: "",
        hash: "",
      },
    });
    mockCurrentRouteLocationBuilder();

    const element = renderVisibleGoogleButton();

    element.props.onClick();

    expect(openAuthPopupMock).toHaveBeenCalledWith("google", {
      popupPath: "/vault/samebase/samebase/fs/main/README.md?auth=google",
    });
    expect(signInWithGoogleMock).not.toHaveBeenCalled();
  });
});
