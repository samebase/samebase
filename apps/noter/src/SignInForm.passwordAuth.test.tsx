// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { PasswordAuthForm } from "@/components/PublicLandingAuthControls";

const { signInWithPasswordMock } = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
}));
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

vi.mock("@/authClient", () => ({
  useNoterSignInActions: () => ({
    signInWithPassword: signInWithPasswordMock,
  }),
}));

function renderPasswordAuthForm(surface: "local_worktree" | "preview"): string {
  return renderToStaticMarkup(<PasswordAuthForm surface={surface} />);
}

describe("PasswordAuthForm", () => {
  let root: Root | null = null;

  afterEach(() => {
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

    expect(markup).toContain("Preview password sign in");
    expect(markup).toContain('placeholder="you@example.com"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain(">Sign in</button>");
    expect(markup).not.toContain("Need an account?");
    expect(markup).not.toContain("Create account");
    expect(markup).not.toContain("Autofill &amp; sign in");
  });

  it("renders the local-worktree surface with account creation controls", () => {
    const markup = renderPasswordAuthForm("local_worktree");

    expect(markup).toContain("Password auth (local worktree)");
    expect(markup).toContain("Need an account?");
    expect(markup).toContain("Autofill &amp; sign in");
    expect(markup).toContain(">Sign in</button>");
    expect(markup).not.toContain("Preview password sign in");
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
});
