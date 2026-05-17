import { Layout, PublicLayoutShell } from "#src/Layout.tsx";
import { shouldRenderPublicLandingWithoutAuthGate } from "#src/lib/publicLandingAuthState.ts";
import {
  type RootRouteSearch,
  useRootRouteSearch,
} from "#src/lib/rootRouteSearch.ts";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";

function isLegalPublicPath(pathname: string) {
  return pathname === "/privacy" || pathname === "/terms";
}

function shouldUsePublicLayoutShell(args: {
  isAuthenticated: boolean;
  isLoading: boolean;
  pathname: string;
  rootRouteSearch: RootRouteSearch;
}) {
  if (isLegalPublicPath(args.pathname)) {
    return true;
  }

  if (args.pathname !== "/" || args.isAuthenticated) {
    return false;
  }

  return (
    shouldRenderPublicLandingWithoutAuthGate(
      args.pathname,
      args.rootRouteSearch,
    ) || !args.isLoading
  );
}

function PublicLayoutRoute() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const rootRouteSearch = useRootRouteSearch();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const shouldUseShell = shouldUsePublicLayoutShell({
    isAuthenticated,
    isLoading,
    pathname,
    rootRouteSearch,
  });

  if (!shouldUseShell) {
    return <Outlet />;
  }

  return (
    <Layout>
      <PublicLayoutShell>
        <Outlet />
      </PublicLayoutShell>
    </Layout>
  );
}

export const Route = createFileRoute("/_public")({
  component: PublicLayoutRoute,
});
