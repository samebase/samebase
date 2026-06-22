import { CODESPACES_ENABLED } from "./featureFlags";

export const GITHUB_OAUTH_POPUP_NAME = "github-oauth";

const BASE_GITHUB_OAUTH_SCOPES = [
  {
    scope: "repo",
    label: "List and edit repositories",
  },
  {
    scope: "delete_repo",
    label: "Delete Samebase-managed repositories",
  },
  {
    scope: "user",
    label: "Read GitHub profile",
  },
  {
    scope: "user:email",
    label: "Read GitHub email addresses",
  },
  {
    scope: "read:packages",
    label: "Read packages",
  },
] as const;

const CODESPACES_GITHUB_OAUTH_SCOPE = {
  scope: "codespace",
  label: "Manage Codespaces",
} as const;

export type GitHubOAuthScopeRequirement =
  | (typeof BASE_GITHUB_OAUTH_SCOPES)[number]
  | typeof CODESPACES_GITHUB_OAUTH_SCOPE;

export function getGitHubOAuthScopeRequirements() {
  return CODESPACES_ENABLED
    ? [...BASE_GITHUB_OAUTH_SCOPES, CODESPACES_GITHUB_OAUTH_SCOPE]
    : [...BASE_GITHUB_OAUTH_SCOPES];
}

export function buildGitHubOAuthManageUrl(clientId: string): string {
  return `https://github.com/settings/connections/applications/${encodeURIComponent(clientId)}`;
}

export function isSafeGithubOAuthReturnToPath(returnToPath: string) {
  return returnToPath.startsWith("/") && !returnToPath.startsWith("//");
}
