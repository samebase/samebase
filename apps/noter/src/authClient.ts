import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect } from "react";

const AUTH_FLAG_KEY = "noter_was_authenticated";
const AUTH_PROVIDER_KEY = "noter_auth_provider";

type AuthProvider = "google" | "password";

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
  const expectedOrigin = window.location.origin;
  const handler = (event: MessageEvent) => {
    if (event.origin !== expectedOrigin) return;
    if (popup && event.source !== popup) return;
    if (event.data?.type === "convex-auth-tokens") {
      window.removeEventListener("message", handler);
      const tokens = event.data.tokens as Record<string, string>;
      for (const [key, value] of Object.entries(tokens)) {
        localStorage.setItem(key, value);
      }
      window.location.reload();
    }
  };
  window.addEventListener("message", handler);

  popup = window.open(
    `${window.location.origin}/?auth=${provider}`,
    `${provider}-oauth`,
    "width=600,height=700,popup=true",
  );
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
      params.delete("auth");
      const newUrl =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "");
      window.history.replaceState({}, "", newUrl);
      void signIn(auth);
    }
  }, [signIn]);
}
