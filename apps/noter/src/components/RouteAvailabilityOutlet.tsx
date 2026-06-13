import { Outlet, useMatches } from "@tanstack/react-router";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import {
  canAccessNoterRouteMatchesAvailability,
  readBrowserNoterRouteEnvironment,
} from "@/lib/routeAvailability";

export function RouteAvailabilityOutlet() {
  const routeEnvironment = readBrowserNoterRouteEnvironment();
  const routeAvailable = useMatches({
    select: (matches) => canAccessNoterRouteMatchesAvailability(matches, routeEnvironment),
  });

  return routeAvailable ? <Outlet /> : <NotFoundRoutePage />;
}
