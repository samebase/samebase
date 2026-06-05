import { useAutoSignIn } from "@/authClient";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import {
  clearPublicDashboardAuthReturn,
  consumePublicDashboardAuthReturnMode,
} from "@/lib/publicDashboardAuthReturn";
import { useCloseOAuthPopup } from "@/lib/useCloseOAuthPopup";
import { type RootRouteSearch } from "@/lib/rootRouteSearch";
import { useRouter } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";

export function useAppAuthRuntimeEffects(pathname: string, rootRouteSearch: RootRouteSearch) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const authReturn = rootRouteSearch["auth-return"];
  const signupReturn = rootRouteSearch.signup;

  useAutoSignIn(rootRouteSearch);
  useCloseOAuthPopup(pathname, true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname === DASHBOARD_ROUTE) {
      void router.navigate({
        href: "/",
        replace: true,
        state: true,
      });
      return;
    }

    if (!isLoading && !isAuthenticated && pathname === "/" && signupReturn === "google") {
      clearPublicDashboardAuthReturn();
      return;
    }

    const canCompleteDashboardAuthReturn = authReturn === "dashboard" || pathname === "/";
    const dashboardAuthReturnMode =
      isAuthenticated && canCompleteDashboardAuthReturn
        ? consumePublicDashboardAuthReturnMode()
        : null;
    const shouldCompleteDashboardAuthReturn =
      authReturn === "dashboard"
        ? dashboardAuthReturnMode !== null
        : dashboardAuthReturnMode === "popup";

    // Public-root sign-in writes this browser marker before the provider
    // redirect. The URL marker alone is not enough because effects run on every
    // authenticated render, including ordinary logged-in visits to `/`.
    if (isAuthenticated && shouldCompleteDashboardAuthReturn) {
      void router.navigate({
        replace: true,
        search: (currentSearch) => ({
          ...currentSearch,
          auth: undefined,
          "auth-return": undefined,
          "create-account": undefined,
          signup: undefined,
          "sign-in": undefined,
        }),
        state: true,
        to: DASHBOARD_ROUTE,
      });
      return;
    }

    if (!isAuthenticated || signupReturn !== "google") {
      return;
    }

    const nextPath = router.buildLocation({
      hash: true,
      search: (currentSearch) => ({
        ...currentSearch,
        "create-account": undefined,
        signup: undefined,
        "sign-in": undefined,
      }),
      state: true,
      to: ".",
    }).href;
    // Preserve TanStack Router bookkeeping while removing the one-shot
    // signup-return flag from the visible URL.
    window.history.replaceState(window.history.state, "", nextPath);
  }, [authReturn, isAuthenticated, isLoading, pathname, router, signupReturn]);
}
