import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { PasswordAuthForm } from "@/components/PublicLandingAuthControls";

vi.mock("@/authClient", () => ({
  useNoterSignInActions: () => ({
    signInWithPassword: vi.fn(),
  }),
}));

function renderPasswordAuthForm(surface: "local_worktree" | "preview"): string {
  return renderToStaticMarkup(<PasswordAuthForm surface={surface} />);
}

describe("PasswordAuthForm", () => {
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
});
