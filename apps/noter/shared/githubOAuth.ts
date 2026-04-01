export const GITHUB_OAUTH_POPUP_NAME = "github-oauth";

export function isSafeGithubOAuthReturnToPath(returnToPath: string) {
  return returnToPath.startsWith("/") && !returnToPath.startsWith("//");
}
