import { type ReactNode } from "react";
import { convexQuery } from "@convex-dev/react-query";
import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
import { OrganizationContext, readAppOrganizationSurface } from "@/organization/context";

/**
The organizations of the right sidebar's context control and links. The root loader fetched them
for a server render with dashboard access, under the same query keys, so the control is in the first
HTML; the subscriptions keep them live. Other routes and viewers skip the queries: the Convex query
client subscribes to every query in the cache that is not skipped, even a disabled one.
*/
export function OrganizationContextProvider({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const surface = readAppOrganizationSurface(pathname);
  const organizationContextRequired =
    surface.kind === "organizations" ||
    surface.kind === "allRepositories" ||
    surface.kind === "organization";
  const { data: viewerAccess } = useQuery(
    convexQuery(api.users.currentViewerAccess, organizationContextRequired ? {} : "skip"),
  );
  const { data: organizations } = useQuery(
    convexQuery(
      api.organizations.listForViewer,
      organizationContextRequired && viewerAccess?.accessKeys.includes("access_dashboard")
        ? {}
        : "skip",
    ),
  );

  return (
    <OrganizationContext.Provider value={{ organizations, surface }}>
      {children}
    </OrganizationContext.Provider>
  );
}
