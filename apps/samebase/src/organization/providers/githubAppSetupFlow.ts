import { GITHUB_APP_SETUP_POPUP_NAME } from "../../../shared/githubApp";
import {
  buildAuthorizationErrorUrl,
  type AuthorizationProvider,
} from "../../../shared/authorizationError";
import { getCurrentRootRelativeUrl } from "../../lib/currentRootRelativeUrl";
import { readAuthorizationCompletionReturnTo } from "../../auth/authorizationCompletionMessage";

const GITHUB_APP_SETUP_COMPLETION_TIMEOUT_MS = 10 * 60 * 1000;
const GITHUB_APP_SETUP_POPUP_POLL_MS = 250;
const GITHUB_APP_SETUP_POPUP_CLOSE_GRACE_MS = 1000;

type GitHubAuthorizationProvider = Extract<AuthorizationProvider, "github-app" | "github-user">;

export type GitHubAuthorizationSetup = {
  callbackOrigin: string;
  setupUrl: string;
};

/** Open the popup during the click event, before the setup URL request completes. */
export async function openGitHubAppSetupPopup(
  provider: GitHubAuthorizationProvider,
  getSetup: () => Promise<GitHubAuthorizationSetup>,
) {
  const canceledReturnUrl = buildAuthorizationErrorUrl(getCurrentRootRelativeUrl(), {
    provider,
    code: "canceled",
  });
  const popup = window.open("", GITHUB_APP_SETUP_POPUP_NAME, "width=600,height=700,popup=true");

  try {
    const { callbackOrigin, setupUrl } = await getSetup();
    if (popup) {
      if (popup.closed) {
        window.location.replace(canceledReturnUrl);
        return;
      }
      const activePopup = popup;
      let completionTimeout: number | undefined;
      let popupCloseTimeout: number | undefined;
      let popupPoll: number | undefined;
      const cleanup = () => {
        if (completionTimeout !== undefined) {
          window.clearTimeout(completionTimeout);
        }
        if (popupCloseTimeout !== undefined) {
          window.clearTimeout(popupCloseTimeout);
        }
        if (popupPoll !== undefined) {
          window.clearInterval(popupPoll);
        }
        window.removeEventListener("message", handleCompletion);
      };
      function handleCompletion(event: MessageEvent) {
        const returnTo = readAuthorizationCompletionReturnTo({
          completionEventTypes: ["github-app-setup-complete"],
          event,
          expectedCallbackOrigin: callbackOrigin,
          expectedReturnOrigin: window.location.origin,
          popup: activePopup,
        });
        if (returnTo === null) {
          return;
        }
        cleanup();
        window.location.replace(returnTo);
      }
      window.addEventListener("message", handleCompletion);
      completionTimeout = window.setTimeout(cleanup, GITHUB_APP_SETUP_COMPLETION_TIMEOUT_MS);
      popupPoll = window.setInterval(() => {
        if (!activePopup.closed) {
          return;
        }
        if (popupCloseTimeout !== undefined) {
          return;
        }
        popupCloseTimeout = window.setTimeout(() => {
          cleanup();
          window.location.replace(canceledReturnUrl);
        }, GITHUB_APP_SETUP_POPUP_CLOSE_GRACE_MS);
      }, GITHUB_APP_SETUP_POPUP_POLL_MS);
      activePopup.location.assign(setupUrl);
      return;
    }
    window.location.assign(setupUrl);
  } catch (error) {
    popup?.close();
    throw error;
  }
}
