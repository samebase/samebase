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
      providerName: "Cloudflare",
    },
    { authorizationError: { code: "expired", provider: "convex" }, providerName: "Convex" },
    {
      authorizationError: { code: "started-by-another-account", provider: "convex" },
      providerName: "Convex",
    },
    {
      authorizationError: { code: "configuration-changed", provider: "cloudflare" },
      providerName: "Cloudflare",
    },
    { authorizationError: { code: "failed", provider: "github-app" }, providerName: "GitHub App" },
    { authorizationError: { code: "failed", provider: "github-user" }, providerName: "GitHub" },
  ] satisfies readonly {
    authorizationError: AuthorizationError;
    providerName: string;
  }[])(
    "names the provider for $authorizationError.provider $authorizationError.code",
    (testCase) => {
      expect(renderAuthorizationError(testCase.authorizationError)).toContain(
        testCase.providerName,
      );
    },
  );

  it.each([
    {
      authorizationError: { code: "target-mismatch", provider: "convex" },
      target: "acme-platform",
      targets: { convexTeamName: "acme-platform" },
    },
    {
      authorizationError: { code: "target-mismatch", provider: "github-app" },
      target: "@acme",
      targets: { githubOwnerLogin: "acme" },
    },
    {
      authorizationError: { code: "github-sign-in-required", provider: "github-user" },
      target: "@octocat",
      targets: { githubOwnerLogin: "octocat" },
    },
    {
      authorizationError: { code: "github-sign-in-mismatch", provider: "github-user" },
      target: "@octocat",
      targets: { githubOwnerLogin: "octocat" },
    },
  ] satisfies readonly {
    authorizationError: AuthorizationError;
    target: string;
    targets: Parameters<typeof formatAuthorizationErrorMessage>[1];
  }[])(
    "names the target for $authorizationError.provider $authorizationError.code and falls back without it",
    (testCase) => {
      expect(renderAuthorizationError(testCase.authorizationError, testCase.targets)).toContain(
        testCase.target,
      );

      const fallback = renderAuthorizationError(testCase.authorizationError);
      expect(fallback).not.toBe("");
      expect(fallback).not.toContain("undefined");
    },
  );
});
