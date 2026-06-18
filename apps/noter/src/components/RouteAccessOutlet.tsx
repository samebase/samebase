import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import {
  canAccessNoterRouteMatchesAccess,
  type NoterRouteAccessViewer,
} from "@/lib/routePermissions";
import { Outlet, useMatches } from "@tanstack/react-router";
import { useQuery } from "convex/react";
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

function AuthenticatedRouteAccessOutlet() {
  const viewerAccess = useQuery(api.users.currentViewerAccess);
  const matches = useMatches();

  if (viewerAccess === undefined) {
    return null;
  }

  return canAccessNoterRouteMatchesAccess(matches, viewerAccess) ? (
    <Outlet />
  ) : (
    <RouteAccessDeniedPage />
  );
}

export function RouteAccessOutlet() {
  const routeIsPublic = useMatches({
    select: (matches) => canAccessNoterRouteMatchesAccess(matches, publicRouteAccessViewer),
  });

  return routeIsPublic ? <Outlet /> : <AuthenticatedRouteAccessOutlet />;
}
