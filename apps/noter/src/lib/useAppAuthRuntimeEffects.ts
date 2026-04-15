import { useAutoSignIn } from "@/authClient";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import { useCloseOAuthPopup } from "@/lib/useCloseOAuthPopup";
import { type RootRouteSearch } from "@/lib/rootRouteSearch";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";

export function useAppAuthRuntimeEffects(
  pathname: string,
  rootRouteSearch: RootRouteSearch,
) {
  const { isAuthenticated } = useConvexAuth();

  useAutoSignIn(rootRouteSearch.auth);
  useCloseOAuthPopup(pathname, true);

  useEffect(() => {
    if (!isAuthenticated || rootRouteSearch.signup !== "google") {
      return;
    }

    const nextPath = buildPathWithUpdatedQuery(
      {
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      },
      (searchParams) => {
        setQueryParam(searchParams, "signup", false);
      },
    );
    // Preserve TanStack Router bookkeeping while removing the one-shot
    // signup-return flag from the visible URL.
    window.history.replaceState(window.history.state, "", nextPath);
  }, [isAuthenticated, rootRouteSearch.signup]);
}
