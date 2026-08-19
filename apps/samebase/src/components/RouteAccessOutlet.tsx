import { ApprovalGateViewerAccessProvider } from "@/components/ApprovalGate";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import { TermsAcceptanceScreen } from "@/components/TermsAcceptanceGate";
import { ACCOUNT_DELETION_ROUTE } from "@/lib/accountDeletionRoute";
import { SETTINGS_ROUTE } from "@/lib/settingsRoute";
import { canAccessRouteMatchesAccess, type RouteAccessViewer } from "@/routing/permissions";
import {
  readRouteSearchAccessCanonicalRouteAddress,
  routeSearchNeedsViewerAccess,
} from "@/routing/searchAccess";
import { Outlet, useLocation, useMatches, useRouter } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";

const publicRouteAccessViewer = {
  accessKeys: ["access_public"],
} satisfies RouteAccessViewer;

function AuthenticatedRouteAccessOutlet({
  location,
  matches,
}: {
  location: {
    hash: string;
    pathname: string;
    searchStr: string;
  };
  matches: ReturnType<typeof useMatches>;
}) {
  const { isLoading: authIsLoading } = useConvexAuth();
  const viewerAccess = useQuery(api.users.currentViewerAccess, authIsLoading ? "skip" : {});
  const router = useRouter();
  const routeAccessAllowed =
    viewerAccess !== undefined && canAccessRouteMatchesAccess(matches, viewerAccess);
  const termsAcceptancePending = viewerAccess?.role === "role_terms_pending";
  const termsAcceptanceRouteAllowed =
    location.pathname === ACCOUNT_DELETION_ROUTE || location.pathname === SETTINGS_ROUTE;
  // The deletion boundary owns this redirect. Do not clean route search or paint
  // a denied-route 404 while its navigation to /account-deletion is pending.
  const deletionRedirectPending = viewerAccess?.role === "role_deleting" && !routeAccessAllowed;
  const canonicalRouteAddress =
    authIsLoading ||
    viewerAccess === undefined ||
    deletionRedirectPending ||
    (termsAcceptancePending && !termsAcceptanceRouteAllowed)
      ? null
      : readRouteSearchAccessCanonicalRouteAddress({
          location,
          matches,
          viewer: viewerAccess,
        });

  // URL cleanup depends on viewer access, so the redirect runs after the
  // subscription resolves; the replaced URL recomputes to null and stops.
  useEffect(() => {
    if (canonicalRouteAddress === null) {
      return;
    }

    void router.navigate({
      href: canonicalRouteAddress,
      replace: true,
      resetScroll: false,
    });
  }, [canonicalRouteAddress, router]);

  if (
    authIsLoading ||
    viewerAccess === undefined ||
    deletionRedirectPending ||
    canonicalRouteAddress !== null
  ) {
    return null;
  }

  if (termsAcceptancePending && !termsAcceptanceRouteAllowed) {
    return <TermsAcceptanceScreen />;
  }

  const routeContent = routeAccessAllowed ? <Outlet /> : <NotFoundRoutePage />;

  return (
    <ApprovalGateViewerAccessProvider viewerAccess={viewerAccess}>
      {routeContent}
    </ApprovalGateViewerAccessProvider>
  );
}

export function RouteAccessOutlet() {
  const location = useLocation();
  const matches = useMatches();
  const routeIsPublic = canAccessRouteMatchesAccess(matches, publicRouteAccessViewer);
  const searchNeedsViewerAccess = routeSearchNeedsViewerAccess({
    matches,
    searchStr: location.searchStr,
  });

  return routeIsPublic && !searchNeedsViewerAccess ? (
    <Outlet />
  ) : (
    <AuthenticatedRouteAccessOutlet location={location} matches={matches} />
  );
}
