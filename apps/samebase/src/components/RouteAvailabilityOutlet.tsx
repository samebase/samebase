import { useMatches } from "@tanstack/react-router";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import { canAccessRouteMatchesAvailability, readRouteEnvironment } from "@/routing/availability";
import type { ReactNode } from "react";

export function RouteAvailabilityOutlet({ children }: { children: ReactNode }) {
  const routeEnvironment = readRouteEnvironment();
  const routeAvailable = useMatches({
    select: (matches) => canAccessRouteMatchesAvailability(matches, routeEnvironment),
  });

  return routeAvailable ? children : <NotFoundRoutePage />;
}
