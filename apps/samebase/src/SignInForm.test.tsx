import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  buildPathWithTanStackSearch,
  parseTanStackSearch,
  stringifyTanStackSearch,
} from "./lib/tanstackSearchParams";

const { buildLocationMock, isInIframeMock, openAuthPopupMock, signInWithOAuthMock } = vi.hoisted(
  () => ({
    buildLocationMock: vi.fn(),
    isInIframeMock: vi.fn(() => false),
    openAuthPopupMock: vi.fn(),
    signInWithOAuthMock: vi.fn(),
  }),
);

vi.mock("@/authClient", () => ({
  isInIframe: isInIframeMock,
  openAuthPopup: openAuthPopupMock,
  useAppSignInActions: () => ({
    signInWithOAuth: signInWithOAuthMock,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    buildLocation: buildLocationMock,
  }),
}));

import { SignInWithOAuth } from "./SignInWithOAuth";
import type { OAuthAuthProvider } from "./lib/oauthAuthRedirect";

describe("SignInWithOAuth", () => {
  afterEach(() => {
    buildLocationMock.mockReset();
    signInWithOAuthMock.mockReset();
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

  function renderOAuthButton(
    provider: OAuthAuthProvider,
    props: Omit<Parameters<typeof SignInWithOAuth>[0], "provider"> = {},
  ) {
    return SignInWithOAuth({ provider, ...props });
  }

  it("uses the primary button for GitHub and the outline button for Google", () => {
    expect(renderOAuthButton("github").props.variant).toBe("default");
    expect(renderOAuthButton("google").props.variant).toBe("outline");
  });

  it.each(["google", "github"] as const)(
    "preserves the MCP consent route when starting top-level %s auth",
    (provider) => {
      const consentSearch = stringifyTanStackSearch({
        mcp_consent_request: "mcpar_test",
        mcp_login_required: "1",
        auth: provider,
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

      const element = renderOAuthButton(provider);
      const expectedRedirectTo = buildPathWithTanStackSearch({
        pathname: "/oauth/mcp/consent",
        search: {
          mcp_consent_request: "mcpar_test",
          mcp_login_required: "1",
        },
      });

      element.props.onClick();

      expect(signInWithOAuthMock).toHaveBeenCalledWith(provider, expectedRedirectTo);
      expect(expectedRedirectTo).not.toContain("auth=");
      expect(openAuthPopupMock).not.toHaveBeenCalled();
    },
  );

  it.each(["google", "github"] as const)(
    "marks public %s auth for a dashboard return",
    (provider) => {
      vi.stubGlobal("window", {
        location: {
          origin: "https://samebase.com",
          pathname: "/",
          search: stringifyTanStackSearch({ "prod-ui": true }),
          hash: "",
        },
      });
      mockCurrentRouteLocationBuilder();

      const element = renderOAuthButton(provider, {
        authReturn: "dashboard",
        markPublicSignupReturn: true,
      });
      const expectedRedirectTo = buildPathWithTanStackSearch({
        pathname: "/",
        search: {
          "prod-ui": "",
          "auth-return": "dashboard",
          signup: provider,
        },
      });

      element.props.onClick();

      expect(signInWithOAuthMock).toHaveBeenCalledWith(provider, expectedRedirectTo);
    },
  );

  it.each(["google", "github"] as const)(
    "propagates the public signup marker through iframe %s auth",
    (provider) => {
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

      const element = renderOAuthButton(provider, {
        authReturn: "dashboard",
        markPublicSignupReturn: true,
      });

      element.props.onClick();

      expect(openAuthPopupMock).toHaveBeenCalledWith(provider, {
        popupPath: `/?auth=${provider}&auth-return=dashboard&signup=${provider}`,
      });
      expect(signInWithOAuthMock).not.toHaveBeenCalled();
    },
  );

  it("keeps iframe GitHub auth on the requested private route", () => {
    isInIframeMock.mockReturnValue(true);
    vi.stubGlobal("window", {
      location: {
        origin: "https://samebase.com",
        pathname: "/repo/samebase/samebase/fs/main/README.md",
        search: "",
        hash: "",
      },
    });
    mockCurrentRouteLocationBuilder();

    const element = renderOAuthButton("github");

    element.props.onClick();

    expect(openAuthPopupMock).toHaveBeenCalledWith("github", {
      popupPath: "/repo/samebase/samebase/fs/main/README.md?auth=github",
    });
    expect(signInWithOAuthMock).not.toHaveBeenCalled();
  });
});
