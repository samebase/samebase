import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { findViewerOrganization, useOrganizationContext } from "@/lib/organizationContext";
import { ORGANIZATION_MEMBERS_ROUTE, ORGANIZATION_SETTINGS_ROUTE } from "@/lib/organizationRoutes";

export function OrganizationBillingGate({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const { organizations, surface } = useOrganizationContext();
  const organization =
    surface.kind === "organization" && organizations
      ? findViewerOrganization(organizations, surface.owner)
      : null;
  const billingGateRequired =
    isAuthenticated &&
    surface.kind === "organization" &&
    surface.section !== "settings" &&
    surface.section !== "members";
  const billingStatus = useQuery(
    api.billing.getViewerBillingStatus,
    billingGateRequired && organization ? { organizationId: organization.organizationId } : "skip",
  );

  if (!billingGateRequired) {
    return children;
  }
  if (organizations === undefined) {
    return null;
  }
  if (organization === null) {
    if (surface.source === "vault") {
      return (
        <AppWorkspaceRouteChrome left={null}>
          <main className="grid gap-4 p-4">
            <h1 className="text-base font-semibold">Vault unavailable</h1>
            <Button asChild className="w-fit" variant="outline">
              <Link to={DASHBOARD_ROUTE}>All vaults</Link>
            </Button>
          </main>
        </AppWorkspaceRouteChrome>
      );
    }

    return children;
  }
  if (billingStatus === undefined) {
    return null;
  }
  if (!billingStatus.billingLimited) {
    return children;
  }

  const params = { owner: organization.githubOwnerLogin };

  return (
    <AppWorkspaceRouteChrome left={null}>
      <main
        className="container mx-auto w-full max-w-2xl py-6"
        data-testid="organization-billing-limited-state"
      >
        <h1 className="text-xl font-semibold @2xl:text-2xl">Organization access is limited</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Add paid member capacity or remove members to restore organization access.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link hash="billing" params={params} to={ORGANIZATION_SETTINGS_ROUTE}>
              Open billing
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link params={params} to={ORGANIZATION_MEMBERS_ROUTE}>
              Manage members
            </Link>
          </Button>
        </div>
      </main>
    </AppWorkspaceRouteChrome>
  );
}
