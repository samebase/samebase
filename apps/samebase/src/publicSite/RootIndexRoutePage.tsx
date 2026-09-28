import { LandingPage } from "@/publicSite/LandingPreviewPage";
import { useLocation } from "@tanstack/react-router";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useAppAuthRuntimeEffects } from "@/auth/useAppAuthRuntimeEffects";
import { useRootRouteSearch } from "@/routeSearch/root";
import { useMemo } from "react";

export function RootIndexRoutePage() {
  const location = useLocation();
  const rootRouteSearch = useRootRouteSearch();

  useAppAuthRuntimeEffects(location.pathname, rootRouteSearch);
  usePageMetadata(
    useMemo(
      () =>
        resolvePageMetadata({
          pathname: location.pathname,
          isAuthenticated: false,
        }),
      [location.pathname],
    ),
  );

  return <LandingPage />;
}
