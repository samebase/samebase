import { useMatches } from "@tanstack/react-router";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import {
  canAccessSamebaseRouteMatchesAvailability,
  readBrowserSamebaseRouteEnvironment,
} from "@/routing/availability";
import type { ReactNode } from "react";

export function RouteAvailabilityOutlet({ children }: { children: ReactNode }) {
  const routeEnvironment = readBrowserSamebaseRouteEnvironment();
  const routeAvailable = useMatches({
    select: (matches) => canAccessSamebaseRouteMatchesAvailability(matches, routeEnvironment),
  });

  return routeAvailable ? children : <NotFoundRoutePage />;
}
