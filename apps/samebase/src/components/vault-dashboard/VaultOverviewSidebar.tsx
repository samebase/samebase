import type { VaultOverviewPageKind } from "@/components/vault-dashboard/VaultOverviewPage";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { VaultWorkspaceSelected } from "@/components/vault-dashboard/vaultWorkspaceModel";
import type {
  VaultSidebarSummariesState,
  VaultSidebarSummary,
} from "@/hooks/useVaultSidebarSummaries";
import { formatRepositoryCheckSummary, type RepositoryCheckSummary } from "@/lib/repositoryChecks";
import { buildVaultDashboardRoute, buildVaultSettingsRoute } from "@/lib/vaultRoutes";
import { Link } from "@tanstack/react-router";
import type { ReactMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { ChevronDown, ChevronRight, EllipsisVertical, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { VaultFolderDialog } from "./VaultFolderDialog";

export type VaultFolderState = (typeof api.vault.folders.getVaultFolderState)["_returnType"];
type VaultFolder = VaultFolderState["folders"][number];

type VaultFolderMutation<Mutation extends FunctionReference<"mutation">> = (
  ...args: Parameters<ReactMutation<Mutation>>
) => Promise<void | Awaited<ReturnType<ReactMutation<Mutation>>>>;

export type VaultFolderCreate = VaultFolderMutation<typeof api.vault.folders.createVaultFolder>;

export type VaultFolderCallbacks = {
  onDeleteVaultFolder: VaultFolderMutation<typeof api.vault.folders.deleteVaultFolder>;
  onMoveVaultFolder: VaultFolderMutation<typeof api.vault.folders.moveVaultFolder>;
  onMoveVaultToFolder: VaultFolderMutation<typeof api.vault.folders.moveVaultToFolder>;
  onRenameVaultFolder: VaultFolderMutation<typeof api.vault.folders.renameVaultFolder>;
  onSetVaultFolderCollapsed: VaultFolderMutation<typeof api.vault.folders.setVaultFolderCollapsed>;
};

type FolderDialogState =
  | { folder: VaultFolder; kind: "rename" }
  | { folder: VaultFolder; kind: "delete"; vaultCount: number };

function repositoryRoute(vault: UserVaultResult, page: VaultOverviewPageKind): string {
  const args = { owner: vault.ghRepoOwner, repoName: vault.ghRepoName };
  return page === "settings" ? buildVaultSettingsRoute(args) : buildVaultDashboardRoute(args);
}

function checkStateDotClassName(state: RepositoryCheckSummary["state"]): string {
  switch (state) {
    case "success":
      return "h-2 w-2 rounded-full bg-emerald-500";
    case "failure":
      return "h-2 w-2 rounded-full bg-red-500";
    case "running":
      return "h-2 w-2 rounded-full bg-amber-500";
    case "none":
    case "neutral":
    case "unknown":
      return "h-2 w-2 rounded-full bg-muted-foreground/60";
  }
}

type VaultSidebarStatus =
  | { kind: "dot" | "failure"; dotClassName: string; label: string }
  | { kind: "workflow"; label: string };

function vaultSidebarStatus(args: {
  sidebarSummaries: VaultSidebarSummariesState;
  summary: VaultSidebarSummary | undefined;
  selected: boolean;
  vault: UserVaultResult;
  workspace: VaultWorkspaceSelected | null;
}): VaultSidebarStatus {
  if (args.vault.deletion.state === "deleting") {
    return { kind: "workflow", label: "Deleting" };
  }
  if (
    args.vault.sourceSetup.status === "running" ||
    args.vault.providerSetup.status === "running"
  ) {
    return { kind: "workflow", label: "Setting up" };
  }
  if (args.vault.deletion.state === "delete_failed") {
    return {
      kind: "failure",
      dotClassName: "h-2 w-2 rounded-full bg-red-500",
      label: "Delete failed",
    };
  }
  if (args.vault.sourceSetup.status === "failed" || args.vault.providerSetup.status === "failed") {
    return {
      kind: "failure",
      dotClassName: "h-2 w-2 rounded-full bg-red-500",
      label: "Needs attention",
    };
  }
  const checks =
    args.selected &&
    args.workspace &&
    (args.workspace.pullRequests.state === "current" ||
      args.workspace.pullRequests.state === "stale") &&
    args.workspace.pullRequests.defaultBranch
      ? args.workspace.pullRequests.defaultBranch.checks
      : args.summary?.checks;

  if (checks) {
    return {
      kind: checks.state === "failure" ? "failure" : "dot",
      dotClassName: checkStateDotClassName(checks.state),
      label: formatRepositoryCheckSummary(checks),
    };
  }
  if (args.sidebarSummaries.state === "failed" || args.sidebarSummaries.state === "loaded") {
    return {
      kind: "dot",
      dotClassName: "h-2 w-2 rounded-full bg-muted-foreground/50",
      label: "Checks unavailable",
    };
  }
  return {
    kind: "dot",
    dotClassName: "h-2 w-2 rounded-full bg-muted-foreground/50",
    label: "Loading checks",
  };
}

function VaultRow({
  folderState,
  inFolder,
  pending,
  onDirectAction,
  page,
  selected,
  sidebarSummaries,
  summary,
  vault,
  workspace,
  onMoveVaultToFolder,
}: {
  folderState: VaultFolderState;
  inFolder: boolean;
  pending: boolean;
  onDirectAction: (action: () => Promise<unknown>) => void;
  onMoveVaultToFolder: VaultFolderCallbacks["onMoveVaultToFolder"];
  page: VaultOverviewPageKind;
  selected: boolean;
  sidebarSummaries: VaultSidebarSummariesState;
  summary: VaultSidebarSummary | undefined;
  vault: UserVaultResult;
  workspace: VaultWorkspaceSelected | null;
}) {
  const status = vaultSidebarStatus({ selected, sidebarSummaries, summary, vault, workspace });
  const rowClassName = selected
    ? "flex min-w-0 bg-muted @max-[200px]:px-1"
    : "flex min-w-0 hover:bg-muted/60 @max-[200px]:px-1";

  return (
    <div className={rowClassName}>
      <Link
        aria-current={selected ? "page" : undefined}
        aria-label={`${vault.repositoryFullName}, ${status.label}`}
        className={
          inFolder
            ? "block min-w-0 flex-1 py-2.5 pr-3 pl-6 text-left no-underline hover:no-underline @max-[200px]:pr-2 @max-[200px]:pl-5 @max-[120px]:pr-1 @max-[120px]:pl-4"
            : "block min-w-0 flex-1 px-3 py-2.5 text-left no-underline hover:no-underline @max-[200px]:px-2 @max-[120px]:px-1"
        }
        data-vault-status={status.label}
        title={vault.repositoryFullName}
        to={repositoryRoute(vault, page)}
      >
        <span className="block min-w-0 max-w-full text-sm leading-5">
          <span className="block min-w-0 truncate text-muted-foreground @max-[120px]:hidden">
            {vault.ghRepoOwner}/
          </span>
          <span className="block min-w-0 line-clamp-2 font-medium text-foreground [overflow-wrap:anywhere]">
            {vault.ghRepoName}
          </span>
        </span>
        <span className="mt-1 flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
          <span className="mt-1 flex shrink-0">
            {status.kind === "workflow" ? (
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin text-amber-600" />
            ) : (
              <span className={status.dotClassName} />
            )}
          </span>
          <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">{status.label}</span>
        </span>
      </Link>
      {folderState.folders.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild nativeButton>
            <Button
              aria-label={`Actions for ${vault.repositoryFullName}`}
              className="mt-2 mr-1 h-10 w-8 shrink-0 @max-[120px]:h-8 @max-[120px]:w-7"
              disabled={pending}
              size="icon"
              type="button"
              variant="ghost"
            >
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={pending}>Move to folder</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {folderState.folders.map((folder) => (
                  <DropdownMenuItem
                    disabled={pending}
                    key={folder._id}
                    onClick={() =>
                      onDirectAction(() =>
                        onMoveVaultToFolder({ folderId: folder._id, vaultId: vault._id }),
                      )
                    }
                  >
                    {folder.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  disabled={pending}
                  onClick={() =>
                    onDirectAction(() =>
                      onMoveVaultToFolder({ folderId: null, vaultId: vault._id }),
                    )
                  }
                >
                  Ungrouped
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function VaultOverviewSidebar({
  folderState,
  onDeleteVaultFolder,
  onMoveVaultFolder,
  onMoveVaultToFolder,
  onRenameVaultFolder,
  onSetVaultFolderCollapsed,
  page,
  selectedVaultId,
  sidebarSummaries,
  vaults,
  workspace,
}: {
  folderState: VaultFolderState;
  page: VaultOverviewPageKind;
  selectedVaultId: UserVaultResult["_id"] | null;
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: readonly UserVaultResult[];
  workspace: VaultWorkspaceSelected | null;
} & VaultFolderCallbacks) {
  const [dialog, setDialog] = useState<FolderDialogState | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const directActionPending = useRef(false);
  const summaryByVaultId = new Map(
    sidebarSummaries.state === "loaded"
      ? sidebarSummaries.summaries.map((summary) => [summary.vaultId, summary])
      : [],
  );
  const validFolderIds = new Set(folderState.folders.map((folder) => folder._id));
  const folderByVaultId = new Map(
    folderState.assignments
      .filter((assignment) => validFolderIds.has(assignment.folderId))
      .map((assignment) => [assignment.vaultId, assignment.folderId]),
  );
  const vaultsByFolderId = new Map<Id<"ui_vaultFolders">, UserVaultResult[]>();
  for (const folder of folderState.folders) {
    vaultsByFolderId.set(folder._id, []);
  }
  const ungroupedVaults: UserVaultResult[] = [];
  for (const vault of vaults) {
    const folderId = folderByVaultId.get(vault._id);
    const folderVaults = folderId ? vaultsByFolderId.get(folderId) : undefined;
    if (folderVaults) {
      folderVaults.push(vault);
    } else {
      ungroupedVaults.push(vault);
    }
  }

  function runDirectAction(action: () => Promise<unknown>) {
    if (directActionPending.current) {
      return;
    }

    directActionPending.current = true;
    setPendingAction("updating");
    void action()
      .catch((error: unknown) => {
        toast({
          description: error instanceof Error ? error.message : "Try again.",
          title: "Could not update vault folders",
          variant: "destructive",
        });
      })
      .finally(() => {
        directActionPending.current = false;
        setPendingAction(null);
      });
  }

  function renderVault(vault: UserVaultResult, inFolder: boolean) {
    return (
      <VaultRow
        folderState={folderState}
        inFolder={inFolder}
        key={vault._id}
        pending={pendingAction !== null}
        page={page}
        selected={vault._id === selectedVaultId}
        sidebarSummaries={sidebarSummaries}
        summary={summaryByVaultId.get(vault._id)}
        vault={vault}
        workspace={workspace}
        onMoveVaultToFolder={onMoveVaultToFolder}
        onDirectAction={runDirectAction}
      />
    );
  }

  return (
    <>
      <nav aria-label="Vaults" className="@container min-h-full py-2">
        {folderState.folders.length === 0 ? (
          vaults.map((vault) => renderVault(vault, false))
        ) : (
          <>
            {ungroupedVaults.map((vault) => renderVault(vault, false))}
            {folderState.folders.map((folder, index) => {
              const folderVaults = vaultsByFolderId.get(folder._id) ?? [];
              const selectedVault = folderVaults.find((vault) => vault._id === selectedVaultId);
              const visibleVaults = folder.collapsed ? [] : folderVaults;
              const hasHiddenFailure =
                folder.collapsed &&
                folderVaults.some(
                  (vault) =>
                    vaultSidebarStatus({
                      selected: vault._id === selectedVaultId,
                      sidebarSummaries,
                      summary: summaryByVaultId.get(vault._id),
                      vault,
                      workspace,
                    }).kind === "failure",
                );
              const disclosureLabel = folder.collapsed
                ? `Expand ${folder.name}, ${folderVaults.length} ${
                    folderVaults.length === 1 ? "vault" : "vaults"
                  }${hasHiddenFailure ? ", has hidden failures" : ""}`
                : `Collapse ${folder.name}`;

              return (
                <section
                  key={folder._id}
                  aria-label={
                    folder.collapsed && selectedVault
                      ? `${folder.name}, contains current vault`
                      : folder.name
                  }
                >
                  <div
                    className={
                      folder.collapsed && selectedVault
                        ? "flex min-w-0 items-center bg-muted px-1 py-1"
                        : "flex min-w-0 items-center px-1 py-1"
                    }
                  >
                    <Button
                      aria-expanded={!folder.collapsed}
                      aria-label={disclosureLabel}
                      className="h-10 min-w-0 flex-1 shrink justify-start gap-0 p-0 font-normal whitespace-normal aria-expanded:bg-transparent @max-[120px]:h-8"
                      disabled={pendingAction !== null}
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        runDirectAction(() =>
                          onSetVaultFolderCollapsed({
                            collapsed: !folder.collapsed,
                            folderId: folder._id,
                          }),
                        )
                      }
                    >
                      <span className="flex w-5 shrink-0 items-center justify-center @max-[120px]:w-4">
                        {folder.collapsed ? <ChevronRight /> : <ChevronDown />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                        {folder.name}
                      </span>
                      <span className="px-2 text-xs text-muted-foreground @max-[120px]:hidden">
                        {folderVaults.length}
                      </span>
                      {hasHiddenFailure ? (
                        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-red-500" />
                      ) : null}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild nativeButton>
                        <Button
                          aria-label={`Actions for folder ${folder.name}`}
                          className="h-10 w-8 @max-[120px]:h-8 @max-[120px]:w-7"
                          disabled={pendingAction !== null}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <EllipsisVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          disabled={pendingAction !== null}
                          onClick={() => setDialog({ folder, kind: "rename" })}
                        >
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={index === 0 || pendingAction !== null}
                          onClick={() =>
                            runDirectAction(() =>
                              onMoveVaultFolder({ direction: "up", folderId: folder._id }),
                            )
                          }
                        >
                          Move up
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={
                            index === folderState.folders.length - 1 || pendingAction !== null
                          }
                          onClick={() =>
                            runDirectAction(() =>
                              onMoveVaultFolder({ direction: "down", folderId: folder._id }),
                            )
                          }
                        >
                          Move down
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={pendingAction !== null}
                          onClick={() =>
                            setDialog({ folder, kind: "delete", vaultCount: folderVaults.length })
                          }
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {visibleVaults.map((vault) => renderVault(vault, true))}
                </section>
              );
            })}
          </>
        )}
      </nav>
      {dialog?.kind === "rename" ? (
        <VaultFolderDialog
          folderName={dialog.folder.name}
          kind="rename"
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
            }
          }}
          onRename={(name) => onRenameVaultFolder({ folderId: dialog.folder._id, name })}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <VaultFolderDialog
          folderName={dialog.folder.name}
          kind="delete"
          vaultCount={dialog.vaultCount}
          onDelete={() => onDeleteVaultFolder({ folderId: dialog.folder._id })}
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
            }
          }}
        />
      ) : null}
    </>
  );
}

export function VaultOverviewSidebarLoading() {
  return (
    <div aria-label="Loading vaults" className="grid gap-4 px-3 py-4">
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid gap-2" aria-hidden="true">
          <div className="h-3 w-16 bg-muted motion-safe:animate-pulse" />
          <div className="h-4 w-28 max-w-full bg-muted motion-safe:animate-pulse" />
          <div className="h-3 w-24 max-w-full bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}
