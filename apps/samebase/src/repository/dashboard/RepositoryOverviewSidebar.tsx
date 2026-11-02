import type { RepositoryOverviewPageKind } from "@/repository/dashboard/RepositoryOverviewPage";
import { APP_SIDEBAR_CURRENT_LABEL_CLASS_NAME } from "@/components/appSidebarNavigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import type {
  RepositoryFolderState,
  RepositoryOrganization,
  RepositoryOrganizationTreeSettings,
  RepositoryWorkspaceSelected,
} from "@/repository/dashboard/repositoryWorkspaceModel";
import type {
  RepositorySidebarSummariesState,
  RepositorySidebarSummary,
} from "@/repository/dashboard/useRepositorySidebarSummaries";
import type { OrganizationGitHubIdentityObservation } from "@/organization/useOrganizationGitHubIdentity";
import { useOrganizationGitHubIdentities } from "@/organization/useOrganizationGitHubIdentity";
import { ORGANIZATION_SETTINGS_ROUTE } from "@/organization/organizationRoutes";
import { formatRepositoryCheckSummary } from "@/repository/dashboard/repositoryChecks";
import type { RepositoryCheckSummary } from "../../../shared/repositoryChecks";
import { personalOrganizationsFirst } from "@/organization/organizationOrder";
import {
  buildRepositoryDashboardRoute,
  buildRepositorySettingsRoute,
} from "@/lib/repositoryRoutes";
import { Link } from "@tanstack/react-router";
import type { ReactMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  EllipsisVertical,
  Loader2,
  SquareUserRound,
} from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import {
  RepositoryFolderCreateButton,
  type RepositoryFolderCreate,
} from "./RepositoryFolderCreateButton";
import { RepositoryFolderDialog } from "./RepositoryFolderDialog";

type RepositoryFolder = RepositoryFolderState["folders"][number];
type RepositoryGitHubIdentityObservation =
  OrganizationGitHubIdentityObservation["repositories"][number];

type RepositoryMutation<Mutation extends FunctionReference<"mutation">> = (
  ...args: Parameters<ReactMutation<Mutation>>
) => Promise<void | Awaited<ReturnType<ReactMutation<Mutation>>>>;

export type RepositoryFolderCallbacks = {
  onDeleteRepositoryFolder: RepositoryMutation<
    typeof api.repository.folders.deleteRepositoryFolder
  >;
  onMoveRepositoryFolder: RepositoryMutation<typeof api.repository.folders.moveRepositoryFolder>;
  onMoveRepositoryToFolder: RepositoryMutation<
    typeof api.repository.folders.moveRepositoryToFolder
  >;
  onRenameRepositoryFolder: RepositoryMutation<
    typeof api.repository.folders.renameRepositoryFolder
  >;
  onSetRepositoryFolderCollapsed: RepositoryMutation<
    typeof api.repository.folders.setRepositoryFolderCollapsed
  >;
};

export type RepositoryOrganizationTreeCallbacks = {
  onSetRepositoryOrganizationCollapsed: RepositoryMutation<
    typeof api.repository.organizationTree.setRepositoryOrganizationCollapsed
  >;
};

type FolderDialogState =
  | { folder: RepositoryFolder; kind: "rename" }
  | { folder: RepositoryFolder; kind: "delete"; repositoryCount: number };

function repositoryRoute(
  repository: UserRepositoryResult,
  page: RepositoryOverviewPageKind,
): string {
  const args = { owner: repository.githubOwnerLogin, repoName: repository.githubRepositoryName };
  return page === "settings"
    ? buildRepositorySettingsRoute(args)
    : buildRepositoryDashboardRoute(args);
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

type RepositorySidebarStatus =
  | {
      kind: "dot" | "failure";
      dotClassName: string;
      label: string;
    }
  | { kind: "workflow"; label: string };

function repositorySidebarStatus(args: {
  sidebarSummaries: RepositorySidebarSummariesState;
  summary: RepositorySidebarSummary | undefined;
  selected: boolean;
  repository: UserRepositoryResult;
  workspace: RepositoryWorkspaceSelected | null;
}): RepositorySidebarStatus {
  if (args.repository.deletion.state === "deleting") {
    return { kind: "workflow", label: "Deleting" };
  }
  if (
    args.repository.sourceSetup.status === "running" ||
    args.repository.providerSetup.status === "running"
  ) {
    return { kind: "workflow", label: "Setting up" };
  }
  if (args.repository.deletion.state === "delete_failed") {
    return {
      kind: "failure",
      dotClassName: "h-2 w-2 rounded-full bg-red-500",
      label: "Delete failed",
    };
  }
  if (
    args.repository.sourceSetup.status === "failed" ||
    args.repository.providerSetup.status === "failed"
  ) {
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

function RepositoryRow({
  folderState,
  githubIdentity,
  pending,
  onDirectAction,
  page,
  selected,
  sidebarSummaries,
  summary,
  repository,
  workspace,
  onMoveRepositoryToFolder,
}: {
  folderState: RepositoryFolderState;
  githubIdentity: RepositoryGitHubIdentityObservation | undefined;
  pending: boolean;
  onDirectAction: (action: () => Promise<unknown>) => void;
  onMoveRepositoryToFolder: RepositoryFolderCallbacks["onMoveRepositoryToFolder"];
  page: RepositoryOverviewPageKind;
  selected: boolean;
  sidebarSummaries: RepositorySidebarSummariesState;
  summary: RepositorySidebarSummary | undefined;
  repository: UserRepositoryResult;
  workspace: RepositoryWorkspaceSelected | null;
}) {
  const status = repositorySidebarStatus({
    selected,
    sidebarSummaries,
    summary,
    repository,
    workspace,
  });
  const pullRequestCount = summary?.openPullRequestCount;
  const settingsWarning =
    githubIdentity?.status === "renamed"
      ? { label: "Repository name changed", tone: "warning" as const }
      : githubIdentity?.status === "unavailable"
        ? { label: "Repository unavailable", tone: "failure" as const }
        : null;

  return (
    <div className="flex min-w-0 hover:bg-muted/60">
      <Link
        aria-current={selected ? "page" : undefined}
        aria-label={`${repository.githubRepositoryFullName}, ${status.label}${pullRequestCount ? `, ${pullRequestCount} open ${pullRequestCount === 1 ? "pull request" : "pull requests"}` : ""}`}
        className="block min-w-0 flex-1 py-2.5 pr-3 pl-2 text-left no-underline hover:no-underline @max-[200px]:pr-2 @max-[200px]:pl-1.5 @max-[120px]:pr-1 @max-[120px]:pl-1"
        data-repository-status={status.label}
        title={repository.githubRepositoryFullName}
        to={repositoryRoute(repository, page)}
      >
        <span className="block min-w-0 max-w-full text-sm leading-5">
          <span
            className={cn(
              "min-w-0 max-w-full w-fit line-clamp-2 text-primary [overflow-wrap:anywhere]",
              selected && APP_SIDEBAR_CURRENT_LABEL_CLASS_NAME,
            )}
          >
            {repository.githubRepositoryName}
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
          <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">
            <span>{status.label}</span>
            {pullRequestCount ? (
              <span className="inline-flex @max-[200px]:hidden">
                <span aria-hidden="true" className="mx-1">
                  ·
                </span>
                {pullRequestCount} {pullRequestCount === 1 ? "PR" : "PRs"}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
      {settingsWarning ? (
        <Button asChild className="mt-2 h-10 w-8 shrink-0" size="icon" variant="ghost">
          <Link
            aria-label={`${settingsWarning.label} for ${repository.githubRepositoryFullName}. Open settings`}
            title={settingsWarning.label}
            to={buildRepositorySettingsRoute({
              owner: repository.githubOwnerLogin,
              repoName: repository.githubRepositoryName,
            })}
          >
            <AlertTriangle
              aria-hidden="true"
              className={
                settingsWarning.tone === "warning"
                  ? "h-4 w-4 text-amber-600"
                  : "h-4 w-4 text-red-700"
              }
            />
          </Link>
        </Button>
      ) : null}
      {folderState.folders.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild nativeButton>
            <Button
              aria-label={`Actions for ${repository.githubRepositoryFullName}`}
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
                        onMoveRepositoryToFolder({
                          folderId: folder._id,
                          repositoryId: repository.repositoryId,
                        }),
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
                      onMoveRepositoryToFolder({
                        folderId: null,
                        repositoryId: repository.repositoryId,
                      }),
                    )
                  }
                >
                  Unfiled
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function RepositoryOverviewSidebar({
  folderState,
  githubIdentity,
  organizationId,
  onDeleteRepositoryFolder,
  onMoveRepositoryFolder,
  onMoveRepositoryToFolder,
  onRenameRepositoryFolder,
  onSetRepositoryFolderCollapsed,
  page,
  selectedRepositoryId,
  sidebarSummaries,
  repositories,
  workspace,
}: {
  folderState: RepositoryFolderState;
  githubIdentity?: OrganizationGitHubIdentityObservation;
  organizationId: Id<"organizations">;
  page: RepositoryOverviewPageKind;
  selectedRepositoryId: UserRepositoryResult["repositoryId"] | null;
  sidebarSummaries: RepositorySidebarSummariesState;
  repositories: readonly UserRepositoryResult[];
  workspace: RepositoryWorkspaceSelected | null;
} & RepositoryFolderCallbacks) {
  const [dialog, setDialog] = useState<FolderDialogState | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const directActionPending = useRef(false);
  const summaryByRepositoryId = new Map(
    sidebarSummaries.state === "loaded"
      ? sidebarSummaries.summaries.map((summary) => [summary.repositoryId, summary])
      : [],
  );
  const githubIdentityByRepositoryId = new Map(
    githubIdentity?.repositories.map((observation) => [observation.repositoryId, observation]) ??
      [],
  );
  const organizationFolders = folderState.folders.filter(
    (folder) => folder.organizationId === organizationId,
  );
  const validFolderIds = new Set(organizationFolders.map((folder) => folder._id));
  const organizationAssignments = folderState.assignments.filter((assignment) =>
    validFolderIds.has(assignment.folderId),
  );
  const organizationFolderState = {
    assignments: organizationAssignments,
    folders: organizationFolders,
  };
  const folderByRepositoryId = new Map(
    organizationAssignments.map((assignment) => [assignment.repositoryId, assignment.folderId]),
  );
  const repositoriesByFolderId = new Map<Id<"ui_repositoryTree_folders">, UserRepositoryResult[]>();
  for (const folder of organizationFolders) {
    repositoriesByFolderId.set(folder._id, []);
  }
  const unfiledRepositories: UserRepositoryResult[] = [];
  for (const repository of repositories) {
    const folderId = folderByRepositoryId.get(repository.repositoryId);
    const folderRepositories = folderId ? repositoriesByFolderId.get(folderId) : undefined;
    if (folderRepositories) {
      folderRepositories.push(repository);
    } else {
      unfiledRepositories.push(repository);
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
          title: "Could not update repository folders",
          variant: "destructive",
        });
      })
      .finally(() => {
        directActionPending.current = false;
        setPendingAction(null);
      });
  }

  function renderRepository(repository: UserRepositoryResult) {
    return (
      <RepositoryRow
        folderState={organizationFolderState}
        githubIdentity={githubIdentityByRepositoryId.get(repository.repositoryId)}
        key={repository.repositoryId}
        pending={pendingAction !== null}
        page={page}
        selected={repository.repositoryId === selectedRepositoryId}
        sidebarSummaries={sidebarSummaries}
        summary={summaryByRepositoryId.get(repository.repositoryId)}
        repository={repository}
        workspace={workspace}
        onMoveRepositoryToFolder={onMoveRepositoryToFolder}
        onDirectAction={runDirectAction}
      />
    );
  }

  return (
    <>
      <div className="py-2">
        {organizationFolders.length === 0 ? (
          repositories.map((repository) => renderRepository(repository))
        ) : (
          <>
            {organizationFolders.map((folder, index) => {
              const folderRepositories = repositoriesByFolderId.get(folder._id) ?? [];
              const selectedRepository = folderRepositories.find(
                (repository) => repository.repositoryId === selectedRepositoryId,
              );
              const visibleRepositories = folder.collapsed ? [] : folderRepositories;
              const hasHiddenFailure =
                folder.collapsed &&
                folderRepositories.some(
                  (repository) =>
                    repositorySidebarStatus({
                      selected: repository.repositoryId === selectedRepositoryId,
                      sidebarSummaries,
                      summary: summaryByRepositoryId.get(repository.repositoryId),
                      repository,
                      workspace,
                    }).kind === "failure",
                );
              const disclosureLabel = folder.collapsed
                ? `Expand ${folder.name}, ${folderRepositories.length} ${
                    folderRepositories.length === 1 ? "repository" : "repositories"
                  }${hasHiddenFailure ? ", has hidden failures" : ""}`
                : `Collapse ${folder.name}`;

              return (
                <section
                  key={folder._id}
                  aria-label={
                    folder.collapsed && selectedRepository
                      ? `${folder.name}, contains current repository`
                      : folder.name
                  }
                >
                  <div
                    className={
                      folder.collapsed && selectedRepository
                        ? "flex min-w-0 items-center bg-muted py-1 pr-1"
                        : "flex min-w-0 items-center py-1 pr-1"
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
                          onSetRepositoryFolderCollapsed({
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
                        {folderRepositories.length}
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
                              onMoveRepositoryFolder({ direction: "up", folderId: folder._id }),
                            )
                          }
                        >
                          Move up
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={
                            index === organizationFolders.length - 1 || pendingAction !== null
                          }
                          onClick={() =>
                            runDirectAction(() =>
                              onMoveRepositoryFolder({ direction: "down", folderId: folder._id }),
                            )
                          }
                        >
                          Move down
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={pendingAction !== null}
                          onClick={() =>
                            setDialog({
                              folder,
                              kind: "delete",
                              repositoryCount: folderRepositories.length,
                            })
                          }
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {visibleRepositories.length === 0 ? null : (
                    <div className="ml-2.5 border-l border-border pl-1 @max-[200px]:pl-0.5 @max-[120px]:ml-2">
                      {visibleRepositories.map((repository) => renderRepository(repository))}
                    </div>
                  )}
                </section>
              );
            })}
            {unfiledRepositories.map((repository) => renderRepository(repository))}
          </>
        )}
      </div>
      {dialog?.kind === "rename" ? (
        <RepositoryFolderDialog
          folderName={dialog.folder.name}
          kind="rename"
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
            }
          }}
          onRename={(name) => onRenameRepositoryFolder({ folderId: dialog.folder._id, name })}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <RepositoryFolderDialog
          folderName={dialog.folder.name}
          kind="delete"
          repositoryCount={dialog.repositoryCount}
          onDelete={() => onDeleteRepositoryFolder({ folderId: dialog.folder._id })}
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

export function RepositoryOverviewOrganizationSidebar({
  folderState,
  organizations,
  organizationsCollapsible,
  onCreateRepositoryFolder,
  onDeleteRepositoryFolder,
  onMoveRepositoryFolder,
  onMoveRepositoryToFolder,
  onRenameRepositoryFolder,
  onSetRepositoryFolderCollapsed,
  onSetRepositoryOrganizationCollapsed,
  organizationTreeSettings,
  page,
  selectedRepositoryId,
  sidebarSummaries,
  repositories,
  workspace,
}: {
  folderState: RepositoryFolderState;
  organizations: readonly RepositoryOrganization[];
  organizationsCollapsible: boolean;
  organizationTreeSettings: RepositoryOrganizationTreeSettings;
  onCreateRepositoryFolder: RepositoryFolderCreate;
  page: RepositoryOverviewPageKind;
  selectedRepositoryId: UserRepositoryResult["repositoryId"] | null;
  sidebarSummaries: RepositorySidebarSummariesState;
  repositories: readonly UserRepositoryResult[];
  workspace: RepositoryWorkspaceSelected | null;
} & RepositoryFolderCallbacks &
  RepositoryOrganizationTreeCallbacks) {
  const githubIdentities = useOrganizationGitHubIdentities(
    organizations.map((organization) => organization.organizationId),
  );
  const selectedOrganizationId = repositories.find(
    (repository) => repository.repositoryId === selectedRepositoryId,
  )?.organizationId;
  const organizationTreeSettingById = new Map(
    organizationTreeSettings.map((setting) => [setting.organizationId, setting]),
  );
  const orderedOrganizations = personalOrganizationsFirst(organizations);

  return (
    <nav aria-label="Repositories" className="@container min-h-full py-2">
      {orderedOrganizations.map((organization) => {
        const organizationRepositories = repositories.filter(
          (repository) => repository.organizationId === organization.organizationId,
        );
        const organizationHasFolders = folderState.folders.some(
          (folder) => folder.organizationId === organization.organizationId,
        );
        const selected = organization.organizationId === selectedOrganizationId;
        const savedSetting = organizationTreeSettingById.get(organization.organizationId);
        const open =
          !organizationsCollapsible ||
          (savedSetting ? !savedSetting.collapsed : selectedRepositoryId === null || selected);
        const organizationLabel = (
          <span className="flex min-w-0 items-center gap-2">
            {organization.githubOwnerType === "organization" ? (
              <Building2 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <SquareUserRound
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            )}
            <span className="min-w-0 truncate">{organization.githubOwnerLogin}</span>
          </span>
        );
        const githubIdentity = githubIdentities.get(organization.organizationId);
        const identityWarning =
          githubIdentity?.owner.status === "renamed"
            ? { label: "GitHub owner name changed", tone: "warning" as const }
            : githubIdentity?.owner.status === "unavailable"
              ? { label: "GitHub connection unavailable", tone: "failure" as const }
              : null;

        return (
          <Collapsible
            key={organization.organizationId}
            open={open}
            onOpenChange={
              organizationsCollapsible
                ? (nextOpen) => {
                    void onSetRepositoryOrganizationCollapsed({
                      collapsed: !nextOpen,
                      organizationId: organization.organizationId,
                    }).catch((error: unknown) => {
                      toast({
                        description: error instanceof Error ? error.message : "Try again.",
                        title: "Could not update repository organizations",
                        variant: "destructive",
                      });
                    });
                  }
                : undefined
            }
          >
            <div className="flex min-w-0 items-center">
              {organizationsCollapsible ? (
                <CollapsibleTrigger
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 pr-1 pl-3 text-left text-sm font-medium text-foreground hover:bg-muted/60 @max-[200px]:pl-2 @max-[120px]:pl-1 [&[data-state=open]>svg]:rotate-180"
                  nativeButton
                  type="button"
                >
                  {organizationLabel}
                  {/* Compact sidebars use this space for the organization name. */}
                  <ChevronDown
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 transition-transform @max-[175px]:hidden"
                  />
                </CollapsibleTrigger>
              ) : (
                <div className="flex min-w-0 flex-1 items-center py-2 pr-1 pl-3 text-sm font-medium text-foreground @max-[200px]:pl-2 @max-[120px]:pl-1">
                  {organizationLabel}
                </div>
              )}
              {identityWarning ? (
                <Button asChild size="icon-sm" variant="ghost">
                  <Link
                    aria-label={`${identityWarning.label} for ${organization.githubOwnerLogin}. Open organization settings`}
                    params={{ owner: organization.githubOwnerLogin }}
                    title={identityWarning.label}
                    to={ORGANIZATION_SETTINGS_ROUTE}
                  >
                    <AlertTriangle
                      aria-hidden="true"
                      className={
                        identityWarning.tone === "warning"
                          ? "h-4 w-4 text-amber-600"
                          : "h-4 w-4 text-red-700"
                      }
                    />
                  </Link>
                </Button>
              ) : null}
              <RepositoryFolderCreateButton
                organizationId={organization.organizationId}
                organizationName={organization.githubOwnerLogin}
                onCreateRepositoryFolder={onCreateRepositoryFolder}
              />
            </div>
            <CollapsibleContent className="ml-5 border-l border-border pl-1 @max-[200px]:ml-4 @max-[200px]:pl-0.5 @max-[120px]:ml-3">
              {organizationRepositories.length === 0 && !organizationHasFolders ? (
                <p className="py-2 pl-2 text-sm text-muted-foreground @max-[200px]:pl-1.5 @max-[120px]:pl-1">
                  No repositories
                </p>
              ) : (
                <RepositoryOverviewSidebar
                  folderState={folderState}
                  githubIdentity={githubIdentity}
                  organizationId={organization.organizationId}
                  page={page}
                  selectedRepositoryId={selectedRepositoryId}
                  sidebarSummaries={sidebarSummaries}
                  repositories={organizationRepositories}
                  workspace={workspace}
                  onDeleteRepositoryFolder={onDeleteRepositoryFolder}
                  onMoveRepositoryFolder={onMoveRepositoryFolder}
                  onMoveRepositoryToFolder={onMoveRepositoryToFolder}
                  onRenameRepositoryFolder={onRenameRepositoryFolder}
                  onSetRepositoryFolderCollapsed={onSetRepositoryFolderCollapsed}
                />
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </nav>
  );
}

export function RepositoryOverviewSidebarLoading() {
  return (
    <div aria-label="Loading repositories" className="grid gap-4 px-3 py-4">
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
