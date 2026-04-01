import {
  GITHUB_OAUTH_POPUP_NAME,
  GITHUB_OAUTH_RETURN_TO_STORAGE_KEY,
} from "../../shared/githubOAuth";

type BrowserLocation = Pick<Location, "hash" | "pathname" | "search">;

export function rememberGithubOAuthReturnTo(location: BrowserLocation) {
  const returnToPath = `${location.pathname}${location.search}${location.hash}`;
  window.sessionStorage.setItem(
    GITHUB_OAUTH_RETURN_TO_STORAGE_KEY,
    returnToPath,
  );
}

export function openGithubOAuthPopup(oauthUrl: string) {
  const popup = window.open(
    "",
    GITHUB_OAUTH_POPUP_NAME,
    "width=600,height=700,popup=true",
  );
  if (!popup) {
    return null;
  }

  // Clear the popup opener before leaving our origin so the third-party OAuth
  // page cannot navigate the parent tab.
  popup.opener = null;
  popup.location.assign(oauthUrl);
  return popup;
}
