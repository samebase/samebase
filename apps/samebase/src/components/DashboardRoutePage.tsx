import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { lazy } from "react";

const VaultDashboard = lazy(async () => {
  const module = await import("@/components/vault-dashboard/VaultDashboard");
  return { default: module.VaultDashboard };
});

export type DashboardRoutePageProps = {
  selectedRepositoryFullName?: string;
};

/**
 * Keep the dashboard behind the existing authenticated app shell on its
 * canonical route.
 */
export function DashboardRoutePage({ selectedRepositoryFullName }: DashboardRoutePageProps) {
  return (
    <AuthenticatedAppRoutePage>
      <VaultDashboard selectedRepositoryFullName={selectedRepositoryFullName} />
    </AuthenticatedAppRoutePage>
  );
}
