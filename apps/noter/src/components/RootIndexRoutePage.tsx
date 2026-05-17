import { Layout } from "#src/Layout.tsx";
import { SignInForm } from "#src/SignInForm.tsx";
import { ApprovalGate } from "#src/components/ApprovalGate.tsx";
import { useLocation } from "@tanstack/react-router";
import { resolvePageMetadata } from "#src/lib/pageMetadata.ts";
import { shouldRenderPublicLandingWithoutAuthGate } from "#src/lib/publicLandingAuthState.ts";
import { usePageMetadata } from "#src/lib/usePageMetadata.ts";
import { useAppAuthRuntimeEffects } from "#src/lib/useAppAuthRuntimeEffects.ts";
import { useRootRouteSearch } from "#src/lib/rootRouteSearch.ts";
import { useConvexAuth, Authenticated } from "convex/react";
import { lazy, Suspense, useMemo } from "react";

const VaultDashboard = lazy(async () => {
  const module =
    await import("#src/components/vault-dashboard/VaultDashboard.tsx");
  return { default: module.VaultDashboard };
});

export function RootIndexRoutePage() {
  const location = useLocation();
  const rootRouteSearch = useRootRouteSearch();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const shouldSkipAuthGate =
    !isAuthenticated &&
    shouldRenderPublicLandingWithoutAuthGate(
      location.pathname,
      rootRouteSearch,
    );
  const shouldRenderPublicLanding =
    !isAuthenticated &&
    (shouldSkipAuthGate || (!isLoading && location.pathname === "/"));

  useAppAuthRuntimeEffects(location.pathname, rootRouteSearch);
  usePageMetadata(
    useMemo(
      () =>
        resolvePageMetadata({
          pathname: location.pathname,
          isAuthenticated,
        }),
      [isAuthenticated, location.pathname],
    ),
  );

  const publicLandingContent = (
    <Suspense fallback={null}>
      <SignInForm authPlacement="sidebar" />
    </Suspense>
  );

  if (shouldRenderPublicLanding) {
    return publicLandingContent;
  }

  return (
    <Layout>
      <Authenticated>
        <ApprovalGate>
          <Suspense fallback={null}>
            <VaultDashboard />
          </Suspense>
        </ApprovalGate>
      </Authenticated>
    </Layout>
  );
}
