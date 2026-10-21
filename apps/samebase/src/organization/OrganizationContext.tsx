import { type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { OrganizationContext, readAppOrganizationSurface } from "@/organization/context";
import { rootQueries } from "@/routes/root.queries";

/**
The organizations of the right sidebar's context control and links. The root loader fetched them
for a server render with dashboard access, so the control is in the first HTML; the subscription
keeps them live.
*/
export function OrganizationContextProvider({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const surface = readAppOrganizationSurface(pathname);
  const organizationContextRequired =
    surface.kind === "organizations" ||
    surface.kind === "allRepositories" ||
    surface.kind === "organization";
  const { data: viewerAccess } = useQuery({
    ...rootQueries.viewerAccess,
    enabled: organizationContextRequired,
  });
  const { data: organizations } = useQuery({
    ...rootQueries.organizations,
    // `enabled: undefined` would enable the query, so the access check compares with `true`.
    enabled:
      organizationContextRequired && viewerAccess?.accessKeys.includes("access_dashboard") === true,
  });

  return (
    <OrganizationContext.Provider value={{ organizations, surface }}>
      {children}
    </OrganizationContext.Provider>
  );
}
