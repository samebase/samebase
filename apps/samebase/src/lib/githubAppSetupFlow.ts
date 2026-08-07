import { GITHUB_APP_SETUP_POPUP_NAME } from "../../shared/githubApp";
import { isRecord } from "@samebase/dependent";

const GITHUB_APP_SETUP_COMPLETION_TIMEOUT_MS = 10 * 60 * 1000;

export type GitHubAuthorizationSetup = {
  callbackOrigin: string;
  setupUrl: string;
};

export function handleGitHubAppSetupCompletionMessage(args: {
  event: MessageEvent;
  expectedCallbackOrigin: string;
  expectedReturnOrigin: string;
  navigate: (returnTo: string) => void;
  popup: Window;
}): boolean {
  if (
    args.event.source !== args.popup ||
    args.event.origin !== args.expectedCallbackOrigin ||
    !isRecord(args.event.data) ||
    args.event.data["type"] !== "github-app-setup-complete" ||
    typeof args.event.data["returnTo"] !== "string"
  ) {
    return false;
  }
  let returnUrl: URL;
  try {
    returnUrl = new URL(args.event.data["returnTo"]);
  } catch {
    return false;
  }
  if (returnUrl.origin !== args.expectedReturnOrigin) {
    return false;
  }
  args.navigate(returnUrl.toString());
  return true;
}

/** Open the popup during the click event, before the setup URL request completes. */
export async function openGitHubAppSetupPopup(getSetup: () => Promise<GitHubAuthorizationSetup>) {
  const popup = window.open("", GITHUB_APP_SETUP_POPUP_NAME, "width=600,height=700,popup=true");

  try {
    const { callbackOrigin, setupUrl } = await getSetup();
    if (popup && !popup.closed) {
      const activePopup = popup;
      const completionTimeout = window.setTimeout(() => {
        window.removeEventListener("message", handleCompletion);
      }, GITHUB_APP_SETUP_COMPLETION_TIMEOUT_MS);
      function handleCompletion(event: MessageEvent) {
        if (
          !handleGitHubAppSetupCompletionMessage({
            event,
            expectedCallbackOrigin: callbackOrigin,
            expectedReturnOrigin: window.location.origin,
            navigate: (returnTo) => window.location.replace(returnTo),
            popup: activePopup,
          })
        ) {
          return;
        }
        window.clearTimeout(completionTimeout);
        window.removeEventListener("message", handleCompletion);
      }
      window.addEventListener("message", handleCompletion);
      activePopup.location.assign(setupUrl);
      return;
    }
    window.location.assign(setupUrl);
  } catch (error) {
    popup?.close();
    throw error;
  }
}
