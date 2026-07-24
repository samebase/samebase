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
    scope: "read:org",
    label: "Read organization memberships",
  },
  {
    scope: "read:packages",
    label: "Read packages",
  },
] as const;

export function getGitHubOAuthScopeRequirements() {
  return [...BASE_GITHUB_OAUTH_SCOPES];
}

export function buildGitHubOAuthManageUrl(clientId: string): string {
  return `https://github.com/settings/connections/applications/${encodeURIComponent(clientId)}`;
}

export function isSafeGithubOAuthReturnToPath(returnToPath: string) {
  return returnToPath.startsWith("/") && !returnToPath.startsWith("//");
}
