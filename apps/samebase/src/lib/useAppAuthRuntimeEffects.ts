import { useAutoSignIn } from "@/authClient";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { useCloseOAuthPopup } from "@/lib/useCloseOAuthPopup";
import { type RootRouteSearch } from "@/routeSearch/root";
import { useRouter } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";

export function useAppAuthRuntimeEffects(pathname: string, rootRouteSearch: RootRouteSearch) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const authReturn = rootRouteSearch["auth-return"];
  const signupReturn = rootRouteSearch.signup;

  useAutoSignIn(rootRouteSearch);
  useCloseOAuthPopup(pathname, authReturn, true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname === DASHBOARD_ROUTE) {
      void router.navigate({
        href: "/",
        replace: true,
        state: true,
      });
      return;
    }

    if (!isAuthenticated) {
      return;
    }

    if (authReturn === "dashboard") {
      void router.navigate({
        replace: true,
        search: (currentSearch: RootRouteSearch) => ({
          ...currentSearch,
          auth: undefined,
          "auth-return": undefined,
          signup: undefined,
        }),
        state: true,
        to: DASHBOARD_ROUTE,
      });
      return;
    }

    if (signupReturn === undefined) {
      return;
    }

    const nextPath = router.buildLocation({
      hash: true,
      search: (currentSearch: RootRouteSearch) => ({
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
  }, [authReturn, isAuthenticated, isLoading, pathname, router, signupReturn]);
}
