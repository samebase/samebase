import { describe, expect, it } from "vite-plus/test";

import { buildGithubRequiredScopeHealth, parseGitHubOAuthScopesHeader } from "./users";

describe("parseGitHubOAuthScopesHeader", () => {
  it("normalizes GitHub OAuth scope headers", () => {
    expect(parseGitHubOAuthScopesHeader("repo, user, repo, read:packages")).toEqual([
      "repo",
      "user",
      "read:packages",
    ]);
  });

  it("returns no scopes for missing headers", () => {
    expect(parseGitHubOAuthScopesHeader(null)).toEqual([]);
  });
});

describe("buildGithubRequiredScopeHealth", () => {
  it("marks granted and missing OAuth scopes when GitHub reports scopes", () => {
    expect(
      buildGithubRequiredScopeHealth({
        grantedScopes: ["repo", "user", "read:packages"],
        scopeReportAvailable: true,
      }),
    ).toEqual([
      {
        scope: "repo",
        label: "List and edit repositories",
        status: "granted",
      },
      {
        scope: "delete_repo",
        label: "Delete Samebase-managed repositories",
        status: "missing",
      },
      {
        scope: "user",
        label: "Read GitHub profile",
        status: "granted",
      },
      {
        scope: "user:email",
        label: "Read GitHub email addresses",
        status: "granted",
      },
      {
        scope: "read:packages",
        label: "Read packages",
        status: "granted",
      },
    ]);
  });

  it("does not treat user:email as granted when only that narrower scope is present", () => {
    const health = buildGithubRequiredScopeHealth({
      grantedScopes: ["repo", "user:email", "read:packages"],
      scopeReportAvailable: true,
    });

    expect(health.find((scope) => scope.scope === "user")?.status).toBe("missing");
    expect(health.find((scope) => scope.scope === "user:email")?.status).toBe("granted");
  });

  it("treats absent OAuth scope reports as unknown", () => {
    expect(
      buildGithubRequiredScopeHealth({
        grantedScopes: [],
        scopeReportAvailable: false,
      }).map((scope) => scope.status),
    ).toEqual(["unknown", "unknown", "unknown", "unknown", "unknown"]);
  });

  it("treats API key scope headers as optional signal", () => {
    expect(
      buildGithubRequiredScopeHealth({
        grantedScopes: [],
        scopeReportAvailable: false,
      }).map((scope) => scope.status),
    ).toEqual(["unknown", "unknown", "unknown", "unknown", "unknown"]);

    expect(
      buildGithubRequiredScopeHealth({
        grantedScopes: ["repo"],
        scopeReportAvailable: true,
      }).map((scope) => scope.status),
    ).toEqual(["granted", "missing", "missing", "missing", "missing"]);
  });
});
