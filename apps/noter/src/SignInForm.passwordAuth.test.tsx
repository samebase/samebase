// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  PasswordAuthForm,
  PublicLandingPasswordAuthControls,
} from "@/components/PublicLandingAuthControls";
import { PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID } from "@/lib/publicLanding";
import { type RootRouteSearch } from "@/lib/rootRouteSearch";
import { type PublicDeploymentAuthPolicy } from "../convex/deploymentProfile";

const { navigateMock, signInWithPasswordMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
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
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

vi.mock("@/authClient", () => ({
  useNoterSignInActions: () => ({
    signInWithPassword: signInWithPasswordMock,
  }),
}));

vi.mock("@/lib/rootRouteSearch", () => ({
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
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: componentState.isAuthenticated,
    isLoading: false,
  }),
  useQuery: () => componentState.deploymentAuthPolicy,
}));

function renderPasswordAuthForm(surface: "local_worktree" | "preview"): string {
  return renderToStaticMarkup(<PasswordAuthForm surface={surface} />);
}

describe("PasswordAuthForm", () => {
  let root: Root | null = null;

  afterEach(() => {
    componentState.deploymentAuthPolicy = undefined;
    componentState.isAuthenticated = false;
    componentState.pathname = "/";
    componentState.search = {};
    navigateMock.mockReset();
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

  it("renders the landing sidebar password auth for preview deployments", () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };

    const markup = renderToStaticMarkup(<PublicLandingPasswordAuthControls />);

    expect(markup).toContain(PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID);
    expect(markup).toContain("Password auth (dev)");
    expect(markup).toContain('placeholder="you@example.com"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).not.toContain("Google");
    expect(markup).not.toContain("Need an account?");
  });

  it("hides the landing sidebar password auth in prod-ui mode", () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    componentState.search = { "prod-ui": true };

    const markup = renderToStaticMarkup(<PublicLandingPasswordAuthControls />);

    expect(markup).not.toContain(PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID);
    expect(markup).not.toContain("Password auth (dev)");
  });

  it("hides the landing sidebar password auth after sign-in", () => {
    componentState.deploymentAuthPolicy = {
      deploymentProfile: { kind: "preview" },
      passwordAuthMode: "preview_seed",
    };
    componentState.isAuthenticated = true;

    const markup = renderToStaticMarkup(<PublicLandingPasswordAuthControls />);

    expect(markup).not.toContain(PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID);
    expect(markup).not.toContain("Password auth (dev)");
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
    vi.stubEnv("VITE_LOCAL_WORKTREE_PASSWORD_EMAIL", "Nicu@noter.md");
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
      email: "nicu@noter.md",
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
    signInWithPasswordMock.mockResolvedValue(undefined);
    vi.stubEnv("VITE_LOCAL_WORKTREE_PASSWORD_EMAIL", "Nicu@noter.md");
    vi.stubEnv("VITE_LOCAL_WORKTREE_PASSWORD_VALUE", "pass1234");
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingPasswordAuthControls />);
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
      email: "nicu@noter.md",
      flow: "signIn",
      password: "pass1234",
    });
    expect(navigateMock).not.toHaveBeenCalled();

    componentState.isAuthenticated = true;
    await act(async () => {
      localRoot.render(<PublicLandingPasswordAuthControls />);
    });

    expect(navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      to: "/home",
    });
  });
});
