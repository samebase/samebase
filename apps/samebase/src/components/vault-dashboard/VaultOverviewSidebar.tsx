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
import { ChevronDown, ChevronRight, Loader2, MoreHorizontal } from "lucide-react";
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

export type VaultFolderCallbacks = {
  onCreateVaultFolder: VaultFolderMutation<typeof api.vault.folders.createVaultFolder>;
  onDeleteVaultFolder: VaultFolderMutation<typeof api.vault.folders.deleteVaultFolder>;
  onMoveVaultFolder: VaultFolderMutation<typeof api.vault.folders.moveVaultFolder>;
  onMoveVaultToFolder: VaultFolderMutation<typeof api.vault.folders.moveVaultToFolder>;
  onRenameVaultFolder: VaultFolderMutation<typeof api.vault.folders.renameVaultFolder>;
  onSetVaultFolderCollapsed: VaultFolderMutation<typeof api.vault.folders.setVaultFolderCollapsed>;
};

type FolderDialogState =
  | { kind: "create"; vault: UserVaultResult }
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
  state satisfies never;
  return "h-2 w-2 rounded-full bg-muted-foreground/60";
}

function vaultSidebarStatus(args: {
  sidebarSummaries: VaultSidebarSummariesState;
  summary: VaultSidebarSummary | undefined;
  selected: boolean;
  vault: UserVaultResult;
  workspace: VaultWorkspaceSelected | null;
}): { kind: "dot"; dotClassName: string; label: string } | { kind: "workflow"; label: string } {
  if (args.vault.deletion.state === "delete_failed") {
    return {
      kind: "dot",
      dotClassName: "h-2 w-2 rounded-full bg-red-500",
      label: "Delete failed",
    };
  }
  if (args.vault.sourceSetup.status === "failed" || args.vault.providerSetup.status === "failed") {
    return {
      kind: "dot",
      dotClassName: "h-2 w-2 rounded-full bg-red-500",
      label: "Needs attention",
    };
  }
  if (args.vault.deletion.state === "deleting") {
    return { kind: "workflow", label: "Deleting" };
  }
  if (
    args.vault.sourceSetup.status === "running" ||
    args.vault.providerSetup.status === "running"
  ) {
    return { kind: "workflow", label: "Setting up" };
  }
  if (
    args.selected &&
    args.workspace &&
    (args.workspace.pullRequests.state === "current" ||
      args.workspace.pullRequests.state === "stale") &&
    args.workspace.pullRequests.defaultBranch
  ) {
    const checks = args.workspace.pullRequests.defaultBranch.checks;
    return {
      kind: "dot",
      dotClassName: checkStateDotClassName(checks.state),
      label: formatRepositoryCheckSummary(checks),
    };
  }
  if (args.summary) {
    return {
      kind: "dot",
      dotClassName: checkStateDotClassName(args.summary.checks.state),
      label: formatRepositoryCheckSummary(args.summary.checks),
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

function isVaultFailure(args: Parameters<typeof vaultSidebarStatus>[0]): boolean {
  if (
    args.vault.deletion.state === "delete_failed" ||
    args.vault.sourceSetup.status === "failed" ||
    args.vault.providerSetup.status === "failed"
  ) {
    return true;
  }

  if (
    args.selected &&
    args.workspace &&
    (args.workspace.pullRequests.state === "current" ||
      args.workspace.pullRequests.state === "stale") &&
    args.workspace.pullRequests.defaultBranch
  ) {
    return args.workspace.pullRequests.defaultBranch.checks.state === "failure";
  }

  return args.summary?.checks.state === "failure";
}

function VaultRow({
  folderState,
  pending,
  onDirectAction,
  onOpenCreateFolder,
  page,
  selected,
  sidebarSummaries,
  summary,
  vault,
  workspace,
  onMoveVaultToFolder,
}: {
  folderState: VaultFolderState;
  pending: boolean;
  onDirectAction: (action: () => Promise<unknown>) => void;
  onMoveVaultToFolder: VaultFolderCallbacks["onMoveVaultToFolder"];
  onOpenCreateFolder: (vault: UserVaultResult) => void;
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
        className="block min-w-0 flex-1 px-3 py-2.5 text-left no-underline hover:no-underline @max-[200px]:px-2 @max-[120px]:px-1"
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild nativeButton>
          <Button
            aria-label={`Actions for ${vault.repositoryFullName}`}
            className="mt-2 mr-1 size-10 shrink-0 @max-[120px]:size-8"
            disabled={pending}
            size="icon"
            type="button"
            variant="ghost"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {folderState.folders.length > 0 ? (
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
          ) : null}
          <DropdownMenuItem disabled={pending} onClick={() => onOpenCreateFolder(vault)}>
            New folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function VaultOverviewSidebar({
  folderState,
  onCreateVaultFolder,
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

  function renderVault(vault: UserVaultResult) {
    return (
      <VaultRow
        folderState={folderState}
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
        onOpenCreateFolder={(target) => setDialog({ kind: "create", vault: target })}
      />
    );
  }

  return (
    <>
      <nav aria-label="Vaults" className="@container min-h-full py-2">
        {folderState.folders.length === 0 ? (
          vaults.map(renderVault)
        ) : (
          <>
            {ungroupedVaults.length > 0 ? (
              <section aria-label="Ungrouped">
                <div className="px-3 py-1 text-sm font-medium">Ungrouped</div>
                {ungroupedVaults.map(renderVault)}
              </section>
            ) : null}
            {folderState.folders.map((folder, index) => {
              const folderVaults = vaultsByFolderId.get(folder._id) ?? [];
              const selectedVault = folderVaults.find((vault) => vault._id === selectedVaultId);
              const visibleVaults = folder.collapsed
                ? selectedVault
                  ? [selectedVault]
                  : []
                : folderVaults;
              const hiddenVaults = folder.collapsed
                ? selectedVault
                  ? folderVaults.filter((vault) => vault._id !== selectedVault._id)
                  : folderVaults
                : [];
              const hasHiddenFailure = hiddenVaults.some((vault) =>
                isVaultFailure({
                  selected: vault._id === selectedVaultId,
                  sidebarSummaries,
                  summary: summaryByVaultId.get(vault._id),
                  vault,
                  workspace,
                }),
              );

              return (
                <section key={folder._id} aria-label={folder.name}>
                  <div className="flex min-w-0 items-center px-1 py-1">
                    <Button
                      aria-label={`${folder.collapsed ? "Expand" : "Collapse"} ${folder.name}`}
                      className="size-10 @max-[120px]:size-8"
                      disabled={pendingAction !== null}
                      size="icon"
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
                      {folder.collapsed ? <ChevronRight /> : <ChevronDown />}
                    </Button>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {folder.name}
                    </span>
                    {folder.collapsed ? (
                      <span className="px-2 text-xs text-muted-foreground @max-[120px]:hidden">
                        {folderVaults.length}
                      </span>
                    ) : null}
                    {hasHiddenFailure ? (
                      <span
                        aria-label={`${folder.name} has hidden failures`}
                        className="h-2 w-2 rounded-full bg-red-500"
                      />
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild nativeButton>
                        <Button
                          aria-label={`Actions for folder ${folder.name}`}
                          className="size-10 @max-[120px]:size-8"
                          disabled={pendingAction !== null}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <MoreHorizontal />
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
                  {visibleVaults.map(renderVault)}
                </section>
              );
            })}
          </>
        )}
      </nav>
      {dialog?.kind === "create" ? (
        <VaultFolderDialog
          kind="create"
          onCreate={(name) => onCreateVaultFolder({ name, vaultId: dialog.vault._id })}
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
            }
          }}
        />
      ) : null}
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
