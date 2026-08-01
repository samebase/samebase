import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import type { VaultSidebarSummariesState } from "@/hooks/useVaultSidebarSummaries";
import { Button } from "@/components/ui/button";
import { FolderPlus } from "lucide-react";
import { useState } from "react";
import {
  type VaultFolderCallbacks,
  type VaultFolderCreate,
  type VaultFolderState,
  VaultOverviewSidebar,
  VaultOverviewSidebarLoading,
} from "./VaultOverviewSidebar";
import { VaultFolderDialog } from "./VaultFolderDialog";

export function VaultOverviewVaultListHeader({
  onCreateVaultFolder,
}: {
  onCreateVaultFolder: VaultFolderCreate;
}) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <>
      <div className="flex min-w-0 items-center pl-3 pr-1 @max-[120px]:pl-1">
        <div className="min-w-0 flex-1 truncate text-sm font-medium">Vaults</div>
        <Button
          aria-label="New folder"
          className="size-8 shrink-0"
          size="icon"
          title="New folder"
          type="button"
          variant="ghost"
          onClick={() => setCreateDialogOpen(true)}
        >
          <FolderPlus />
        </Button>
      </div>
      {createDialogOpen ? (
        <VaultFolderDialog
          kind="create"
          onCreate={(name) => onCreateVaultFolder({ name })}
          onOpenChange={(open) => {
            if (!open) {
              setCreateDialogOpen(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

type VaultOverviewVaultPickerPaneLoadingProps = {
  onCreateVaultFolder: VaultFolderCreate;
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: null;
};

type VaultOverviewVaultPickerPaneLoadedProps = {
  folderState: VaultFolderState;
  onCreateVaultFolder: VaultFolderCreate;
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: readonly UserVaultResult[];
} & VaultFolderCallbacks;

export function VaultOverviewVaultPickerPane(
  props: VaultOverviewVaultPickerPaneLoadingProps | VaultOverviewVaultPickerPaneLoadedProps,
) {
  return (
    <div className="min-h-full">
      <div className="@container border-b px-4 py-1.5">
        <VaultOverviewVaultListHeader onCreateVaultFolder={props.onCreateVaultFolder} />
      </div>
      {props.vaults === null ? (
        <VaultOverviewSidebarLoading />
      ) : props.vaults.length === 0 && props.folderState.folders.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">No vaults</div>
      ) : (
        <VaultOverviewSidebar
          folderState={props.folderState}
          onDeleteVaultFolder={props.onDeleteVaultFolder}
          onMoveVaultFolder={props.onMoveVaultFolder}
          onMoveVaultToFolder={props.onMoveVaultToFolder}
          onRenameVaultFolder={props.onRenameVaultFolder}
          onSetVaultFolderCollapsed={props.onSetVaultFolderCollapsed}
          page="overview"
          selectedVaultId={null}
          sidebarSummaries={props.sidebarSummaries}
          vaults={props.vaults}
          workspace={null}
        />
      )}
    </div>
  );
}
