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

function readPopupCompletionRedirect(
  pathname: string,
  authReturn: "dashboard" | undefined,
): string | undefined {
  if (pathname !== "/" || authReturn !== "dashboard") {
    return undefined;
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function useCloseOAuthPopup(
  pathname: string,
  authReturn: "dashboard" | undefined,
  enabled: boolean,
) {
  const { isAuthenticated } = useConvexAuth();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!isAuthenticated) {
      return;
    }

    const opener = readSameOriginOpener();
    if (!opener) {
      return;
    }
    const redirectTo = readPopupCompletionRedirect(pathname, authReturn);

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
  }, [authReturn, enabled, isAuthenticated, pathname]);
}
