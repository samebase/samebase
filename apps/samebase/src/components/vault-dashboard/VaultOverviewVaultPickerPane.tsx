import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import type { VaultSidebarSummariesState } from "@/hooks/useVaultSidebarSummaries";
import { VaultOverviewSidebar, VaultOverviewSidebarLoading } from "./VaultOverviewSidebar";

export function VaultOverviewVaultListHeader() {
  return <div className="text-sm font-medium">Vaults</div>;
}

export function VaultOverviewVaultPickerPane({
  sidebarSummaries,
  vaults,
}: {
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: readonly UserVaultResult[] | null;
}) {
  return (
    <div className="min-h-full">
      <div className="border-b px-4 py-3">
        <VaultOverviewVaultListHeader />
      </div>
      {vaults === null ? (
        <VaultOverviewSidebarLoading />
      ) : vaults.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">No vaults</div>
      ) : (
        <VaultOverviewSidebar
          page="overview"
          selectedVaultId={null}
          sidebarSummaries={sidebarSummaries}
          vaults={vaults}
          workspace={null}
        />
      )}
    </div>
  );
}
