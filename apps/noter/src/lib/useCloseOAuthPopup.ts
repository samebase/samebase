import { setAuthFlag } from "@/authClient";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";

function readSameOriginOpener(): Window | null {
  const opener = window.opener;
  if (!opener) {
    return null;
  }

  try {
    return opener.location.origin === window.location.origin ? opener : null;
  } catch {
    return null;
  }
}

function readPopupCompletionRedirect(pathname: string): string | undefined {
  if (pathname !== DASHBOARD_ROUTE) {
    return undefined;
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

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

    const opener = readSameOriginOpener();
    if (!opener) {
      return;
    }
    const redirectTo = readPopupCompletionRedirect(pathname);

    const authKeys = Object.keys(localStorage).filter((key) => key.startsWith("__convexAuth"));
    const authTokens: Record<string, string> = {};

    for (const key of authKeys) {
      authTokens[key] = localStorage.getItem(key) ?? "";
    }

    try {
      const parentLocalStorage = opener.localStorage;

      for (const [key, value] of Object.entries(authTokens)) {
        parentLocalStorage.setItem(key, value);
      }

      if (redirectTo) {
        opener.location.href = redirectTo;
      } else {
        opener.location.reload();
      }
    } catch {
      opener.postMessage(
        {
          redirectTo,
          type: "convex-auth-tokens",
          tokens: authTokens,
        },
        window.location.origin,
      );
    }

    window.close();
  }, [enabled, isAuthenticated, pathname]);
}
