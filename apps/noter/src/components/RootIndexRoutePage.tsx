import { Layout } from "@/Layout";
import { SignInForm } from "@/SignInForm";
import { ApprovalGate } from "@/components/ApprovalGate";
import { useLocation } from "@tanstack/react-router";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import {
  shouldRenderPublicLandingWithoutAuthGate,
} from "@/lib/publicLandingAuthState";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { useConvexAuth, Authenticated, Unauthenticated } from "convex/react";
import { lazy, Suspense, useMemo } from "react";

const VaultDashboard = lazy(async () => {
  const module = await import("@/components/VaultDashboard");
  return { default: module.VaultDashboard };
});

export function RootIndexRoutePage() {
  const location = useLocation();
  const rootRouteSearch = useRootRouteSearch();
  const { isAuthenticated } = useConvexAuth();
  const showPublicLandingWithoutAuthGate =
    !isAuthenticated &&
    shouldRenderPublicLandingWithoutAuthGate(
      location.pathname,
      rootRouteSearch,
    );

  useAppAuthRuntimeEffects(location.pathname, rootRouteSearch.auth);
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

  return (
    <Layout>
      {showPublicLandingWithoutAuthGate ? (
        <SignInForm />
      ) : (
        <>
          <Authenticated>
            <ApprovalGate>
              <Suspense fallback={null}>
                <VaultDashboard />
              </Suspense>
            </ApprovalGate>
          </Authenticated>
          <Unauthenticated>
            <Suspense fallback={null}>
              <SignInForm />
            </Suspense>
          </Unauthenticated>
        </>
      )}
    </Layout>
  );
}
