import { useAutoSignIn } from "@/authClient";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { useCloseOAuthPopup } from "@/lib/useCloseOAuthPopup";
import { readAuthorizationError } from "@/routeSearch/authorizationError";
import { type RootRouteSearch } from "@/routeSearch/root";
import { useRouter } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";

export function useAppAuthRuntimeEffects(pathname: string, rootRouteSearch: RootRouteSearch) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const signupReturn = rootRouteSearch.signup;
  const authorizationError = readAuthorizationError(rootRouteSearch);
  const authorizationErrorCode = authorizationError?.code;
  const authorizationProvider = authorizationError?.provider;

  useAutoSignIn(rootRouteSearch);
  useCloseOAuthPopup(pathname, true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname === DASHBOARD_ROUTE) {
      if (signupReturn !== undefined) {
        void router.navigate({
          replace: true,
          search: (currentSearch) => ({
            ...currentSearch,
            auth: undefined,
            "auth-return": undefined,
            "authorization-error": authorizationErrorCode,
            "authorization-provider": authorizationProvider,
            signup: signupReturn,
          }),
          state: true,
          to: "/",
        });
      } else {
        void router.navigate({
          href: "/",
          replace: true,
          state: true,
        });
      }
      return;
    }

    if (!isAuthenticated || signupReturn === undefined) {
      return;
    }

    const nextPath = router.buildLocation({
      hash: true,
      search: (currentSearch) => ({
        ...currentSearch,
        auth: undefined,
        "auth-return": undefined,
        signup: undefined,
      }),
      state: true,
      to: ".",
    }).href;
    // Preserve TanStack Router bookkeeping while removing the one-shot
    // signup-return flag from the visible URL.
    window.history.replaceState(window.history.state, "", nextPath);
  }, [
    authorizationErrorCode,
    authorizationProvider,
    isAuthenticated,
    isLoading,
    pathname,
    router,
    signupReturn,
  ]);
}
