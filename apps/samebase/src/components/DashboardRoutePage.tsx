import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { lazy } from "react";

const VaultDashboard = lazy(async () => {
  const module = await import("@/components/vault-dashboard/VaultDashboard");
  return { default: module.VaultDashboard };
});

export type DashboardRoutePageProps = {
  page?: "overview" | "settings";
  presentation?: "legacy" | "v2";
  selectedRepositoryFullName?: string;
};

/**
 * Keep the dashboard behind the existing authenticated app shell on its
 * canonical route.
 */
export function DashboardRoutePage({
  page,
  presentation,
  selectedRepositoryFullName,
}: DashboardRoutePageProps) {
  return (
    <AuthenticatedAppRoutePage>
      <VaultDashboard
        page={page}
        presentation={presentation}
        selectedRepositoryFullName={selectedRepositoryFullName}
      />
    </AuthenticatedAppRoutePage>
  );
}
