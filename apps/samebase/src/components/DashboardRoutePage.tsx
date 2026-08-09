import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { VaultRouteIdentityBoundary } from "@/components/VaultRouteIdentityBoundary";
import { lazy } from "react";
import { tryParseRepositoryFullName } from "../../shared/repoName";

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
  const selectedRepository = selectedRepositoryFullName
    ? tryParseRepositoryFullName(selectedRepositoryFullName)
    : null;

  return (
    <AuthenticatedAppRoutePage>
      {selectedRepository ? (
        <VaultRouteIdentityBoundary
          owner={selectedRepository.owner}
          repoName={selectedRepository.name}
        >
          {(identity) => (
            <VaultDashboard
              activeVaultId={identity.state === "selected" ? identity.vaultId : null}
              organizationOwner={organizationOwner}
              page={page}
              selectedRepositoryFullName={
                identity.state === "selected"
                  ? identity.repositoryFullName
                  : selectedRepositoryFullName
              }
            />
          )}
        </VaultRouteIdentityBoundary>
      ) : (
        <VaultDashboard
          organizationOwner={organizationOwner}
          page={page}
          selectedRepositoryFullName={selectedRepositoryFullName}
        />
      )}
    </AuthenticatedAppRoutePage>
  );
}
