import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { lazy } from "react";

const VaultDashboard = lazy(async () => {
  const module = await import("@/components/vault-dashboard/VaultDashboard");
  return { default: module.VaultDashboard };
});

export type DashboardRoutePageProps = {
  organizationOwner?: string;
  page?: "overview" | "settings";
  selectedRepositoryFullName?: string;
};

/**
 * Keep the dashboard behind the existing authenticated app shell on its
 * canonical route.
 */
export function DashboardRoutePage({
  organizationOwner,
  page,
  selectedRepositoryFullName,
}: DashboardRoutePageProps) {
  return (
    <AuthenticatedAppRoutePage>
      <VaultDashboard
        organizationOwner={organizationOwner}
        page={page}
        selectedRepositoryFullName={selectedRepositoryFullName}
      />
    </AuthenticatedAppRoutePage>
  );
}
