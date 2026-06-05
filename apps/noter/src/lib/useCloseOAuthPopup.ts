import { setAuthFlag } from "@/authClient";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
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

      if (pathname === DASHBOARD_ROUTE) {
        window.opener.location.href = DASHBOARD_ROUTE;
      } else {
        window.opener.location.reload();
      }
    } catch {
      window.opener.postMessage(
        {
          redirectTo: pathname === DASHBOARD_ROUTE ? DASHBOARD_ROUTE : undefined,
          type: "convex-auth-tokens",
          tokens: authTokens,
        },
        "*",
      );
    }

    window.close();
  }, [enabled, isAuthenticated, pathname]);
}
