// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { PasswordAuthForm } from "@/components/PublicLandingAuthControls";

vi.mock("@/authClient", () => ({
  useAppSignInActions: () => ({
    signInWithPassword: vi.fn(),
  }),
}));

describe("PasswordAuthForm", () => {
  it("uses sign-in copy for the sign-in route flow on preview auth", () => {
    const markup = renderToStaticMarkup(<PasswordAuthForm flow="signIn" surface="preview" />);

    expect(markup).toContain("Sign in");
    expect(markup).not.toContain("Create account");
  });

  it("uses create-account copy for the create-account route flow on preview auth", () => {
    const markup = renderToStaticMarkup(<PasswordAuthForm flow="signUp" surface="preview" />);

    expect(markup).toContain("Create account");
    expect(markup).not.toContain("Sign in</button>");
  });
});
