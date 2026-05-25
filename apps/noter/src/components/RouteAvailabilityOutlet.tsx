import { Outlet, useMatches } from "@tanstack/react-router";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import {
  canAccessNoterRouteMatchesAvailability,
  readBrowserNoterRouteSurface,
} from "@/lib/routeAvailability";

export function RouteAvailabilityOutlet() {
  const routeSurface = readBrowserNoterRouteSurface();
  const routeAvailable = useMatches({
    select: (matches) => canAccessNoterRouteMatchesAvailability(matches, routeSurface),
  });

  return routeAvailable ? <Outlet /> : <NotFoundRoutePage />;
}
