import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import type { VaultSidebarSummariesState } from "@/hooks/useVaultSidebarSummaries";
import {
  type VaultFolderCallbacks,
  type VaultFolderState,
  VaultOverviewSidebar,
  VaultOverviewSidebarLoading,
} from "./VaultOverviewSidebar";

export function VaultOverviewVaultListHeader() {
  return <div className="px-3 text-sm font-medium">Vaults</div>;
}

type VaultOverviewVaultPickerPaneLoadingProps = {
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: null;
};

type VaultOverviewVaultPickerPaneLoadedProps = {
  folderState: VaultFolderState;
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: readonly UserVaultResult[];
} & VaultFolderCallbacks;

export function VaultOverviewVaultPickerPane(
  props: VaultOverviewVaultPickerPaneLoadingProps | VaultOverviewVaultPickerPaneLoadedProps,
) {
  return (
    <div className="min-h-full">
      <div className="border-b px-4 py-3">
        <VaultOverviewVaultListHeader />
      </div>
      {props.vaults === null ? (
        <VaultOverviewSidebarLoading />
      ) : props.vaults.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">No vaults</div>
      ) : (
        <VaultOverviewSidebar
          folderState={props.folderState}
          onCreateVaultFolder={props.onCreateVaultFolder}
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
