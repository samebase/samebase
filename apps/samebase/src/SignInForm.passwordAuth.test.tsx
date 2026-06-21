// @vitest-environment jsdom

import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  PasswordAuthForm,
  PublicLandingSidebarAuthControls,
} from "@/components/PublicLandingAuthControls";
import {
  PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID,
  PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID,
  PUBLIC_LANDING_SIDEBAR_AUTH_PLACEHOLDER_TEST_ID,
} from "@/lib/publicLanding";
import { type RootRouteSearch } from "@/routeSearch/root";
import { type PublicDeploymentAuthPolicy } from "../convex/deploymentProfile";

const { navigateMock, signInWithGoogleMock, signInWithPasswordMock } = vi.hoisted(() => ({
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
    buildLocation: () => ({ href: "/" }),
  }),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: componentState.isAuthenticated,
    isLoading: false,
  }),
  useQuery: () => componentState.deploymentAuthPolicy,
}));

function renderPasswordAuthForm(surface: "local_worktree" | "preview"): string {
  return renderToStaticMarkup(<PasswordAuthForm flow="signIn" surface={surface} />);
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

  it("renders the preview sign-in-only surface without local shortcuts", () => {
    const markup = renderPasswordAuthForm("preview");

    expect(markup).toContain("Password auth (dev)");
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

  it("renders the sidebar auth placeholder from prerendered markup", () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    componentState.search = { "create-account": true };

    const markup = renderToStaticMarkup(<PublicLandingSidebarAuthControls />);

    expect(markup).toContain(PUBLIC_LANDING_SIDEBAR_AUTH_PLACEHOLDER_TEST_ID);
    expect(markup).not.toContain(PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID);
  });

  it("hydrates preview create-account auth without a recoverable error", async () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    componentState.search = { "create-account": true };
    const rootElement = document.createElement("div");
    rootElement.innerHTML = renderToStaticMarkup(<PublicLandingSidebarAuthControls />);
    document.body.append(rootElement);
    const recoverableErrors: Array<unknown> = [];

    await act(async () => {
      root = hydrateRoot(rootElement, <PublicLandingSidebarAuthControls />, {
        onRecoverableError(error: unknown) {
          recoverableErrors.push(error);
        },
      });
      await settleHydrationUpdate();
    });

    expect(recoverableErrors).toEqual([]);
    expect(rootElement.innerHTML).toContain(PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID);
    expect(rootElement.innerHTML).toContain("Password auth (dev)");
    expect(rootElement.innerHTML).toContain('placeholder="you@example.com"');
    expect(rootElement.innerHTML).toContain('autocomplete="new-password"');
    expect(rootElement.innerHTML).not.toContain("Google");
    expect(rootElement.textContent).toContain("Create account");
  });

  it("hydrates remembered password auth without changing the prerendered sidebar markup", async () => {
    componentState.search = { "sign-in": true };
    window.localStorage.setItem("samebase_public_landing_password_auth_mode", "preview_seed");
    const rootElement = document.createElement("div");
    rootElement.innerHTML = renderToStaticMarkup(<PublicLandingSidebarAuthControls />);
    document.body.append(rootElement);
    const recoverableErrors: Array<unknown> = [];

    await act(async () => {
      root = hydrateRoot(rootElement, <PublicLandingSidebarAuthControls />, {
        onRecoverableError(error: unknown) {
          recoverableErrors.push(error);
        },
      });
      await settleHydrationUpdate();
    });

    expect(recoverableErrors).toEqual([]);
    expect(rootElement.innerHTML).toContain(PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID);
    expect(rootElement.textContent).toContain("Google");
    expect(rootElement.innerHTML).toContain("Password auth (dev)");
  });

  it("hydrates sidebar sign-in auth controls without a recoverable error", async () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    componentState.search = { "sign-in": true };
    const rootElement = document.createElement("div");
    rootElement.innerHTML = renderToStaticMarkup(<PublicLandingSidebarAuthControls />);
    document.body.append(rootElement);
    const recoverableErrors: Array<unknown> = [];

    await act(async () => {
      root = hydrateRoot(rootElement, <PublicLandingSidebarAuthControls />, {
        onRecoverableError(error: unknown) {
          recoverableErrors.push(error);
        },
      });
      await settleHydrationUpdate();
    });

    expect(recoverableErrors).toEqual([]);
    expect(rootElement.innerHTML).toContain(PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID);
    expect(rootElement.textContent).toContain("Google");
    expect(rootElement.textContent).toContain("Password auth (dev)");
    expect(rootElement.textContent).toContain("Sign in");
  });

  it("hydrates sidebar create-account auth controls without a recoverable error", async () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    componentState.search = { "create-account": true };
    const rootElement = document.createElement("div");
    rootElement.innerHTML = renderToStaticMarkup(<PublicLandingSidebarAuthControls />);
    document.body.append(rootElement);
    const recoverableErrors: Array<unknown> = [];

    await act(async () => {
      root = hydrateRoot(rootElement, <PublicLandingSidebarAuthControls />, {
        onRecoverableError(error: unknown) {
          recoverableErrors.push(error);
        },
      });
      await settleHydrationUpdate();
    });

    expect(recoverableErrors).toEqual([]);
    expect(rootElement.innerHTML).not.toContain(PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID);
    expect(rootElement.textContent).toContain("Password auth (dev)");
    expect(rootElement.textContent).toContain("Create account");
  });

  it("hides only the landing sidebar password auth in prod-ui mode", async () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    componentState.search = { "prod-ui": true, "sign-in": true };
    const rootElement = document.createElement("div");
    rootElement.innerHTML = renderToStaticMarkup(<PublicLandingSidebarAuthControls />);
    document.body.append(rootElement);

    await act(async () => {
      root = hydrateRoot(rootElement, <PublicLandingSidebarAuthControls />);
      await settleHydrationUpdate();
    });

    expect(rootElement.innerHTML).toContain(PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID);
    expect(rootElement.innerHTML).toContain(PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID);
    expect(rootElement.textContent).toContain("Google");
    expect(rootElement.textContent).not.toContain("Password auth (dev)");
  });

  it("hides the landing sidebar password auth after sign-in", () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    componentState.isAuthenticated = true;
    componentState.search = { "sign-in": true };

    const markup = renderToStaticMarkup(<PublicLandingSidebarAuthControls />);

    expect(markup).not.toContain(PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID);
  });

  it("shows actionable copy when local worktree autofill credentials are missing", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PasswordAuthForm flow="signIn" surface="local_worktree" />);
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
      localRoot.render(
        <PasswordAuthForm flow="signIn" surface="local_worktree" onSignIn={onSignIn} />,
      );
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

  it("navigates to the dashboard after password sign-in once auth state is authenticated", async () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "local_worktree_seed",
    };
    componentState.search = { "sign-in": true };
    signInWithPasswordMock.mockResolvedValue(undefined);
    vi.stubEnv("VITE_LOCAL_WORKTREE_PASSWORD_EMAIL", "Nicu@samebase.com");
    vi.stubEnv("VITE_LOCAL_WORKTREE_PASSWORD_VALUE", "pass1234");
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingSidebarAuthControls />);
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

    componentState.isAuthenticated = true;
    await act(async () => {
      localRoot.render(<PublicLandingSidebarAuthControls />);
    });

    expect(navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      to: "/home",
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
        "create-account": true,
        "prod-ui": true,
        signup: "google",
        "sign-in": true,
      }),
    ).toEqual({
      auth: undefined,
      "auth-return": undefined,
      "create-account": undefined,
      "prod-ui": true,
      signup: undefined,
      "sign-in": undefined,
    });
  });
});
