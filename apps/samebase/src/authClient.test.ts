import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  buildPathWithTanStackSearch,
  parseTanStackSearch,
  stringifyTanStackSearch,
} from "./lib/tanstackSearchParams";

const {
  buildLocationMock,
  githubSignInMock,
  googleSignInMock,
  replaceStateMock,
  resetMock,
  signOutMock,
} = vi.hoisted(() => ({
  buildLocationMock: vi.fn(),
  githubSignInMock: vi.fn(),
  googleSignInMock: vi.fn(),
  replaceStateMock: vi.fn(),
  resetMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useCallback: <Callback>(callback: Callback) => callback,
    useEffect: (effect: () => void) => {
      effect();
    },
  };
});

vi.mock("@convex-dev/auth/methods/github/react", () => ({
  useSignInWithGithub: () => ({ signIn: githubSignInMock }),
}));

vi.mock("@convex-dev/auth/methods/google/react", () => ({
  useSignInWithGoogle: () => ({ signIn: googleSignInMock }),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    buildLocation: buildLocationMock,
  }),
}));

import { signOutWithAnalytics, useAutoSignIn } from "./authClient";

const origin = "https://samebase.test";
const providerSignInMocks = { github: githubSignInMock, google: googleSignInMock };

describe("useAutoSignIn", () => {
  beforeEach(() => {
    githubSignInMock.mockResolvedValue({ status: "redirect" });
    googleSignInMock.mockResolvedValue({ status: "redirect" });
  });

  afterEach(() => {
    buildLocationMock.mockReset();
    githubSignInMock.mockReset();
    googleSignInMock.mockReset();
    signOutMock.mockReset();
    resetMock.mockReset();
    replaceStateMock.mockReset();
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

  it.each(["google", "github"] as const)(
    "passes an absolute redirectTo when auto-starting %s auth from a direct link",
    (provider) => {
      const popupSearch = stringifyTanStackSearch({
        mcp_consent_request: "mcpar_test",
        mcp_login_required: "1",
        auth: provider,
      });
      const expectedRedirectTo = buildPathWithTanStackSearch({
        pathname: "/",
        search: {
          mcp_consent_request: "mcpar_test",
          mcp_login_required: "1",
        },
      });

      vi.stubGlobal("window", {
        location: {
          origin,
          pathname: "/",
          search: popupSearch,
          hash: "",
        },
        history: {
          state: { __TSR_index: 7, __TSR_key: "popup-route" },
          replaceState: replaceStateMock,
        },
      });

      mockCurrentRouteLocationBuilder();

      useAutoSignIn({ auth: provider });

      expect(replaceStateMock).toHaveBeenCalledWith(
        { __TSR_index: 7, __TSR_key: "popup-route" },
        "",
        expectedRedirectTo,
      );
      expect(providerSignInMocks[provider]).toHaveBeenCalledWith({
        redirectTo: `${origin}${expectedRedirectTo}`,
      });
    },
  );

  it.each(["google", "github"] as const)(
    "preserves the public signup marker when %s auth auto-starts",
    (provider) => {
      const popupSearch = stringifyTanStackSearch({
        auth: provider,
        signup: provider,
      });
      const expectedRedirectTo = buildPathWithTanStackSearch({
        pathname: "/",
        search: {
          signup: provider,
        },
      });

      vi.stubGlobal("window", {
        location: {
          origin,
          pathname: "/",
          search: popupSearch,
          hash: "",
        },
        history: {
          state: { __TSR_index: 8, __TSR_key: "signup-route" },
          replaceState: replaceStateMock,
        },
      });

      mockCurrentRouteLocationBuilder();

      useAutoSignIn({ auth: provider, signup: provider });

      expect(replaceStateMock).toHaveBeenCalledWith(
        { __TSR_index: 8, __TSR_key: "signup-route" },
        "",
        expectedRedirectTo,
      );
      expect(providerSignInMocks[provider]).toHaveBeenCalledWith({
        redirectTo: `${origin}${expectedRedirectTo}`,
      });
    },
  );

  it.each(["google", "github"] as const)(
    "preserves the dashboard return marker when public %s auth auto-starts",
    (provider) => {
      const popupSearch = stringifyTanStackSearch({
        auth: provider,
        "auth-return": "dashboard",
        signup: provider,
      });
      const expectedRedirectTo = buildPathWithTanStackSearch({
        pathname: "/",
        search: {
          "auth-return": "dashboard",
          signup: provider,
        },
      });

      vi.stubGlobal("window", {
        location: {
          origin,
          pathname: "/",
          search: popupSearch,
          hash: "",
        },
        history: {
          state: { __TSR_index: 9, __TSR_key: "dashboard-return" },
          replaceState: replaceStateMock,
        },
      });

      mockCurrentRouteLocationBuilder();

      useAutoSignIn({
        auth: provider,
        "auth-return": "dashboard",
        signup: provider,
      });

      expect(replaceStateMock).toHaveBeenCalledWith(
        { __TSR_index: 9, __TSR_key: "dashboard-return" },
        "",
        expectedRedirectTo,
      );
      expect(providerSignInMocks[provider]).toHaveBeenCalledWith({
        redirectTo: `${origin}${expectedRedirectTo}`,
      });
    },
  );

  it("does nothing when the routed auth search is absent", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/pricing",
        search: "",
        hash: "",
      },
      history: {
        replaceState: replaceStateMock,
      },
    });

    useAutoSignIn({});

    expect(replaceStateMock).not.toHaveBeenCalled();
    expect(githubSignInMock).not.toHaveBeenCalled();
    expect(googleSignInMock).not.toHaveBeenCalled();
  });

  it("always signs out even if PostHog reset throws", async () => {
    const resetError = new Error("reset failed");
    resetMock.mockImplementation(() => {
      throw resetError;
    });
    signOutMock.mockResolvedValue(undefined);

    await expect(
      signOutWithAnalytics({
        signOut: signOutMock,
        posthog: { reset: resetMock },
      }),
    ).resolves.toBeUndefined();

    expect(resetMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
