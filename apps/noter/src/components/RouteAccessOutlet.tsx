import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import {
  canAccessNoterRouteMatchesAccess,
  type NoterRouteAccessViewer,
} from "@/lib/routePermissions";
import {
  readRouteSearchAccessCanonicalRouteAddress,
  routeSearchNeedsViewerAccess,
} from "@/lib/routeSearchAccess";
import { Outlet, useLocation, useMatches, useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";

const publicRouteAccessViewer = {
  accessKeys: ["access_public"],
} satisfies NoterRouteAccessViewer;

function RouteAccessDeniedPage() {
  return (
    <AuthenticatedAppRoutePage>
      <NotFoundRoutePage />
    </AuthenticatedAppRoutePage>
  );
}

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
  const viewerAccess = useQuery(api.users.currentViewerAccess);
  const router = useRouter();
  const canonicalRouteAddress =
    viewerAccess === undefined
      ? null
      : readRouteSearchAccessCanonicalRouteAddress({
          location,
          matches,
          viewer: viewerAccess,
        });

  useEffect(() => {
    if (canonicalRouteAddress === null) {
      return;
    }

    void router.navigate({
      href: canonicalRouteAddress,
      replace: true,
    });
  }, [canonicalRouteAddress, router]);

  if (viewerAccess === undefined || canonicalRouteAddress !== null) {
    return null;
  }

  return canAccessNoterRouteMatchesAccess(matches, viewerAccess) ? (
    <Outlet />
  ) : (
    <RouteAccessDeniedPage />
  );
}

export function RouteAccessOutlet() {
  const location = useLocation();
  const matches = useMatches();
  const routeIsPublic = canAccessNoterRouteMatchesAccess(matches, publicRouteAccessViewer);
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
