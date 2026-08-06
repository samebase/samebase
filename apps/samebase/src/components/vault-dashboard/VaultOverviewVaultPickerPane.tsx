import { Button } from "@/components/ui/button";
import type { VaultSidebarSummariesState } from "@/hooks/useVaultSidebarSummaries";
import { openGitHubAppSetupPopup } from "@/lib/githubAppSetupFlow";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { VaultOverviewSidebar, VaultOverviewSidebarLoading } from "./VaultOverviewSidebar";
import type { VaultOrganization } from "./vaultWorkspaceModel";

export type { VaultOrganization } from "./vaultWorkspaceModel";

export function VaultOverviewVaultListHeader() {
  return <div className="min-w-0 truncate px-3 text-sm font-medium @max-[120px]:px-1">Vaults</div>;
}

function InstallGitHubAppButton() {
  const getGitHubAppInstallationUrl = useMutation(
    api.githubAppInstallation.getGitHubAppInstallationUrl,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function installGitHubApp() {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);
    void openGitHubAppSetupPopup(async () => {
      return await getGitHubAppInstallationUrl({ returnToPath: "/vault" });
    })
      .catch(() => setError("Could not open GitHub App installation."))
      .finally(() => setPending(false));
  }

  return (
    <div>
      <Button disabled={pending} size="sm" type="button" onClick={installGitHubApp}>
        {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        Install GitHub App
      </Button>
      {error ? (
        <div className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function VaultOverviewVaultPickerPane({
  globalInventory,
  organizations,
  sidebarSummaries,
  vaults,
}: {
  globalInventory: boolean;
  organizations: readonly VaultOrganization[] | null;
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: readonly UserVaultResult[] | null;
}) {
  const loading = organizations === null || vaults === null;
  const vaultsByOrganizationId: Map<VaultOrganization["organizationId"], UserVaultResult[]> =
    new Map(organizations?.map((organization) => [organization.organizationId, []]) ?? []);
  for (const vault of vaults ?? []) {
    vaultsByOrganizationId.get(vault.organizationId)?.push(vault);
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-[1100px]">
      <div className="@container flex min-h-11 items-center border-b px-4 py-1.5">
        <VaultOverviewVaultListHeader />
      </div>
      {loading ? (
        <VaultOverviewSidebarLoading />
      ) : organizations.length === 0 && globalInventory ? (
        <div className="grid gap-3 p-4">
          <h1 className="text-base font-semibold">No organizations</h1>
          <p className="text-sm text-muted-foreground">
            Install the Samebase GitHub App for a repository owner.
          </p>
          <InstallGitHubAppButton />
        </div>
      ) : organizations.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">No vaults</div>
      ) : (
        <div className="grid gap-6 p-4">
          {organizations.map((organization) => {
            const organizationVaults =
              vaultsByOrganizationId.get(organization.organizationId) ?? [];
            return (
              <section key={organization.organizationId}>
                <h2 className="px-3 text-sm font-semibold">
                  <Link
                    className="no-underline hover:underline"
                    params={{ owner: organization.githubOwnerLogin }}
                    to="/org/$owner/vaults"
                  >
                    {organization.githubOwnerLogin}
                  </Link>
                </h2>
                {organizationVaults.length === 0 ? (
                  <div className="px-3 pt-3 text-sm text-muted-foreground">No vaults</div>
                ) : (
                  <VaultOverviewSidebar
                    page="overview"
                    selectedVaultId={null}
                    sidebarSummaries={sidebarSummaries}
                    vaults={organizationVaults}
                    workspace={null}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
