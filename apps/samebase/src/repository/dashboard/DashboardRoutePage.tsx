import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { RepositoryDashboard } from "@/repository/dashboard/RepositoryDashboard";

export type DashboardRoutePageProps = {
  organizationOwner?: string;
  page?: "overview" | "settings";
  selectedRepositoryFullName?: string;
  source?: "attachments";
};

/**
 * Keep the dashboard behind the existing authenticated app shell on its
 * canonical route. The dashboard is a static import: the router splits each
 * route component into its own chunk and loads it before it hydrates a server
 * render. A lazy chunk inside the page would arrive after hydration, and an
 * update above it in that window (the session settling, the stored sidebar
 * state) would replace its server HTML with the empty Suspense fallback.
 */
export function DashboardRoutePage({
  organizationOwner,
  page,
  selectedRepositoryFullName,
  source,
}: DashboardRoutePageProps) {
  return (
    <AuthenticatedAppRoutePage>
      <RepositoryDashboard
        organizationOwner={organizationOwner}
        page={page}
        selectedRepositoryFullName={selectedRepositoryFullName}
        source={source}
      />
    </AuthenticatedAppRoutePage>
  );
}
