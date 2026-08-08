import { guard } from "@samebase/dependent";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { buildOAuthRedirectSearch, type OAuthAuthProvider } from "@/lib/oauthAuthRedirect";
import { type RootRouteSearch } from "@/routeSearch/root";
import { resetSamebasePostHogClient } from "@/lib/posthogClient";

const POPUP_WATCH_INTERVAL_MS = 500;
const POPUP_WATCH_TIMEOUT_MS = 120_000;
type AuthActions = ReturnType<typeof useAuthActions>;
type SignInAction = AuthActions["signIn"];
type SignOutAction = AuthActions["signOut"];
type PostHogResetClient = {
  reset: () => void;
};
type PasswordSignInArgs = {
  flow: "signIn" | "signUp";
  email: string;
  password: string;
};

type AuthPopupMessage = {
  redirectTo?: unknown;
  type?: unknown;
  tokens?: unknown;
};

// eslint-disable-next-line samebase/no-hand-written-type-predicate -- record-shape-over-unknown: control flow cannot earn an index signature
function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  for (const entryValue of Object.values(value)) {
    if (typeof entryValue !== "string") {
      return false;
    }
  }
  return true;
}

const isAuthPopupRedirectTo = guard<unknown, string>((value) => {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return null;
  }

  try {
    const redirectUrl = new URL(value, window.location.origin);
    return redirectUrl.origin === window.location.origin && redirectUrl.pathname === DASHBOARD_ROUTE
      ? value
      : null;
  } catch {
    return null;
  }
});

export async function signInWithAgentBrowserHandoffAction(args: {
  signIn: SignInAction;
  token: string;
}): Promise<void> {
  const result = await args.signIn("agent-browser-handoff", { token: args.token });
  if (!result.signingIn) {
    throw new Error("Browser handoff is invalid or no longer available.");
  }
}

/**
 * Sign-out should always continue even if PostHog cleanup fails, otherwise a
 * telemetry issue can block the user from leaving the current session.
 */
export function signOutWithAnalytics(args: {
  signOut: SignOutAction;
  posthog: PostHogResetClient;
}) {
  try {
    args.posthog.reset();
  } catch {
    // Analytics cleanup is best-effort; the auth sign-out must still complete.
  }
  return args.signOut();
}

const deferredPostHogResetClient: PostHogResetClient = {
  /**
   * Reset PostHog on sign-out without importing analytics into the initial auth
   * client chunk. The PostHog helper keeps the SDK import lazy, so sign-out can
   * clear analytics identity without making the public landing path preload it.
   */
  reset: () => {
    void resetSamebasePostHogClient();
  },
};

export function useAppSignInActions() {
  const { signIn } = useAuthActions();

  return {
    signInWithOAuth: (provider: OAuthAuthProvider, redirectTo: string) =>
      signIn(provider, { redirectTo }),
    signInWithPassword: (args: PasswordSignInArgs) => signIn("password", args),
  };
}

export function useAppAuthActions() {
  const { signOut } = useAuthActions();

  return {
    signOut: () =>
      signOutWithAnalytics({
        posthog: deferredPostHogResetClient,
        signOut,
      }),
  };
}

export function isInIframe() {
  try {
    return window !== window.top;
  } catch {
    return true;
  }
}

export function openAuthPopup(
  provider: OAuthAuthProvider,
  options: {
    popupPath: string;
  },
) {
  // Don't call signIn directly; the library would try window.location.href
  // which breaks in iframes. Instead open a popup that will auto-trigger sign-in.
  // Listen for auth tokens sent from the popup via postMessage.
  let popup: Window | null = null;
  let popupPollIntervalId: number | null = null;
  let popupTimeoutId: number | null = null;
  const expectedOrigin = window.location.origin;
  const cleanup = () => {
    window.removeEventListener("message", handler);
    if (popupPollIntervalId !== null) {
      window.clearInterval(popupPollIntervalId);
      popupPollIntervalId = null;
    }
    if (popupTimeoutId !== null) {
      window.clearTimeout(popupTimeoutId);
      popupTimeoutId = null;
    }
  };
  const handler = (event: MessageEvent) => {
    if (event.origin !== expectedOrigin) return;
    if (popup && event.source !== popup) return;
    const messageData: AuthPopupMessage =
      typeof event.data === "object" && event.data !== null ? event.data : {};
    if (messageData.type !== "convex-auth-tokens") return;
    if (!isStringRecord(messageData.tokens)) {
      console.warn("authClient:ignored popup message with invalid token payload");
      return;
    }
    const previousTokenValues = new Map<string, string | null>();
    try {
      for (const [key, value] of Object.entries(messageData.tokens)) {
        previousTokenValues.set(key, localStorage.getItem(key));
        localStorage.setItem(key, value);
      }
    } catch {
      for (const [key, previousValue] of previousTokenValues) {
        try {
          if (previousValue === null) {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, previousValue);
          }
        } catch {
          // Auth fallback rollback is best-effort when browser storage is failing.
        }
      }
      console.warn("authClient:failed to persist popup auth tokens");
      cleanup();
      return;
    }
    cleanup();
    if (isAuthPopupRedirectTo(messageData.redirectTo)) {
      window.location.href = messageData.redirectTo;
      return;
    }
    window.location.reload();
  };
  window.addEventListener("message", handler);

  popup = window.open(
    `${window.location.origin}${options.popupPath}`,
    `${provider}-oauth`,
    "width=600,height=700,popup=true",
  );
  if (!popup) {
    cleanup();
    return;
  }
  popupPollIntervalId = window.setInterval(() => {
    if (popup.closed) {
      cleanup();
    }
  }, POPUP_WATCH_INTERVAL_MS);
  popupTimeoutId = window.setTimeout(() => {
    cleanup();
  }, POPUP_WATCH_TIMEOUT_MS);
}

/**
 * Auto-trigger provider sign-in when an OAuth popup or top-level route sets
 * its one-use `auth` search value.
 * The popup handles the full OAuth redirect flow (not blocked by CSP
 * since it's a top-level window). After auth completes, the popup
 * auto-closes and the token syncs to the parent via localStorage.
 */
export function useAutoSignIn(rootRouteSearch: RootRouteSearch) {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const authProvider = rootRouteSearch.auth;
  const authReturn = rootRouteSearch["auth-return"];
  const signupReturn = rootRouteSearch.signup;
  useEffect(() => {
    if (authProvider !== undefined) {
      const redirectTo = router.buildLocation({
        hash: true,
        search: (currentSearch) =>
          buildOAuthRedirectSearch(currentSearch, authProvider, {
            markPublicSignupReturn: signupReturn === authProvider,
          }),
        state: true,
        to: authReturn === "dashboard" ? DASHBOARD_ROUTE : ".",
      }).href;
      // Preserve TanStack Router history metadata while stripping auth params
      // from the popup/bootstrap URL before the provider redirect begins.
      window.history.replaceState(window.history.state, "", redirectTo);
      void signIn(authProvider, { redirectTo });
    }
  }, [authProvider, authReturn, router, signIn, signupReturn]);
}
