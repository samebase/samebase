import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect } from "react";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";

const AUTH_FLAG_KEY = "noter_was_authenticated";
const AUTH_PROVIDER_KEY = "noter_auth_provider";

type AuthProvider = "google" | "password";
const POPUP_WATCH_INTERVAL_MS = 500;
const POPUP_WATCH_TIMEOUT_MS = 120_000;

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
    window.location,
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
 * Auto-trigger provider sign-in when opened as a popup with ?auth=google.
 * The popup handles the full OAuth redirect flow (not blocked by CSP
 * since it's a top-level window). After auth completes, the popup
 * auto-closes and the token syncs to the parent via localStorage.
 */
export function useAutoSignIn() {
  const { signIn } = useAuthActions();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (auth === "google" && window.opener) {
      setAuthProvider(auth);
      const newUrl = buildPathWithUpdatedQuery(
        window.location,
        (nextSearchParams) => {
          setQueryParam(nextSearchParams, "auth", false);
        },
      );
      window.history.replaceState({}, "", newUrl);
      void signIn(auth);
    }
  }, [signIn]);
}
