import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import type { VaultSidebarSummariesState } from "@/hooks/useVaultSidebarSummaries";
import { CONNECT_ORGANIZATION_ROUTE } from "@/lib/connectOrganizationRoute";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import {
  type VaultFolderCallbacks,
  type VaultOrganizationTreeCallbacks,
  VaultOverviewOrganizationSidebar,
  VaultOverviewSidebarLoading,
} from "./VaultOverviewSidebar";
import type { VaultFolderCreate } from "./VaultFolderCreateButton";
import type {
  VaultFolderState,
  VaultOrganization,
  VaultOrganizationTreeSettings,
} from "./vaultWorkspaceModel";

export type { VaultOrganization } from "./vaultWorkspaceModel";

export function VaultOverviewVaultListHeader() {
  return <div className="min-w-0 truncate px-3 text-sm font-medium @max-[120px]:px-1">Vaults</div>;
}

function ConnectOrganizationButton() {
  return (
    <Button asChild size="sm">
      <Link to={CONNECT_ORGANIZATION_ROUTE}>Connect organization</Link>
    </Button>
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
  onSetVaultOrganizationCollapsed,
  organizationTreeSettings,
  sidebarSummaries,
  vaults,
}: {
  folderState: VaultFolderState | null;
  globalInventory: boolean;
  organizations: readonly VaultOrganization[] | null;
  organizationTreeSettings: VaultOrganizationTreeSettings | null;
  onCreateVaultFolder: VaultFolderCreate;
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: readonly UserVaultResult[] | null;
} & VaultFolderCallbacks &
  VaultOrganizationTreeCallbacks) {
  const loading =
    folderState === null ||
    organizations === null ||
    organizationTreeSettings === null ||
    vaults === null;

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
            Connect a GitHub account or organization to Samebase.
          </p>
          <ConnectOrganizationButton />
        </div>
      ) : organizations.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">No vaults</div>
      ) : (
        <VaultOverviewOrganizationSidebar
          folderState={folderState}
          organizations={organizations}
          organizationTreeSettings={organizationTreeSettings}
          page="overview"
          selectedVaultId={null}
          sidebarSummaries={sidebarSummaries}
          vaults={vaults}
          workspace={null}
          onCreateVaultFolder={onCreateVaultFolder}
          onDeleteVaultFolder={onDeleteVaultFolder}
          onMoveVaultFolder={onMoveVaultFolder}
          onMoveVaultToFolder={onMoveVaultToFolder}
          onRenameVaultFolder={onRenameVaultFolder}
          onSetVaultFolderCollapsed={onSetVaultFolderCollapsed}
          onSetVaultOrganizationCollapsed={onSetVaultOrganizationCollapsed}
        />
      )}
    </div>
  );
}
