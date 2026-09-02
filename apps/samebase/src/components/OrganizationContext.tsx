import { type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { OrganizationContext, readAppOrganizationSurface } from "@/lib/organizationContext";

export function OrganizationContextProvider({
  children,
  pathnameOverride,
}: {
  children: ReactNode;
  pathnameOverride?: string;
}) {
  const routePathname = useLocation({ select: (location) => location.pathname });
  const pathname = pathnameOverride ?? routePathname;
  const { isAuthenticated } = useConvexAuth();
  const surface = readAppOrganizationSurface(pathname);
  const organizationContextRequired =
    surface.kind === "organizations" ||
    surface.kind === "allRepositories" ||
    surface.kind === "organization";
  const viewerAccess = useQuery(api.users.currentViewerAccess, isAuthenticated ? {} : "skip");
  const organizations = useQuery(
    api.organizations.listForViewer,
    organizationContextRequired && viewerAccess?.accessKeys.includes("access_dashboard")
      ? {}
      : "skip",
  );

  return (
    <OrganizationContext.Provider value={{ organizations, surface }}>
      {children}
    </OrganizationContext.Provider>
  );
}
