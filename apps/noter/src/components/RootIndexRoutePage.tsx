import { SignInForm } from "@/SignInForm";
import { useLocation } from "@tanstack/react-router";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { Suspense, useMemo } from "react";

export function RootIndexRoutePage({ landingPageMarkdown }: { landingPageMarkdown: string }) {
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
    <Suspense fallback={null}>
      <SignInForm
        authPlacement="sidebar"
        landingPageMarkdown={landingPageMarkdown}
        topNotice={null}
      />
    </Suspense>
  );
}
