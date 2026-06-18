import { useMatches } from "@tanstack/react-router";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import {
  canAccessNoterRouteMatchesAvailability,
  readBrowserNoterRouteEnvironment,
} from "@/lib/routeAvailability";
import type { ReactNode } from "react";

export function RouteAvailabilityOutlet({ children }: { children: ReactNode }) {
  const routeEnvironment = readBrowserNoterRouteEnvironment();
  const routeAvailable = useMatches({
    select: (matches) => canAccessNoterRouteMatchesAvailability(matches, routeEnvironment),
  });

  return routeAvailable ? children : <NotFoundRoutePage />;
}
