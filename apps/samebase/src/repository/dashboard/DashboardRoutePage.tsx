import { AuthenticatedAppRoutePage } from "@/appShell/AuthenticatedAppRoutePage";
import { lazy } from "react";

const RepositoryDashboard = lazy(async () => {
  const module = await import("@/repository/dashboard/RepositoryDashboard");
  return { default: module.RepositoryDashboard };
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
      <RepositoryDashboard
        organizationOwner={organizationOwner}
        page={page}
        selectedRepositoryFullName={selectedRepositoryFullName}
      />
    </AuthenticatedAppRoutePage>
  );
}
