import { setAuthFlag } from "@/authClient";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";

export function useCloseOAuthPopup(pathname: string, enabled: boolean) {
  const { isAuthenticated } = useConvexAuth();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!isAuthenticated) {
      return;
    }

    // Remember that this user has authenticated, so we can auto-login next time.
    if (!window.opener) {
      setAuthFlag();
    }

    if (!window.opener) {
      return;
    }

    const authKeys = Object.keys(localStorage).filter((key) => key.startsWith("__convexAuth"));
    const authTokens: Record<string, string> = {};

    for (const key of authKeys) {
      authTokens[key] = localStorage.getItem(key) ?? "";
    }

    try {
      const parentLocalStorage = window.opener.localStorage;

      for (const [key, value] of Object.entries(authTokens)) {
        parentLocalStorage.setItem(key, value);
      }

      window.opener.location.reload();
    } catch {
      window.opener.postMessage({ type: "convex-auth-tokens", tokens: authTokens }, "*");
    }

    window.close();
  }, [enabled, isAuthenticated, pathname]);
}
