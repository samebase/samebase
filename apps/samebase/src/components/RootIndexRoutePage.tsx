import { SignInForm } from "@/SignInForm";
import { useLocation } from "@tanstack/react-router";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { useRootRouteSearch } from "@/routeSearch/root";
import { useMemo } from "react";

const ROOT_LANDING_PAGE_MARKDOWN = "## Samebase is near.";

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

  return (
    <SignInForm
      authPlacement="sidebar"
      landingPageMarkdown={ROOT_LANDING_PAGE_MARKDOWN}
      logo="menger"
      topNotice={null}
    />
  );
}
