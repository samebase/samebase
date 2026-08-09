import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { AuthorizationError } from "../../shared/authorizationError";
import { formatAuthorizationErrorMessage } from "./authorizationErrorMessage";

function renderAuthorizationError(
  authorizationError: AuthorizationError,
  targets?: Parameters<typeof formatAuthorizationErrorMessage>[1],
): string {
  return renderToStaticMarkup(<>{formatAuthorizationErrorMessage(authorizationError, targets)}</>);
}

describe("formatAuthorizationErrorMessage", () => {
  it.each([
    {
      authorizationError: { code: "canceled", provider: "cloudflare" },
      expected: "Cloudflare authorization was canceled. No changes were saved.",
    },
    {
      authorizationError: { code: "expired", provider: "convex" },
      expected: "Convex authorization expired. Start again.",
    },
    {
      authorizationError: { code: "access-changed", provider: "github-user" },
      expected:
        "You no longer have permission to complete this authorization. No changes were saved.",
    },
    {
      authorizationError: { code: "configuration-changed", provider: "cloudflare" },
      expected: "The Cloudflare connection changed before authorization finished. Start again.",
    },
    {
      authorizationError: { code: "failed", provider: "github-app" },
      expected: "GitHub App setup failed. Try again.",
    },
    {
      authorizationError: { code: "account-link-required", provider: "github-sign-in" },
      expected:
        "The primary email on this GitHub account is already used by another Samebase account. Sign in to that account with an existing method, then connect GitHub in Account settings.",
    },
    {
      authorizationError: { code: "account-link-required", provider: "google-sign-in" },
      expected:
        "The email on this Google account is already used by another Samebase account. Sign in to that account with an existing method, then connect Google in Account settings.",
    },
    {
      authorizationError: { code: "target-mismatch", provider: "github-sign-in" },
      expected: "Select the provider account that is connected to this Samebase account.",
    },
  ] satisfies readonly {
    authorizationError: AuthorizationError;
    expected: string;
  }[])("formats $authorizationError.provider $authorizationError.code", (testCase) => {
    expect(renderAuthorizationError(testCase.authorizationError)).toBe(testCase.expected);
  });

  it("names the Convex team that must be selected", () => {
    expect(
      renderAuthorizationError(
        { code: "target-mismatch", provider: "convex" },
        { convexTeamName: "acme-platform" },
      ),
    ).toBe(
      'Select Convex team <strong class="font-semibold">acme-platform</strong> to reauthorize this organization.',
    );
  });

  it("uses a safe Convex fallback when the team name is unavailable", () => {
    expect(renderAuthorizationError({ code: "target-mismatch", provider: "convex" })).toBe(
      "Select the configured Convex team to reauthorize this organization.",
    );
  });

  it("names the GitHub owner whose App must be reconnected", () => {
    expect(
      renderAuthorizationError(
        { code: "target-mismatch", provider: "github-app" },
        { githubOwnerLogin: "acme" },
      ),
    ).toBe(
      'Reconnect the GitHub App for <strong class="font-semibold">acme</strong>. The selected installation belongs to a different GitHub owner.',
    );
  });

  it("uses a safe GitHub App fallback when the owner is unavailable", () => {
    expect(renderAuthorizationError({ code: "target-mismatch", provider: "github-app" })).toBe(
      "Reconnect the GitHub App for the configured owner. The selected installation belongs to a different GitHub owner.",
    );
  });

  it("names the personal GitHub sign-in method that is required", () => {
    expect(
      renderAuthorizationError(
        { code: "github-sign-in-required", provider: "github-user" },
        { githubOwnerLogin: "octocat" },
      ),
    ).toBe(
      "Personal GitHub access requires @octocat as the GitHub sign-in method for this Samebase account. Connect it in Account settings, then try again.",
    );
  });

  it("uses a safe personal GitHub sign-in fallback when the owner is unavailable", () => {
    expect(
      renderAuthorizationError({ code: "github-sign-in-required", provider: "github-app" }),
    ).toBe(
      "Personal GitHub access requires the same GitHub account as the GitHub sign-in method for this Samebase account. Connect GitHub in Account settings, then try again.",
    );
  });

  it("explains a personal GitHub sign-in mismatch without exposing another account", () => {
    expect(
      renderAuthorizationError(
        { code: "github-sign-in-mismatch", provider: "github-user" },
        { githubOwnerLogin: "octocat" },
      ),
    ).toBe("Use the Samebase account connected to GitHub as @octocat, then try again.");
  });

  it("uses a safe personal GitHub mismatch fallback when the owner is unavailable", () => {
    expect(
      renderAuthorizationError({ code: "github-sign-in-mismatch", provider: "github-app" }),
    ).toBe(
      "Use a Samebase account whose GitHub sign-in method matches the personal GitHub account, then try again.",
    );
  });
});
