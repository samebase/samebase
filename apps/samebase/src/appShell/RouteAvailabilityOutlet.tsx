import { useMatches } from "@tanstack/react-router";
import { NotFoundRoutePage } from "@/appShell/NotFoundRoutePage";
import {
  canAccessRouteMatchesAvailability,
  readBrowserRouteEnvironment,
} from "@/routing/availability";
import type { ReactNode } from "react";

export function RouteAvailabilityOutlet({ children }: { children: ReactNode }) {
  const routeEnvironment = readBrowserRouteEnvironment();
  const routeAvailable = useMatches({
    select: (matches) => canAccessRouteMatchesAvailability(matches, routeEnvironment),
  });

  return routeAvailable ? children : <NotFoundRoutePage />;
}
