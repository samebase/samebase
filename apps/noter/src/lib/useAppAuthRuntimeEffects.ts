import { useAutoSignIn } from "#src/authClient.ts";
import { useCloseOAuthPopup } from "#src/lib/useCloseOAuthPopup.ts";
import { type RootRouteSearch } from "#src/lib/rootRouteSearch.ts";
import { useRouter } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";

export function useAppAuthRuntimeEffects(
  pathname: string,
  rootRouteSearch: RootRouteSearch,
) {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();

  useAutoSignIn(rootRouteSearch);
  useCloseOAuthPopup(pathname, true);

  useEffect(() => {
    if (!isAuthenticated || rootRouteSearch.signup !== "google") {
      return;
    }

    const nextPath = router.buildLocation({
      hash: true,
      search: (currentSearch) => ({
        ...currentSearch,
        signup: undefined,
      }),
      state: true,
      to: ".",
    }).href;
    // Preserve TanStack Router bookkeeping while removing the one-shot
    // signup-return flag from the visible URL.
    window.history.replaceState(window.history.state, "", nextPath);
  }, [isAuthenticated, rootRouteSearch.signup, router]);
}
