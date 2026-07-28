// @vitest-environment jsdom

import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  PasswordAuthForm,
  PublicLandingAuthControls,
} from "@/components/PublicLandingAuthControls";
import { type RootRouteSearch } from "@/routeSearch/root";
import { type PublicDeploymentAuthPolicy } from "../convex/deploymentProfile";

const { buildLocationMock, navigateMock, signInWithGoogleMock, signInWithPasswordMock } =
  vi.hoisted(() => ({
    buildLocationMock: vi.fn(),
    navigateMock: vi.fn(),
    signInWithGoogleMock: vi.fn(),
    signInWithPasswordMock: vi.fn(),
  }));
const componentState = vi.hoisted<{
  deploymentAuthPolicy: PublicDeploymentAuthPolicy | undefined;
  isAuthenticated: boolean;
  pathname: string;
  search: RootRouteSearch;
}>(() => ({
  deploymentAuthPolicy: undefined,
  isAuthenticated: false,
  pathname: "/",
  search: {},
}));
vi.mock("@/authClient", () => ({
  isInIframe: () => false,
  openAuthPopup: vi.fn(),
  useAppSignInActions: () => ({
    signInWithGoogle: signInWithGoogleMock,
    signInWithPassword: signInWithPasswordMock,
  }),
}));

vi.mock("@/routeSearch/root", () => ({
  readRootRouteSearch: () => componentState.search,
  useRootRouteSearch: () => componentState.search,
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: ({
    select,
  }: {
    select: (location: { pathname: string; searchStr: string }) => unknown;
  }) => select({ pathname: componentState.pathname, searchStr: "" }),
  useNavigate: () => navigateMock,
  useRouter: () => ({
    buildLocation: buildLocationMock,
  }),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: componentState.isAuthenticated,
    isLoading: false,
  }),
  useQuery: () => componentState.deploymentAuthPolicy,
}));

function renderPasswordAuthForm(surface: "local_worktree" | "seeded_sign_in"): string {
  return renderToStaticMarkup(<PasswordAuthForm surface={surface} />);
}

async function settleHydrationUpdate() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("PasswordAuthForm", () => {
  let root: Root | null = null;

  afterEach(() => {
    componentState.deploymentAuthPolicy = undefined;
    componentState.isAuthenticated = false;
    componentState.pathname = "/";
    componentState.search = {};
    buildLocationMock.mockReset();
    navigateMock.mockReset();
    signInWithGoogleMock.mockReset();
    signInWithPasswordMock.mockReset();
    const mountedRoot = root;
    if (mountedRoot !== null) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    document.body.replaceChildren();
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  it("renders the seeded sign-in-only surface without local shortcuts", () => {
    const markup = renderPasswordAuthForm("seeded_sign_in");

    expect(markup).toContain("Password sign in");
    expect(markup).toContain('placeholder="you@example.com"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain(">Sign in</button>");
    expect(markup).not.toContain("Need an account?");
    expect(markup).not.toContain("Create account");
    expect(markup).not.toContain("Autofill &amp; sign in");
  });

  it("renders the local-worktree surface with account creation controls", () => {
    const markup = renderPasswordAuthForm("local_worktree");

    expect(markup).toContain("Password auth (dev)");
    expect(markup).toContain("Need an account?");
    expect(markup).toContain("Autofill &amp; sign in");
    expect(markup).toContain(">Sign in</button>");
  });

  it("omits the landing sidebar password auth from prerendered markup", () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };

    const markup = renderToStaticMarkup(
      <PublicLandingAuthControls googleAuthFlow="public-signup" />,
    );

    expect(markup).toContain("Google");
    expect(markup).not.toContain("Password auth (dev)");
    expect(markup).not.toContain("Password sign in");
  });

  it("renders the landing sidebar password auth after hydration", async () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingAuthControls googleAuthFlow="public-signup" />);
      await settleHydrationUpdate();
    });

    expect(rootElement.innerHTML).toContain("Google");
    expect(rootElement.innerHTML).toContain("Password sign in");
    expect(rootElement.innerHTML).toContain('placeholder="you@example.com"');
    expect(rootElement.innerHTML).toContain('autocomplete="current-password"');
    expect(rootElement.innerHTML).not.toContain("Need an account?");
  });

  it("marks every root Google sign-in as a public signup return", async () => {
    buildLocationMock.mockImplementation(
      (options: { search: (currentSearch: RootRouteSearch) => RootRouteSearch; to: string }) => {
        expect(options.to).toBe("/vault");
        expect(options.search({ "prod-ui": true })).toEqual({
          "prod-ui": true,
          signup: "google",
          auth: undefined,
          "auth-return": undefined,
        });
        return { href: "/vault?prod-ui&signup=google" };
      },
    );
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingAuthControls googleAuthFlow="public-signup" />);
    });

    const googleButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent.trim() === "Google",
    );
    if (!(googleButton instanceof HTMLButtonElement)) {
      throw new Error("Google sign-in button not found.");
    }

    await act(async () => {
      googleButton.click();
    });

    expect(signInWithGoogleMock).toHaveBeenCalledWith("/vault?prod-ui&signup=google");
  });

  it("hides Google and password controls in the closed-signup state", async () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    componentState.search = { signup: "google" };
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingAuthControls googleAuthFlow="public-signup" />);
      await settleHydrationUpdate();
    });

    expect(rootElement.innerHTML).not.toContain("Google");
    expect(rootElement.innerHTML).not.toContain("Password sign in");
    expect(rootElement.querySelector('input[type="email"]')).toBeNull();
    expect(rootElement.querySelector('input[type="password"]')).toBeNull();
  });

  it("hydrates without inserting remembered password auth before hydration completes", async () => {
    const rootElement = document.createElement("div");
    rootElement.innerHTML = renderToStaticMarkup(
      <PublicLandingAuthControls googleAuthFlow="public-signup" />,
    );
    document.body.append(rootElement);
    window.localStorage.setItem("samebase_public_landing_password_auth_mode", "preview_seed");
    const recoverableErrors: Array<unknown> = [];

    await act(async () => {
      root = hydrateRoot(
        rootElement,
        <PublicLandingAuthControls googleAuthFlow="public-signup" />,
        {
          onRecoverableError(error: unknown) {
            recoverableErrors.push(error);
          },
        },
      );
      await settleHydrationUpdate();
    });

    expect(recoverableErrors).toEqual([]);
    expect(rootElement.innerHTML).toContain("Google");
    expect(rootElement.innerHTML).toContain("Password sign in");
  });

  it("hides the landing sidebar password auth in prod-ui mode", () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    componentState.search = { "prod-ui": true };

    const markup = renderToStaticMarkup(
      <PublicLandingAuthControls googleAuthFlow="public-signup" />,
    );

    expect(markup).toContain("Google");
    expect(markup).not.toContain("Password auth (dev)");
    expect(markup).not.toContain("Password sign in");
  });

  it("renders production review password auth even in prod-ui mode after hydration", async () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "production" },
      passwordAuthMode: "production_review_seed",
    };
    componentState.search = { "prod-ui": true };
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingAuthControls googleAuthFlow="public-signup" />);
      await settleHydrationUpdate();
    });

    expect(rootElement.innerHTML).toContain("Google");
    expect(rootElement.innerHTML).toContain("Password sign in");
    expect(rootElement.innerHTML).not.toContain("Need an account?");
  });

  it("hides the landing sidebar auth controls after sign-in", () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    componentState.isAuthenticated = true;

    const markup = renderToStaticMarkup(
      <PublicLandingAuthControls googleAuthFlow="public-signup" />,
    );

    expect(markup).not.toContain("Google");
    expect(markup).not.toContain("Password auth (dev)");
    expect(markup).not.toContain("Password sign in");
  });

  it("shows actionable copy when local worktree autofill credentials are missing", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PasswordAuthForm surface="local_worktree" />);
    });

    const autofillButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent === "Autofill & sign in",
    );
    if (!(autofillButton instanceof HTMLButtonElement)) {
      throw new Error("Autofill button not found");
    }

    await act(async () => {
      autofillButton.click();
    });

    expect(rootElement.textContent).toContain(
      "Autofill is only available from the worktree dev server. Restart with pnpm dev:worktree and reload.",
    );
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("runs the success handoff after password sign-in", async () => {
    signInWithPasswordMock.mockResolvedValue(undefined);
    vi.stubEnv("VITE_LOCAL_WORKTREE_PASSWORD_EMAIL", "Nicu@samebase.com");
    vi.stubEnv("VITE_LOCAL_WORKTREE_PASSWORD_VALUE", "pass1234");
    const onSignIn = vi.fn();
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PasswordAuthForm surface="local_worktree" onSignIn={onSignIn} />);
    });

    const autofillButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent === "Autofill & sign in",
    );
    if (!(autofillButton instanceof HTMLButtonElement)) {
      throw new Error("Password auth autofill button not found.");
    }

    await act(async () => {
      autofillButton.click();
    });

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "nicu@samebase.com",
      flow: "signIn",
      password: "pass1234",
    });
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("navigates to the dashboard after password success when the auth controls leave the tree", async () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "local_worktree_seed",
    };
    let resolvePasswordSignIn: (() => void) | undefined;
    signInWithPasswordMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePasswordSignIn = resolve;
      }),
    );
    vi.stubEnv("VITE_LOCAL_WORKTREE_PASSWORD_EMAIL", "Nicu@samebase.com");
    vi.stubEnv("VITE_LOCAL_WORKTREE_PASSWORD_VALUE", "pass1234");
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingAuthControls googleAuthFlow="public-signup" />);
    });

    const autofillButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent === "Autofill & sign in",
    );
    if (!(autofillButton instanceof HTMLButtonElement)) {
      throw new Error("Password auth autofill button not found.");
    }

    await act(async () => {
      autofillButton.click();
    });

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "nicu@samebase.com",
      flow: "signIn",
      password: "pass1234",
    });
    expect(navigateMock).not.toHaveBeenCalled();

    await act(async () => {
      localRoot.render(<div>Signed-in owner branch</div>);
    });
    expect(rootElement.textContent).toBe("Signed-in owner branch");

    const completePasswordSignIn = resolvePasswordSignIn;
    if (completePasswordSignIn === undefined) {
      throw new Error("Expected password sign-in to be pending.");
    }
    await act(async () => {
      completePasswordSignIn();
      await Promise.resolve();
    });
    expect(navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      to: "/vault",
    });
    const navigateOptions = navigateMock.mock.calls[0]?.[0];
    if (
      typeof navigateOptions !== "object" ||
      navigateOptions === null ||
      !("search" in navigateOptions) ||
      typeof navigateOptions.search !== "function"
    ) {
      throw new Error("Expected dashboard navigation to include a search updater.");
    }
    expect(
      navigateOptions.search({
        auth: "google",
        "auth-return": "dashboard",
        "prod-ui": true,
        signup: "google",
      }),
    ).toEqual({
      auth: undefined,
      "auth-return": undefined,
      "prod-ui": true,
      signup: undefined,
    });
  });

  it("stays on the MCP consent route after password sign-in", async () => {
    componentState.pathname = "/oauth/mcp/consent";
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "local_worktree_seed",
    };
    signInWithPasswordMock.mockResolvedValue(undefined);
    vi.stubEnv("VITE_LOCAL_WORKTREE_PASSWORD_EMAIL", "Nicu@samebase.com");
    vi.stubEnv("VITE_LOCAL_WORKTREE_PASSWORD_VALUE", "pass1234");
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingAuthControls googleAuthFlow="current-route" />);
    });

    const autofillButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent === "Autofill & sign in",
    );
    if (!(autofillButton instanceof HTMLButtonElement)) {
      throw new Error("Password auth autofill button not found.");
    }

    await act(async () => {
      autofillButton.click();
    });

    componentState.isAuthenticated = true;
    await act(async () => {
      localRoot.render(<PublicLandingAuthControls googleAuthFlow="current-route" />);
    });

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "nicu@samebase.com",
      flow: "signIn",
      password: "pass1234",
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
