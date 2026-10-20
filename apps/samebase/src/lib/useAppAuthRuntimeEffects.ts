import { useAutoSignIn } from "@/authClient";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { readSignInNextHref, type RootRouteSearch } from "@/routeSearch/root";
import { useRouter } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";

export function useAppAuthRuntimeEffects(rootRouteSearch: RootRouteSearch) {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const authReturn = rootRouteSearch["auth-return"];
  const nextHref = readSignInNextHref(rootRouteSearch);
  const signupReturn = rootRouteSearch.signup;

  useAutoSignIn(rootRouteSearch);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // The session is confirmed here, so the private page's gate lets the navigation through.
    if (nextHref !== null) {
      void router.navigate({ href: nextHref, replace: true });
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
  }, [authReturn, isAuthenticated, nextHref, router, signupReturn]);
}
