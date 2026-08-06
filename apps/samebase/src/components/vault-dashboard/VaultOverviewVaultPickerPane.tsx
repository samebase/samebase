import { useState } from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import type { VaultSidebarSummariesState } from "@/hooks/useVaultSidebarSummaries";
import { openGitHubAppSetupPopup } from "@/lib/githubAppSetupFlow";
import { api } from "../../../convex/_generated/api";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import {
  type VaultFolderCallbacks,
  VaultOverviewSidebar,
  VaultOverviewSidebarLoading,
} from "./VaultOverviewSidebar";
import { VaultFolderCreateButton, type VaultFolderCreate } from "./VaultFolderCreateButton";
import type { VaultFolderState, VaultOrganization } from "./vaultWorkspaceModel";

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
  folderState,
  globalInventory,
  organizations,
  onCreateVaultFolder,
  onDeleteVaultFolder,
  onMoveVaultFolder,
  onMoveVaultToFolder,
  onRenameVaultFolder,
  onSetVaultFolderCollapsed,
  sidebarSummaries,
  vaults,
}: {
  folderState: VaultFolderState | null;
  globalInventory: boolean;
  organizations: readonly VaultOrganization[] | null;
  onCreateVaultFolder: VaultFolderCreate;
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: readonly UserVaultResult[] | null;
} & VaultFolderCallbacks) {
  const loading = folderState === null || organizations === null || vaults === null;
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
            const organizationHasFolders = folderState.folders.some(
              (folder) => folder.organizationId === organization.organizationId,
            );

            return (
              <section key={organization.organizationId}>
                <div className="flex min-w-0 items-center pr-1 pl-3">
                  <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
                    <Link
                      className="no-underline hover:underline"
                      params={{ owner: organization.githubOwnerLogin }}
                      to="/org/$owner/vaults"
                    >
                      {organization.githubOwnerLogin}
                    </Link>
                  </h2>
                  <VaultFolderCreateButton
                    organizationId={organization.organizationId}
                    organizationName={organization.githubOwnerLogin}
                    onCreateVaultFolder={onCreateVaultFolder}
                  />
                </div>
                {organizationVaults.length === 0 && !organizationHasFolders ? (
                  <div className="px-3 pt-3 text-sm text-muted-foreground">No vaults</div>
                ) : (
                  <VaultOverviewSidebar
                    folderState={folderState}
                    organizationId={organization.organizationId}
                    page="overview"
                    selectedVaultId={null}
                    showOwner
                    sidebarSummaries={sidebarSummaries}
                    vaults={organizationVaults}
                    workspace={null}
                    onDeleteVaultFolder={onDeleteVaultFolder}
                    onMoveVaultFolder={onMoveVaultFolder}
                    onMoveVaultToFolder={onMoveVaultToFolder}
                    onRenameVaultFolder={onRenameVaultFolder}
                    onSetVaultFolderCollapsed={onSetVaultFolderCollapsed}
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
