import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect } from "react";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import { buildCurrentGoogleRedirectTo } from "@/lib/googleAuthRedirect";
import { type RootRouteSearch } from "@/lib/rootRouteSearch";
import { usePostHog } from "posthog-js/react";

const AUTH_FLAG_KEY = "noter_was_authenticated";
const AUTH_PROVIDER_KEY = "noter_auth_provider";

type AuthProvider = "google" | "password";
const POPUP_WATCH_INTERVAL_MS = 500;
const POPUP_WATCH_TIMEOUT_MS = 120_000;
type AuthActions = ReturnType<typeof useAuthActions>;
type SignInAction = AuthActions["signIn"];
type SignOutAction = AuthActions["signOut"];
type PostHogClient = ReturnType<typeof usePostHog>;
type PasswordSignInArgs = {
  flow: "signIn" | "signUp";
  email: string;
  password: string;
};

type AuthPopupMessage = {
  type?: unknown;
  tokens?: unknown;
};

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

export function clearAuthFlag() {
  localStorage.removeItem(AUTH_FLAG_KEY);
  localStorage.removeItem(AUTH_PROVIDER_KEY);
}

export function setAuthFlag() {
  localStorage.setItem(AUTH_FLAG_KEY, "1");
}

export function setAuthProvider(provider: AuthProvider) {
  localStorage.setItem(AUTH_PROVIDER_KEY, provider);
}

/**
 * Keep provider bookkeeping next to the auth action so every Google login path
 * stamps the same provider before redirecting into Convex Auth.
 */
export function signInWithGoogleAction(args: {
  signIn: SignInAction;
  redirectTo: string;
}) {
  setAuthProvider("google");
  return args.signIn("google", { redirectTo: args.redirectTo });
}

/**
 * Password auth does not redirect, so mark the provider after the auth action
 * resolves successfully.
 */
export function signInWithPasswordAction(
  args: {
    signIn: SignInAction;
  } & PasswordSignInArgs,
) {
  return args
    .signIn("password", {
      flow: args.flow,
      email: args.email,
      password: args.password,
    })
    .then(() => {
      setAuthProvider("password");
    });
}

/**
 * Sign-out should always continue even if PostHog cleanup fails, otherwise a
 * telemetry issue can block the user from leaving the current session.
 */
export function signOutWithAnalytics(args: {
  signOut: SignOutAction;
  posthog: Pick<PostHogClient, "reset">;
}) {
  clearAuthFlag();
  try {
    args.posthog.reset();
  } catch {
    // Analytics cleanup is best-effort; the auth sign-out must still complete.
  }
  return args.signOut();
}

export function useNoterAuthActions() {
  const { signIn, signOut } = useAuthActions();
  const posthog = usePostHog();

  return {
    signInWithGoogle: (redirectTo: string) =>
      signInWithGoogleAction({ signIn, redirectTo }),
    signInWithPassword: (args: PasswordSignInArgs) =>
      signInWithPasswordAction({ signIn, ...args }),
    signOut: () => signOutWithAnalytics({ signOut, posthog }),
  };
}

export function isInIframe() {
  try {
    return window !== window.top;
  } catch {
    return true;
  }
}

export function openAuthPopup(provider: "google") {
  // Don't call signIn directly — the library would try window.location.href
  // which breaks in iframes. Instead open a popup that will auto-trigger sign-in.
  // Listen for auth tokens sent from the popup via postMessage.
  setAuthProvider(provider);
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
    cleanup();
    if (!isStringRecord(messageData.tokens)) {
      console.warn(
        "authClient:ignored popup message with invalid token payload",
      );
      return;
    }
    for (const [key, value] of Object.entries(messageData.tokens)) {
      localStorage.setItem(key, value);
    }
    window.location.reload();
  };
  window.addEventListener("message", handler);

  const popupPath = buildPathWithUpdatedQuery(
    {
      pathname: "/",
      search: window.location.search,
    },
    (searchParams) => {
      setQueryParam(searchParams, "auth", provider);
    },
  );
  popup = window.open(
    `${window.location.origin}${popupPath}`,
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
 * Auto-trigger provider sign-in when opened as a popup with ?auth=google
 * or when the fast public shell forces top-level ?auth=google on `/`.
 * The popup handles the full OAuth redirect flow (not blocked by CSP
 * since it's a top-level window). After auth completes, the popup
 * auto-closes and the token syncs to the parent via localStorage.
 */
export function useAutoSignIn(auth: RootRouteSearch["auth"]) {
  const { signIn } = useAuthActions();
  useEffect(() => {
    if (auth === "google") {
      const redirectTo = buildCurrentGoogleRedirectTo(
        window.location.pathname,
        window.location.search,
        window.location.hash,
      );
      window.history.replaceState({}, "", redirectTo);
      void signInWithGoogleAction({ signIn, redirectTo });
    }
  }, [auth, signIn]);
}
