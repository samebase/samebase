// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  PasswordAuthForm,
  PublicLandingAuthControls,
} from "@/components/PublicLandingAuthControls";
import { type RootRouteSearch } from "@/routeSearch/root";
import { type PublicDeploymentAuthPolicy } from "../../convex/deploymentProfile";

const { buildLocationMock, signInWithOAuthMock, signInWithPasswordMock } = vi.hoisted(() => ({
  buildLocationMock: vi.fn(),
  signInWithOAuthMock: vi.fn(),
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
vi.mock("@/lib/oauthSignInRejection", () => ({
  useOAuthSignInRejection: () => null,
}));

vi.mock("@/authClient", () => ({
  useAppSignInActions: () => ({
    signInWithOAuth: signInWithOAuthMock,
    signInWithPassword: signInWithPasswordMock,
  }),
}));

vi.mock("@/routeSearch/root", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/routeSearch/root")>()),
  readRootRouteSearch: () => componentState.search,
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: ({
    select,
  }: {
    select: (location: { pathname: string; searchStr: string }) => unknown;
  }) => select({ pathname: componentState.pathname, searchStr: "" }),
  useRouter: () => ({
    buildLocation: buildLocationMock,
  }),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: componentState.isAuthenticated,
    isLoading: false,
  }),
}));

// The controls read one query: the root loader's deployment auth policy.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: componentState.deploymentAuthPolicy }),
}));

// This jsdom mount has no Start server request or client compilation.
vi.mock("@/lib/isomorphic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/isomorphic")>()),
  readIsomorphicOrigin: () => window.location.origin,
}));

function renderPasswordAuthForm(surface: "local_worktree" | "sign_in"): string {
  return renderToStaticMarkup(<PasswordAuthForm surface={surface} />);
}

async function clickAutofillAndSignIn(rootElement: HTMLElement) {
  const autofillButton = Array.from(rootElement.querySelectorAll("button")).find(
    (button) => button.textContent === "Autofill & sign in",
  );
  if (!(autofillButton instanceof HTMLButtonElement)) {
    throw new Error("Password auth autofill button not found.");
  }

  await act(async () => {
    autofillButton.click();
  });
}

describe("PasswordAuthForm", () => {
  let root: Root | null = null;

  afterEach(() => {
    componentState.deploymentAuthPolicy = undefined;
    componentState.isAuthenticated = false;
    componentState.pathname = "/";
    componentState.search = {};
    buildLocationMock.mockReset();
    signInWithOAuthMock.mockReset();
    signInWithPasswordMock.mockReset();
    const mountedRoot = root;
    if (mountedRoot !== null) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    document.body.replaceChildren();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("renders the seeded sign-in-only surface without local shortcuts", () => {
    const markup = renderPasswordAuthForm("sign_in");

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

  it("omits the landing sidebar password auth until the deployment policy loads", () => {
    const markup = renderToStaticMarkup(
      <PublicLandingAuthControls oauthAuthFlow="public-signup" />,
    );

    expect(markup).toContain("Continue with GitHub");
    expect(markup).not.toContain("Continue with Google");
    expect(markup).not.toContain("Password auth (dev)");
    expect(markup).not.toContain("Password sign in");
  });

  it("renders the landing sidebar password auth from the deployment policy", () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };

    const markup = renderToStaticMarkup(
      <PublicLandingAuthControls oauthAuthFlow="public-signup" />,
    );

    expect(markup).toContain("GitHub");
    expect(markup).toContain("Password sign in");
    expect(markup).toContain('placeholder="you@example.com"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).not.toContain("Need an account?");
  });

  it("marks every root GitHub sign-in as a public signup return", async () => {
    signInWithOAuthMock.mockResolvedValue(undefined);
    buildLocationMock.mockImplementation(
      (options: { search: (currentSearch: RootRouteSearch) => RootRouteSearch; to: string }) => {
        expect(options.to).toBe("/");
        expect(options.search({ "prod-ui": true })).toEqual({
          "prod-ui": true,
          auth: undefined,
          "auth-return": "dashboard",
          signup: "github",
        });
        return { href: "/?prod-ui&auth-return=dashboard&signup=github" };
      },
    );
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingAuthControls oauthAuthFlow="public-signup" />);
    });

    const githubButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent.trim() === "Continue with GitHub",
    );
    if (!(githubButton instanceof HTMLButtonElement)) {
      throw new Error("GitHub sign-in button not found.");
    }

    await act(async () => {
      githubButton.click();
    });

    expect(signInWithOAuthMock).toHaveBeenCalledWith(
      "github",
      "/?prod-ui&auth-return=dashboard&signup=github",
    );
  });

  it("hides OAuth and password controls while the OAuth return notice is visible", async () => {
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
      localRoot.render(<PublicLandingAuthControls oauthAuthFlow="public-signup" />);
    });

    expect(rootElement.innerHTML).not.toContain("GitHub");
    expect(rootElement.innerHTML).not.toContain("Password sign in");
    expect(rootElement.querySelector('input[type="email"]')).toBeNull();
    expect(rootElement.querySelector('input[type="password"]')).toBeNull();
  });

  it("hides the landing sidebar password auth in prod-ui mode", () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    componentState.search = { "prod-ui": true };

    const markup = renderToStaticMarkup(
      <PublicLandingAuthControls oauthAuthFlow="public-signup" />,
    );

    expect(markup).toContain("GitHub");
    expect(markup).not.toContain("Password auth (dev)");
    expect(markup).not.toContain("Password sign in");
  });

  it("offers only the password form on a local worktree, which has no identity hub", () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "local_worktree" },
      passwordAuthMode: "local_worktree_seed",
    };

    const worktreeMarkup = renderToStaticMarkup(
      <PublicLandingAuthControls oauthAuthFlow="public-signup" />,
    );
    expect(worktreeMarkup).not.toContain("GitHub");
    expect(worktreeMarkup).toContain("Password auth (dev)");

    componentState.search = { "prod-ui": true };
    const prodUiMarkup = renderToStaticMarkup(
      <PublicLandingAuthControls oauthAuthFlow="public-signup" />,
    );
    expect(prodUiMarkup).toContain("Continue with GitHub");
    expect(prodUiMarkup).not.toContain("Password auth (dev)");
  });

  it("renders manual password auth even in prod-ui mode", async () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "production" },
      passwordAuthMode: "manual",
    };
    componentState.search = { "prod-ui": true };
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingAuthControls oauthAuthFlow="public-signup" />);
    });

    expect(rootElement.innerHTML).toContain("GitHub");
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
      <PublicLandingAuthControls oauthAuthFlow="public-signup" />,
    );

    expect(markup).not.toContain("GitHub");
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
    const emailInput = rootElement.querySelector('input[type="email"]');
    const passwordInput = rootElement.querySelector('input[type="password"]');
    if (!(emailInput instanceof HTMLInputElement)) {
      throw new Error("Email input not found");
    }
    if (!(passwordInput instanceof HTMLInputElement)) {
      throw new Error("Password input not found");
    }

    expect(emailInput.value).toBe("");
    expect(passwordInput.value).toBe("");

    await act(async () => {
      autofillButton.click();
    });

    expect(rootElement.textContent).toContain(
      "Autofill is only available from the worktree dev server. Restart with pnpm dev:worktree and reload.",
    );
    expect(emailInput.value).toBe("");
    expect(passwordInput.value).toBe("");
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

  it("loads the dashboard after password success when the auth controls leave the tree", async () => {
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
      localRoot.render(<PublicLandingAuthControls oauthAuthFlow="public-signup" />);
    });

    const assignMock = vi.fn();
    vi.stubGlobal("location", { assign: assignMock, origin: window.location.origin });
    await clickAutofillAndSignIn(rootElement);

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "nicu@samebase.com",
      flow: "signIn",
      password: "pass1234",
    });
    expect(assignMock).not.toHaveBeenCalled();

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
    expect(assignMock).toHaveBeenCalledWith("/repo");
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
      localRoot.render(<PublicLandingAuthControls oauthAuthFlow="current-route" />);
    });

    const assignMock = vi.fn();
    vi.stubGlobal("location", { assign: assignMock, origin: window.location.origin });
    await clickAutofillAndSignIn(rootElement);

    componentState.isAuthenticated = true;
    await act(async () => {
      localRoot.render(<PublicLandingAuthControls oauthAuthFlow="current-route" />);
    });

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "nicu@samebase.com",
      flow: "signIn",
      password: "pass1234",
    });
    expect(assignMock).not.toHaveBeenCalled();
  });
});
