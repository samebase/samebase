import { GITHUB_APP_SETUP_POPUP_NAME } from "../../shared/githubApp";

export function getCurrentRootRelativeUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** Open the popup during the click event, before the setup URL request completes. */
export async function openGitHubAppSetupPopup(getSetupUrl: () => Promise<string>) {
  const popup = window.open("", GITHUB_APP_SETUP_POPUP_NAME, "width=600,height=700,popup=true");
  if (popup) {
    popup.opener = null;
  }

  try {
    const setupUrl = await getSetupUrl();
    if (popup && !popup.closed) {
      popup.location.assign(setupUrl);
      return;
    }
    window.location.assign(setupUrl);
  } catch (error) {
    popup?.close();
    throw error;
  }
}
