import { GITHUB_OAUTH_POPUP_NAME } from "../../shared/githubOAuth";

/**
 * Open the GitHub OAuth popup without keeping a live opener reference.
 * Clearing the opener before leaving our origin prevents the third-party OAuth
 * page from navigating the parent tab.
 */
export function openGithubOAuthPopup(oauthUrl: string) {
  const popup = window.open(
    "",
    GITHUB_OAUTH_POPUP_NAME,
    "width=600,height=700,popup=true",
  );
  if (!popup) {
    return null;
  }

  popup.opener = null;
  popup.location.assign(oauthUrl);
  return popup;
}
