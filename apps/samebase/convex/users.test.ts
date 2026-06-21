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
  it("marks granted and missing OAuth scopes", () => {
    expect(
      buildGithubRequiredScopeHealth({
        authMethod: "oauth",
        grantedScopes: ["repo", "user", "read:packages"],
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

  it("treats API key scope headers as optional signal", () => {
    expect(
      buildGithubRequiredScopeHealth({
        authMethod: "api_key",
        grantedScopes: [],
      }).map((scope) => scope.status),
    ).toEqual(["unknown", "unknown", "unknown", "unknown", "unknown"]);
  });
});
