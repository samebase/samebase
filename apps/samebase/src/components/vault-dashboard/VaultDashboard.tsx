import { api } from "../../../convex/_generated/api";
import { AppDialogContent } from "@/components/AppDialogContent";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VaultProvisioningLog } from "@/components/vault-dashboard/VaultProvisioningLogViewer";
import { VaultDefaultBranch } from "@/components/vault-dashboard/VaultDefaultBranch";
import { VaultPullRequestList } from "@/components/vault-dashboard/VaultPullRequestList";
import { VaultResourceRail } from "@/components/vault-dashboard/VaultResourceRail";
import {
  VaultOverviewLoadingPage,
  VaultOverviewPage,
  VaultOverviewSidebar,
  VaultOverviewSidebarLoading,
  type VaultOverviewPageKind,
} from "@/components/vault-dashboard/VaultOverviewPage";
import { VaultRepositoryRootInput } from "@/components/vault-dashboard/VaultRepositoryRootInput";
import { buildVaultDashboardResourceRailState } from "@/components/vault-dashboard/vaultResourceRailState";
import { buildVaultProductionRoots } from "@/components/vault-dashboard/vaultProductionRoots";
import { ClockIcon, TrashIcon, UpdateIcon } from "@/lib/radixIcons";
import { Loader2 } from "lucide-react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { linkStyle } from "../styles";
import { clsx } from "clsx";
import { useNow } from "@/hooks/useNow";
import type { VaultPullRequestsState } from "@/hooks/useVaultPullRequests";
import type { VaultSidebarSummariesState } from "@/hooks/useVaultSidebarSummaries";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildFileViewRouteSearch, buildFileViewSearchHref } from "@/routeSearch/fileView";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VaultPullRequestFiltersControl } from "@/components/vault-dashboard/VaultPullRequestFilters";
import {
  VaultDashboardEmptyState,
  VaultDashboardRepositoryCard,
  VaultDashboardRepositoryList,
  VaultDashboardSidebarContent,
  VaultDashboardScrollTargetEndPadding,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import {
  compareCloudflareAccountOptions,
  type CloudflareAccountOption,
} from "@/components/vault-dashboard/vaultDashboardCloudflareAccountOptions";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  buildVaultDashboardRoute,
  buildVaultFileRoute,
  buildVaultOldDashboardRoute,
} from "@/lib/vaultRoutes";
import {
  formatVaultSourceSetupStep,
  type VaultDashboardSourceSetup,
} from "@/components/vault-dashboard/vaultSourceSetup";
import {
  formatVaultProviderSetupStep,
  resolveVaultProviderSetupStatus,
  type VaultDashboardProviderSetup,
} from "@/components/vault-dashboard/vaultProviderSetup";
import { type LogoRouteSearch } from "@/routeSearch/logo";
import {
  clearVaultDashboardQueryDialogSearch,
  replaceRootLogoRouteSearch,
  type RootRouteSearch,
  useRootRouteSearch,
  type VaultDashboardQueryDialog,
} from "@/routeSearch/root";
import { applySearchPatch } from "@/routing/searchFlags";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  buildVaultPullRequestFilterOptions,
  getDefaultVaultPullRequestFilters,
  normalizeVaultPullRequestFilters,
  type VaultPullRequestFilterOption,
  type VaultPullRequestFilters as VaultPullRequestFiltersState,
} from "@/components/vault-dashboard/vaultDashboardPullRequestFilters";
import { toast } from "@/components/ui/use-toast";
import { buildDefaultAppResourceName } from "../../../shared/appResourceNames";
import { buildGitHubBranchTreeUrl } from "@/lib/githubUrls";
import { tryParseRepositoryFullName } from "../../../shared/repoName";
import {
  getConvexCodeLocationKey,
  getConvexCodeLocationPath,
  type ConvexCodeLocation,
} from "../../../shared/convexCodeLocation";
import { formatStopwatchDuration } from "@/lib/stopwatch";
import {
  type VaultCloudflareProviderObservationState,
  type VaultConvexProjectObservation,
  type VaultProviderObservationState,
} from "@/components/vault-dashboard/useVaultProviderObservations";
import { useVaultWorkspaceModel } from "@/components/vault-dashboard/useVaultWorkspaceModel";

const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";
const EMPTY_REPOSITORY_FOLDER_SUGGESTIONS: readonly string[] = [];

export type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];
export type VaultDashboardViewModel = {
  vaults: readonly VaultDashboardVault[];
};
export type VaultDashboardProps = {
  page?: VaultOverviewPageKind;
  presentation?: "legacy" | "v2";
  selectedRepositoryFullName?: string;
};

export type VaultDeleteDialogTarget = {
  repositoryFullName: string;
  isSamebaseManaged: boolean;
  canRemoveGithubRepo: boolean;
  hasConvexProvision: boolean;
  hasCloudflareProvision: boolean;
  canRemoveConvexProvision: boolean;
  canRemoveCloudflareProvision: boolean;
};

type VaultDeleteIntent = VaultDeleteDialogTarget & {
  id: Id<"vaults">;
};
type VaultCloudflareDialogTarget = {
  id: Id<"vaults">;
  repositoryFullName: string;
  repositoryName: string;
};
type VaultConvexDialogTarget = {
  id: Id<"vaults">;
  repositoryFullName: string;
  repositoryName: string;
};
type CloudflareWorkerConnectMode = "existing" | "create" | "connect";
type CloudflareWorkerConnectTarget = {
  workerName: string;
  workerTag: string;
};
type CloudflareWorkerOption =
  (typeof api.vault.cloudflare.discoverWorkers)["_returnType"]["workers"][number];
type CloudflareInventoryState =
  (typeof api.vault.cloudflare.discoverWorkers)["_returnType"]["inventoryState"];
type ConvexProjectOption =
  (typeof api.vault.convex.discoverProjects)["_returnType"]["projects"][number];
type ConvexCodeLocationOption =
  (typeof api.vault.convex.discoverProjects)["_returnType"]["source"]["locations"][number];
type ConvexSourceCompleteness =
  (typeof api.vault.convex.discoverProjects)["_returnType"]["source"]["completeness"];
type ConvexProjectConnectMode = "existing" | "create";

type VaultDashboardDeletion = VaultDashboardVault["deletion"];
type VaultDashboardDeleteAction = Extract<
  VaultDashboardDeletion,
  { state: "not_deleting" }
>["deleteAction"];
type VaultDashboardDeletionStep = Extract<
  VaultDashboardDeletion,
  { state: "deleting" | "delete_failed" }
>["currentStep"];
type CloudflareWorkerConfigurationActionInFlight =
  | {
      kind: "configure_workers_builds_for_github";
      vaultId: Id<"vaults">;
      workerId: Id<"vaultCloudflareWorkers">;
    }
  | {
      kind: "rotate_convex_deploy_keys_for_workers_builds";
      vaultId: Id<"vaults">;
      workerId: Id<"vaultCloudflareWorkers">;
      convexProjectId: Id<"vaultConvexProjects">;
    };
type ProviderAttachmentDetachmentInFlight =
  | {
      provider: "cloudflare";
      vaultId: Id<"vaults">;
      workerId: Id<"vaultCloudflareWorkers">;
    }
  | {
      provider: "convex";
      vaultId: Id<"vaults">;
      convexProjectId: Id<"vaultConvexProjects">;
    };
type ConvexCodeLocationRepairTarget = {
  convexProjectId: Id<"vaultConvexProjects">;
  vaultId: Id<"vaults">;
};
type CloudflareBuildsRepairTarget = {
  vaultId: Id<"vaults">;
  workerId: Id<"vaultCloudflareWorkers">;
};

function formatProviderSetupDeveloperLabel(providerSetup: VaultDashboardProviderSetup): string {
  switch (providerSetup.status) {
    case "not_applicable":
      return "Providers: not applicable";
    case "ready":
      return "Providers: ready";
    case "running":
      return `${providerSetup.provider}: provisioning`;
    case "failed":
      return `${providerSetup.provider}: failed`;
  }
  providerSetup satisfies never;
  return "Providers";
}

export type VaultDeleteOptionKey =
  | "removeConvexProvision"
  | "removeGithubRepo"
  | "removeCloudflareProvision";

function compareConvexProjectOption(left: ConvexProjectOption, right: ConvexProjectOption): number {
  return (
    Number(right.workerReferences.length > 0) - Number(left.workerReferences.length > 0) ||
    left.projectName.localeCompare(right.projectName) ||
    left.projectSlug.localeCompare(right.projectSlug) ||
    left.projectId.localeCompare(right.projectId)
  );
}

function readConvexCodeLocationOption(option: ConvexCodeLocationOption): ConvexCodeLocation {
  switch (option.kind) {
    case "config":
      return { kind: "config", convexConfigPath: option.convexConfigPath };
    case "directory":
      return { kind: "directory", convexDirectoryPath: option.convexDirectoryPath };
    default:
      option satisfies never;
      throw new Error("Unsupported Convex code location.");
  }
}

function getConvexCodeLocationOptionKey(option: ConvexCodeLocationOption): string {
  return getConvexCodeLocationKey(readConvexCodeLocationOption(option));
}

function getConvexCodeLocationOptionLabel(option: ConvexCodeLocationOption): string {
  const path = getConvexCodeLocationPath(readConvexCodeLocationOption(option));
  return option.kind === "directory" ? `${path} (default layout)` : path;
}

function getConvexCodeLocationSelection(option: ConvexCodeLocationOption) {
  switch (option.kind) {
    case "config":
      return {
        kind: "config" as const,
        convexConfigPath: option.convexConfigPath,
        blobSha: option.blobSha,
      };
    case "directory":
      return {
        kind: "directory" as const,
        convexDirectoryPath: option.convexDirectoryPath,
        convexDirectoryTreeSha: option.convexDirectoryTreeSha,
        packageJsonBlobSha: option.packageJsonBlobSha,
      };
    default:
      option satisfies never;
      throw new Error("Unsupported Convex code location.");
  }
}

type VaultDashboardLocalState = {
  cloudflareConnectDialog: {
    accounts: CloudflareAccountOption[];
    connectMode: CloudflareWorkerConnectMode;
    createRootDirectory: string;
    createWorkerName: string;
    didAddWorker: boolean;
    error: string | null;
    inventoryState: CloudflareInventoryState | null;
    isLoadingResources: boolean;
    isSubmittingWorker: boolean;
    selectedAccountId: string;
    selectedWorkerTags: string[];
    workerToConnect: CloudflareWorkerConnectTarget | null;
    workers: CloudflareWorkerOption[];
  };
  convexConnectDialog: {
    codeLocations: ConvexCodeLocationOption[];
    connectMode: ConvexProjectConnectMode;
    createCodeLocationKey: string;
    createProjectName: string;
    error: string | null;
    isLoadingResources: boolean;
    isSubmittingProject: boolean;
    projects: ConvexProjectOption[];
    selectedProjectCodeLocationKeys: Record<string, string | undefined>;
    sourceCompleteness: ConvexSourceCompleteness | null;
  };
  commitError: string | null;
  deleteError: string | null;
  didAttemptCommit: boolean;
  isCommitting: boolean;
  isDeleting: boolean;
  openDeveloperToolsByVaultId: Partial<Record<Id<"vaults">, boolean>>;
  removeConvexProvision: boolean;
  removeGithubRepo: boolean;
  removeCloudflareProvision: boolean;
  retryingDeletionRunId: Id<"workflow_vaultDeletion_runs"> | null;
};

function readInitialConvexConnectDialogState(): VaultDashboardLocalState["convexConnectDialog"] {
  return {
    codeLocations: [],
    connectMode: "existing",
    createCodeLocationKey: "",
    createProjectName: "",
    error: null,
    isLoadingResources: false,
    isSubmittingProject: false,
    projects: [],
    selectedProjectCodeLocationKeys: {},
    sourceCompleteness: null,
  };
}

function readVaultDashboardInitialLocalState(): VaultDashboardLocalState {
  return {
    cloudflareConnectDialog: {
      accounts: [],
      connectMode: "existing",
      createRootDirectory: "/",
      createWorkerName: "",
      didAddWorker: false,
      error: null,
      inventoryState: null,
      isLoadingResources: false,
      isSubmittingWorker: false,
      selectedAccountId: "",
      selectedWorkerTags: [],
      workerToConnect: null,
      workers: [],
    },
    convexConnectDialog: readInitialConvexConnectDialogState(),
    commitError: null,
    deleteError: null,
    didAttemptCommit: false,
    isCommitting: false,
    isDeleting: false,
    openDeveloperToolsByVaultId: {},
    removeConvexProvision: false,
    removeGithubRepo: false,
    removeCloudflareProvision: false,
    retryingDeletionRunId: null,
  };
}

function useVaultDashboardLocalStore() {
  return useCreateStore(readVaultDashboardInitialLocalState(), ({ setState }) => ({
    prepareDeleteDialog: () => {
      setState((state) => ({
        ...state,
        commitError: null,
        deleteError: null,
        didAttemptCommit: false,
        removeConvexProvision: false,
        removeGithubRepo: false,
        removeCloudflareProvision: false,
      }));
    },
    markCommitAttempted: () => {
      setState((state) => ({ ...state, didAttemptCommit: true }));
    },
    resetCloudflareConnectDialogState: () => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: {
          accounts: [],
          connectMode: "existing",
          createRootDirectory: "/",
          createWorkerName: "",
          didAddWorker: false,
          error: null,
          inventoryState: null,
          isLoadingResources: false,
          isSubmittingWorker: false,
          selectedAccountId: "",
          selectedWorkerTags: [],
          workerToConnect: null,
          workers: [],
        },
      }));
    },
    resetConvexConnectDialogState: () => {
      setState((state) => ({
        ...state,
        convexConnectDialog: readInitialConvexConnectDialogState(),
      }));
    },
    resetDeleteDialogState: () => {
      setState((state) => ({
        ...state,
        commitError: null,
        deleteError: null,
        didAttemptCommit: false,
        removeConvexProvision: false,
        removeGithubRepo: false,
        removeCloudflareProvision: false,
      }));
    },
    setCloudflareConnectDialogAccounts: (accounts: CloudflareAccountOption[]) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, accounts },
      }));
    },
    setCloudflareConnectDialogCreateRootDirectory: (createRootDirectory: string) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, createRootDirectory },
      }));
    },
    setCloudflareConnectDialogConnectMode: (connectMode: CloudflareWorkerConnectMode) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: {
          ...state.cloudflareConnectDialog,
          connectMode,
          createRootDirectory:
            connectMode === "connect" ? "" : state.cloudflareConnectDialog.createRootDirectory,
          error: null,
          workerToConnect: null,
        },
      }));
    },
    setCloudflareConnectDialogCreateWorkerName: (createWorkerName: string) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, createWorkerName },
      }));
    },
    setCloudflareConnectDialogWorkerToConnect: (
      workerToConnect: CloudflareWorkerConnectTarget | null,
    ) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: {
          ...state.cloudflareConnectDialog,
          createRootDirectory: workerToConnect
            ? ""
            : state.cloudflareConnectDialog.createRootDirectory,
          error: null,
          workerToConnect,
        },
      }));
    },
    setCloudflareConnectDialogError: (error: string | null) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, error },
      }));
    },
    setCloudflareConnectDialogLoading: (isLoadingResources: boolean) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, isLoadingResources },
      }));
    },
    setCloudflareConnectDialogInventoryState: (inventoryState: CloudflareInventoryState | null) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, inventoryState },
      }));
    },
    setCloudflareConnectDialogSelectedAccountId: (selectedAccountId: string) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, selectedAccountId },
      }));
    },
    toggleCloudflareConnectDialogWorker: (workerTag: string) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: {
          ...state.cloudflareConnectDialog,
          selectedWorkerTags: state.cloudflareConnectDialog.selectedWorkerTags.includes(workerTag)
            ? state.cloudflareConnectDialog.selectedWorkerTags.filter(
                (candidate) => candidate !== workerTag,
              )
            : [...state.cloudflareConnectDialog.selectedWorkerTags, workerTag],
        },
      }));
    },
    setCloudflareConnectDialogSubmitting: (isSubmittingWorker: boolean) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, isSubmittingWorker },
      }));
    },
    setCloudflareConnectDialogWorkers: (workers: CloudflareWorkerOption[]) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: {
          ...state.cloudflareConnectDialog,
          selectedWorkerTags: workers
            .filter((worker) => worker.repository.state === "ready")
            .map((worker) => worker.workerTag),
          workers,
        },
      }));
    },
    markCloudflareConnectDialogWorkerAdded: (workerTag: string) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: {
          ...state.cloudflareConnectDialog,
          didAddWorker: true,
          connectMode: "existing",
          error: null,
          selectedWorkerTags: state.cloudflareConnectDialog.selectedWorkerTags.filter(
            (candidate) => candidate !== workerTag,
          ),
          workerToConnect: null,
          workers: state.cloudflareConnectDialog.workers.filter(
            (worker) => worker.workerTag !== workerTag,
          ),
        },
      }));
    },
    setConvexConnectDialogConnectMode: (connectMode: ConvexProjectConnectMode) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: { ...state.convexConnectDialog, connectMode },
      }));
    },
    setConvexConnectDialogCreateProjectName: (createProjectName: string) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: { ...state.convexConnectDialog, createProjectName },
      }));
    },
    setConvexConnectDialogCodeLocations: (codeLocations: ConvexCodeLocationOption[]) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: {
          ...state.convexConnectDialog,
          codeLocations,
          createCodeLocationKey: codeLocations[0]
            ? getConvexCodeLocationOptionKey(codeLocations[0])
            : "",
          selectedProjectCodeLocationKeys: {},
        },
      }));
    },
    setConvexConnectDialogProjects: (projects: ConvexProjectOption[]) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: {
          ...state.convexConnectDialog,
          projects,
          selectedProjectCodeLocationKeys: {},
        },
      }));
    },
    setConvexConnectDialogError: (error: string | null) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: { ...state.convexConnectDialog, error },
      }));
    },
    setConvexConnectDialogLoading: (isLoadingResources: boolean) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: { ...state.convexConnectDialog, isLoadingResources },
      }));
    },
    setConvexConnectDialogSourceCompleteness: (
      sourceCompleteness: ConvexSourceCompleteness | null,
    ) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: { ...state.convexConnectDialog, sourceCompleteness },
      }));
    },
    setConvexConnectDialogCreateCodeLocationKey: (createCodeLocationKey: string) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: { ...state.convexConnectDialog, createCodeLocationKey },
      }));
    },
    setConvexConnectDialogProjectCodeLocationKey: (projectId: string, codeLocationKey: string) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: {
          ...state.convexConnectDialog,
          selectedProjectCodeLocationKeys: {
            ...state.convexConnectDialog.selectedProjectCodeLocationKeys,
            [projectId]: codeLocationKey,
          },
        },
      }));
    },
    toggleConvexConnectDialogProject: (projectId: string) => {
      setState((state) => {
        const selectedCodeLocationKey =
          state.convexConnectDialog.selectedProjectCodeLocationKeys[projectId];
        const selectedProjectCodeLocationKeys =
          selectedCodeLocationKey !== undefined
            ? Object.fromEntries(
                Object.entries(state.convexConnectDialog.selectedProjectCodeLocationKeys).filter(
                  ([candidate]) => candidate !== projectId,
                ),
              )
            : {
                ...state.convexConnectDialog.selectedProjectCodeLocationKeys,
                [projectId]: state.convexConnectDialog.codeLocations[0]
                  ? getConvexCodeLocationOptionKey(state.convexConnectDialog.codeLocations[0])
                  : "",
              };
        return {
          ...state,
          convexConnectDialog: {
            ...state.convexConnectDialog,
            selectedProjectCodeLocationKeys,
          },
        };
      });
    },
    setConvexConnectDialogSubmitting: (isSubmittingProject: boolean) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: { ...state.convexConnectDialog, isSubmittingProject },
      }));
    },
    setCommitError: (commitError: string | null) => {
      setState((state) => ({ ...state, commitError }));
    },
    setDeleteError: (deleteError: string | null) => {
      setState((state) => ({ ...state, deleteError }));
    },
    setDeleteOption: (option: VaultDeleteOptionKey, value: boolean) => {
      setState((state) => {
        switch (option) {
          case "removeConvexProvision":
            return { ...state, removeConvexProvision: value };
          case "removeGithubRepo":
            return { ...state, removeGithubRepo: value };
          case "removeCloudflareProvision":
            return { ...state, removeCloudflareProvision: value };
        }

        option satisfies never;
        return state;
      });
    },
    setDeveloperToolsOpen: (vaultId: Id<"vaults">, isOpen: boolean) => {
      setState((state) => ({
        ...state,
        openDeveloperToolsByVaultId: {
          ...state.openDeveloperToolsByVaultId,
          [vaultId]: isOpen,
        },
      }));
    },
    setIsCommitting: (isCommitting: boolean) => {
      setState((state) => ({ ...state, isCommitting }));
    },
    setIsDeleting: (isDeleting: boolean) => {
      setState((state) => ({ ...state, isDeleting }));
    },
    setRetryingDeletionRunId: (retryingDeletionRunId: Id<"workflow_vaultDeletion_runs"> | null) => {
      setState((state) => ({ ...state, retryingDeletionRunId }));
    },
  }));
}

function buildVaultDeleteIntent(vault: VaultDashboardVault): VaultDeleteIntent {
  if (
    vault.deletion.state !== "not_deleting" ||
    vault.deletion.deleteAction.state !== "available"
  ) {
    throw new Error("Vault cannot open the delete dialog.");
  }

  return {
    id: vault._id,
    repositoryFullName: vault.repositoryFullName,
    isSamebaseManaged: vault.isSamebaseManaged,
    canRemoveGithubRepo: vault.isSamebaseManaged && vault.hasConnectedGitHubRepository,
    hasConvexProvision: vault.hasConvexProvision,
    hasCloudflareProvision: vault.hasCloudflareProvision,
    canRemoveConvexProvision: vault.canRemoveConvexProvision,
    canRemoveCloudflareProvision: vault.canRemoveCloudflareProvision,
  };
}

export function VaultDashboardDeleteControl({
  deleteAction,
  isRemovingVault = false,
  repositoryFullName,
}: {
  deleteAction: VaultDashboardDeleteAction;
  isRemovingVault?: boolean;
  repositoryFullName: string;
}) {
  const deleteTriggerDisabled = isRemovingVault || deleteAction.state === "disabled";
  const title = deleteAction.state === "disabled" ? deleteAction.reason : "Remove vault";

  return (
    <span className="absolute right-4 top-4">
      <Link
        to="."
        resetScroll={false}
        search={(currentSearch) => ({
          ...currentSearch,
          delete: true,
        })}
        state={(currentState) => ({
          ...currentState,
          vaultDashboardDialog: "delete",
        })}
        aria-label={`Remove vault ${repositoryFullName}`}
        title={title}
        aria-disabled={deleteTriggerDisabled ? true : undefined}
        tabIndex={deleteTriggerDisabled ? -1 : undefined}
        onClick={(event) => {
          if (deleteTriggerDisabled) {
            event.preventDefault();
          }
        }}
        className={clsx(
          buttonVariants({ variant: "destructive", size: "icon-sm" }),
          deleteTriggerDisabled && "cursor-not-allowed opacity-50",
        )}
      >
        <TrashIcon className="h-4 w-4" aria-hidden="true" />
      </Link>
    </span>
  );
}

export function VaultDashboardDeleteDialog({
  commitError,
  deleteError,
  didAttemptCommit,
  isCommitting,
  isDeleting,
  onCommitBeforeRemove,
  onDeleteOptionChange,
  onOpenChange,
  onRemoveVault,
  open,
  removeConvexProvision,
  removeGithubRepo,
  removeCloudflareProvision,
  stagedChangesCount,
  vaultToDelete,
}: {
  commitError: string | null;
  deleteError: string | null;
  didAttemptCommit: boolean;
  isCommitting: boolean;
  isDeleting: boolean;
  onCommitBeforeRemove: () => void;
  onDeleteOptionChange: (option: VaultDeleteOptionKey, value: boolean) => void;
  onOpenChange: (isOpen: boolean) => void;
  onRemoveVault: () => void;
  open: boolean;
  removeConvexProvision: boolean;
  removeGithubRepo: boolean;
  removeCloudflareProvision: boolean;
  stagedChangesCount: number;
  vaultToDelete: VaultDeleteDialogTarget | null;
}) {
  const hasStagedChanges = stagedChangesCount > 0;
  const removeCloudflareCheckboxId = "remove-cloudflare-provision";
  const removeCloudflareLabel = "Also remove Cloudflare Worker";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>
            {vaultToDelete ? `Remove Vault ${vaultToDelete.repositoryFullName}` : "Remove Vault"}
          </DialogTitle>
          <DialogDescription>
            {hasStagedChanges
              ? `This vault has ${stagedChangesCount} uncommitted local change${stagedChangesCount === 1 ? "" : "s"}. You can commit ${stagedChangesCount === 1 ? "it" : "them"} now.`
              : "All local changes are already backed up on GitHub."}
          </DialogDescription>
        </DialogHeader>
        {vaultToDelete ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Checkbox
                id="remove-github-repo"
                checked={removeGithubRepo}
                onCheckedChange={(checked) =>
                  onDeleteOptionChange("removeGithubRepo", checked === true)
                }
                disabled={!vaultToDelete.canRemoveGithubRepo || isDeleting || isCommitting}
                className="mt-0.5"
              />
              <label htmlFor="remove-github-repo" className="text-sm text-muted-foreground">
                Also remove GitHub repository
                {!vaultToDelete.canRemoveGithubRepo ? (
                  <div className="text-xs text-muted-foreground">
                    Only available for confirmed repositories created in Samebase.
                  </div>
                ) : null}
              </label>
            </div>
            {vaultToDelete.hasConvexProvision || vaultToDelete.canRemoveConvexProvision ? (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="remove-convex-provision"
                  checked={removeConvexProvision}
                  onCheckedChange={(checked) =>
                    onDeleteOptionChange("removeConvexProvision", checked === true)
                  }
                  disabled={!vaultToDelete.canRemoveConvexProvision || isDeleting || isCommitting}
                  className="mt-0.5"
                />
                <label htmlFor="remove-convex-provision" className="text-sm text-muted-foreground">
                  Also remove Convex project/deployment
                  {!vaultToDelete.canRemoveConvexProvision ? (
                    <div className="text-xs text-muted-foreground">
                      Only available for infrastructure provisioned by Samebase.
                    </div>
                  ) : null}
                </label>
              </div>
            ) : null}
            {vaultToDelete.hasCloudflareProvision ? (
              <div className="flex items-start gap-2">
                <Checkbox
                  id={removeCloudflareCheckboxId}
                  checked={removeCloudflareProvision}
                  onCheckedChange={(checked) =>
                    onDeleteOptionChange("removeCloudflareProvision", checked === true)
                  }
                  disabled={
                    !vaultToDelete.canRemoveCloudflareProvision || isDeleting || isCommitting
                  }
                  className="mt-0.5"
                />
                <label
                  htmlFor={removeCloudflareCheckboxId}
                  className="text-sm text-muted-foreground"
                >
                  {removeCloudflareLabel}
                  {!vaultToDelete.canRemoveCloudflareProvision ? (
                    <div className="text-xs text-muted-foreground">
                      Only available for Workers created from this app.
                    </div>
                  ) : null}
                </label>
              </div>
            ) : null}
            {deleteError ? <div className="text-sm text-red-600">{deleteError}</div> : null}
            {commitError ? <div className="text-sm text-red-600">{commitError}</div> : null}
            {didAttemptCommit && hasStagedChanges ? (
              <div className="text-sm text-muted-foreground">
                Some local changes are still uncommitted. You can retry commit or remove anyway.
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isDeleting || isCommitting}
          >
            Cancel
          </Button>
          {vaultToDelete && hasStagedChanges ? (
            <Button
              variant="outline"
              onClick={onCommitBeforeRemove}
              disabled={isDeleting || isCommitting}
            >
              {isCommitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Committing...
                </>
              ) : (
                "Commit changes"
              )}
            </Button>
          ) : null}
          <Button
            variant="destructive"
            onClick={onRemoveVault}
            disabled={!vaultToDelete || isDeleting || isCommitting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Removing...
              </>
            ) : (
              "Remove Vault"
            )}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}

function VaultProviderDiscoveryLoadingState({ label }: { label: string }) {
  const [startedAt] = useState(Date.now);
  const now = useNow({ intervalMs: 100 });
  const elapsedLabel = formatStopwatchDuration(now - startedAt);

  return (
    <div role="status" className="flex items-center justify-between gap-3 border-y py-3 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        <span>{label}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <ClockIcon className="h-3.5 w-3.5" />
        <span aria-label={`Elapsed search time ${elapsedLabel}`}>{elapsedLabel}</span>
      </span>
    </div>
  );
}

export function VaultDashboardConvexDialog({
  codeLocations,
  createCodeLocationKey,
  createProjectName,
  projects,
  error,
  isLoading,
  isSubmitting,
  mode,
  onCreateCodeLocationKeyChange,
  onCreateProjectNameChange,
  onModeChange,
  onOpenChange,
  onProjectCodeLocationKeyChange,
  onProjectToggle,
  onSubmit,
  open,
  repairProject,
  selectedProjectCodeLocationKeys,
  sourceCompleteness,
  vault,
}: {
  codeLocations: readonly ConvexCodeLocationOption[];
  createCodeLocationKey: string;
  createProjectName: string;
  projects: readonly ConvexProjectOption[];
  error: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  mode: ConvexProjectConnectMode;
  onCreateCodeLocationKeyChange: (codeLocationKey: string) => void;
  onCreateProjectNameChange: (projectName: string) => void;
  onModeChange: (mode: ConvexProjectConnectMode) => void;
  onOpenChange: (isOpen: boolean) => void;
  onProjectCodeLocationKeyChange: (projectId: string, codeLocationKey: string) => void;
  onProjectToggle: (projectId: string) => void;
  onSubmit: () => void;
  open: boolean;
  repairProject: { codeLocation: ConvexCodeLocation; projectId: string } | null;
  selectedProjectCodeLocationKeys: Readonly<Record<string, string | undefined>>;
  sourceCompleteness: ConvexSourceCompleteness | null;
  vault: VaultConvexDialogTarget | null;
}) {
  const codeLocationOptions = codeLocations.map((location) => ({
    key: getConvexCodeLocationOptionKey(location),
    label: getConvexCodeLocationOptionLabel(location),
  }));
  const sortedProjects = useMemo(() => [...projects].sort(compareConvexProjectOption), [projects]);
  const selectedProjectCount = Object.keys(selectedProjectCodeLocationKeys).length;
  const submitDisabled =
    isLoading ||
    isSubmitting ||
    codeLocationOptions.length === 0 ||
    (repairProject
      ? !createCodeLocationKey
      : mode === "existing"
        ? selectedProjectCount === 0 ||
          Object.values(selectedProjectCodeLocationKeys).some((key) => !key)
        : !createProjectName.trim() || !createCodeLocationKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>
            {vault
              ? repairProject
                ? `Change ${repairProject.projectId} code location`
                : `Add Convex to ${vault.repositoryFullName}`
              : "Add Convex"}
          </DialogTitle>
          <DialogDescription>
            {repairProject
              ? `Choose the code location for this project. Current location: ${getConvexCodeLocationPath(repairProject.codeLocation)}.`
              : mode === "existing"
                ? "Choose one or more projects and the code location for each."
                : "Choose a project name and its code location."}
          </DialogDescription>
        </DialogHeader>
        {vault ? (
          <div className="space-y-3">
            {isLoading ? (
              <VaultProviderDiscoveryLoadingState label="Searching for Convex code and projects" />
            ) : (
              <>
                {!repairProject ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={mode === "existing" ? "default" : "outline"}
                      onClick={() => onModeChange("existing")}
                      disabled={isSubmitting}
                    >
                      Existing
                    </Button>
                    <Button
                      type="button"
                      variant={mode === "create" ? "default" : "outline"}
                      onClick={() => onModeChange("create")}
                      disabled={isSubmitting}
                    >
                      Create
                    </Button>
                  </div>
                ) : null}
                {sourceCompleteness === "partial" ? (
                  <div className="text-sm text-muted-foreground">
                    The repository could not be fully scanned. Verified locations found so far are
                    shown.
                  </div>
                ) : null}
                {codeLocationOptions.length === 0 ? (
                  sourceCompleteness === "complete" ? (
                    <div className="text-sm text-muted-foreground">
                      No convex.json or package.json with a sibling convex/ directory was found on
                      the default branch.
                    </div>
                  ) : null
                ) : repairProject ? (
                  <Select
                    modal={false}
                    value={createCodeLocationKey}
                    onValueChange={onCreateCodeLocationKeyChange}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger aria-label="New Convex code location" className="w-full">
                      <SelectValue placeholder="Convex code location" />
                    </SelectTrigger>
                    <AppSelectContent>
                      {codeLocationOptions.map((location) => (
                        <AppSelectItem key={location.key} value={location.key}>
                          <span className="font-mono">{location.label}</span>
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </Select>
                ) : mode === "existing" ? (
                  sortedProjects.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No unattached Convex projects are available.
                    </div>
                  ) : (
                    <div className="grid max-h-80 gap-3 overflow-y-auto">
                      {sortedProjects.map((project) => {
                        const selectedCodeLocationKey =
                          selectedProjectCodeLocationKeys[project.projectId];
                        const selected = selectedCodeLocationKey !== undefined;
                        return (
                          <div
                            key={project.projectId}
                            className="grid gap-2 border-b pb-3 last:border-b-0"
                          >
                            <label className="flex min-w-0 items-start gap-2">
                              <Checkbox
                                checked={selected}
                                disabled={isSubmitting}
                                onCheckedChange={() => onProjectToggle(project.projectId)}
                              />
                              <span className="grid min-w-0 gap-0.5">
                                <span className="truncate text-sm">{project.projectName}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {project.teamSlug}/{project.projectSlug}
                                </span>
                                {project.workerReferences.length > 0 ? (
                                  <span className="truncate text-xs text-muted-foreground">
                                    Used by{" "}
                                    {project.workerReferences
                                      .map((worker) => worker.workerName)
                                      .join(", ")}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                            {selected ? (
                              <Select
                                modal={false}
                                value={selectedCodeLocationKey}
                                onValueChange={(codeLocationKey) =>
                                  onProjectCodeLocationKeyChange(project.projectId, codeLocationKey)
                                }
                                disabled={isSubmitting}
                              >
                                <SelectTrigger
                                  aria-label={`Code location for ${project.projectName}`}
                                  className="w-full"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <AppSelectContent>
                                  {codeLocationOptions.map((location) => (
                                    <AppSelectItem key={location.key} value={location.key}>
                                      <span className="font-mono">{location.label}</span>
                                    </AppSelectItem>
                                  ))}
                                </AppSelectContent>
                              </Select>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="grid gap-3">
                    <Input
                      value={createProjectName}
                      onChange={(event) => onCreateProjectNameChange(event.target.value)}
                      disabled={isSubmitting}
                      placeholder="Project name"
                    />
                    <Select
                      modal={false}
                      value={createCodeLocationKey}
                      onValueChange={onCreateCodeLocationKeyChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger aria-label="Convex code location" className="w-full">
                        <SelectValue placeholder="Convex code location" />
                      </SelectTrigger>
                      <AppSelectContent>
                        {codeLocationOptions.map((location) => (
                          <AppSelectItem key={location.key} value={location.key}>
                            <span className="font-mono">{location.label}</span>
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
            {error ? <div className="text-sm text-red-600">{error}</div> : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          {!isLoading ? (
            <Button onClick={onSubmit} disabled={submitDisabled}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {repairProject
                ? "Change code location"
                : mode === "existing"
                  ? selectedProjectCount === 0
                    ? "Add projects"
                    : `Add ${selectedProjectCount} project${selectedProjectCount === 1 ? "" : "s"}`
                  : "Create project"}
            </Button>
          ) : null}
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}

export function VaultDashboardCloudflareDialog({
  accounts,
  createRootDirectory,
  createWorkerName,
  didAddWorker,
  error,
  folderSuggestions,
  isLoading,
  isSubmitting,
  inventoryState,
  mode,
  onAccountChange,
  onCreateRootDirectoryChange,
  onCreateWorkerNameChange,
  onConnectWorker,
  onConnectWorkerBack,
  onModeChange,
  onOpenChange,
  onSubmit,
  onWorkerToggle,
  open,
  selectedAccountId,
  selectedWorkerTags,
  repairWorker,
  vault,
  workerToConnect,
  workers,
}: {
  accounts: readonly CloudflareAccountOption[];
  createRootDirectory: string;
  createWorkerName: string;
  didAddWorker: boolean;
  error: string | null;
  folderSuggestions: readonly string[];
  isLoading: boolean;
  isSubmitting: boolean;
  inventoryState: CloudflareInventoryState | null;
  mode: CloudflareWorkerConnectMode;
  onAccountChange: (accountId: string) => void;
  onCreateRootDirectoryChange: (rootDirectory: string) => void;
  onCreateWorkerNameChange: (workerName: string) => void;
  onConnectWorker: (worker: CloudflareWorkerConnectTarget) => void;
  onConnectWorkerBack: () => void;
  onModeChange: (mode: CloudflareWorkerConnectMode) => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: () => void;
  onWorkerToggle: (workerTag: string) => void;
  open: boolean;
  selectedAccountId: string;
  selectedWorkerTags: readonly string[];
  repairWorker: { workerName: string } | null;
  vault: VaultCloudflareDialogTarget | null;
  workerToConnect: CloudflareWorkerConnectTarget | null;
  workers: readonly CloudflareWorkerOption[];
}) {
  const sortedAccounts = useMemo(
    () => [...accounts].sort(compareCloudflareAccountOptions),
    [accounts],
  );
  const workerGroups = useMemo(() => {
    const workersByRoot = new Map<string, CloudflareWorkerOption[]>();
    for (const worker of workers) {
      if (worker.repository.state !== "ready") {
        continue;
      }
      const workersAtRoot = workersByRoot.get(worker.repository.rootDirectory);
      if (workersAtRoot) {
        workersAtRoot.push(worker);
      } else {
        workersByRoot.set(worker.repository.rootDirectory, [worker]);
      }
    }
    return [...workersByRoot.entries()]
      .sort(([leftRoot], [rightRoot]) => {
        if (leftRoot === rightRoot) {
          return 0;
        }
        if (leftRoot === "/") {
          return -1;
        }
        if (rightRoot === "/") {
          return 1;
        }
        return leftRoot.localeCompare(rightRoot);
      })
      .map(([rootDirectory, workersAtRoot]) => ({
        rootDirectory,
        workers: workersAtRoot.sort(
          (left, right) =>
            left.workerName.localeCompare(right.workerName) ||
            left.workerTag.localeCompare(right.workerTag),
        ),
      }));
  }, [workers]);
  const unconnectedWorkers = useMemo(
    () =>
      workers
        .filter((worker) => worker.repository.state === "not_connected")
        .sort(
          (left, right) =>
            left.workerName.localeCompare(right.workerName) ||
            left.workerTag.localeCompare(right.workerTag),
        ),
    [workers],
  );
  const selectedAccount = sortedAccounts.find((account) => account.accountId === selectedAccountId);
  const submitDisabled =
    isSubmitting ||
    (repairWorker
      ? !createRootDirectory.trim()
      : isLoading ||
        !selectedAccountId ||
        (mode === "existing"
          ? selectedWorkerTags.length === 0
          : mode === "connect"
            ? !workerToConnect || !createRootDirectory.trim()
            : !createWorkerName.trim() || !createRootDirectory.trim()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>
            {vault
              ? repairWorker
                ? `Configure ${repairWorker.workerName} Builds`
                : mode === "connect"
                  ? `Connect a Worker to ${vault.repositoryFullName}`
                  : `Add Cloudflare to ${vault.repositoryFullName}`
              : "Add Cloudflare"}
          </DialogTitle>
          <DialogDescription>
            {repairWorker
              ? "Choose the repository root Cloudflare should build."
              : mode === "connect"
                ? "Choose the Worker and its repository root."
                : mode === "existing"
                  ? "Choose Workers connected to this repository, or connect another Worker."
                  : "Create a Worker and choose the repository root Cloudflare should build."}
          </DialogDescription>
        </DialogHeader>
        {vault ? (
          <div className="space-y-3">
            {repairWorker ? (
              <VaultRepositoryRootInput
                disabled={isSubmitting}
                folderSuggestions={folderSuggestions}
                onValueChange={onCreateRootDirectoryChange}
                value={createRootDirectory}
              />
            ) : isLoading ? (
              <VaultProviderDiscoveryLoadingState label="Searching for Cloudflare Workers" />
            ) : mode === "connect" ? (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="cloudflare-worker-to-connect">Worker</Label>
                  <Select
                    value={workerToConnect?.workerTag ?? ""}
                    onValueChange={(workerTag) => {
                      const worker = unconnectedWorkers.find(
                        (candidate) => candidate.workerTag === workerTag,
                      );
                      if (worker) {
                        onConnectWorker({
                          workerName: worker.workerName,
                          workerTag: worker.workerTag,
                        });
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="cloudflare-worker-to-connect" className="w-full">
                      <SelectValue placeholder="Choose a Worker">
                        {workerToConnect?.workerName}
                      </SelectValue>
                    </SelectTrigger>
                    <AppSelectContent>
                      {unconnectedWorkers.map((worker) => (
                        <AppSelectItem key={worker.workerTag} value={worker.workerTag}>
                          {worker.workerName}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </Select>
                </div>
                <VaultRepositoryRootInput
                  disabled={isSubmitting}
                  folderSuggestions={folderSuggestions}
                  onValueChange={onCreateRootDirectoryChange}
                  value={createRootDirectory}
                />
              </div>
            ) : (
              <>
                <Select value={selectedAccountId} onValueChange={onAccountChange}>
                  <SelectTrigger aria-label="Cloudflare account" className="w-full">
                    <SelectValue placeholder="Cloudflare account">
                      {selectedAccount?.accountName}
                    </SelectValue>
                  </SelectTrigger>
                  <AppSelectContent>
                    {sortedAccounts.map((account) => (
                      <AppSelectItem key={account.accountId} value={account.accountId}>
                        {account.accountName}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={mode === "existing" ? "default" : "outline"}
                    onClick={() => onModeChange("existing")}
                    disabled={isSubmitting}
                  >
                    Existing
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "create" ? "default" : "outline"}
                    onClick={() => onModeChange("create")}
                    disabled={isSubmitting}
                  >
                    Create
                  </Button>
                </div>
                {inventoryState === "partial" ? (
                  <div className="text-sm text-muted-foreground">
                    The Worker list may be incomplete. Verified Workers found so far are shown.
                  </div>
                ) : null}
                {mode === "existing" ? (
                  <div className="grid gap-3">
                    {workerGroups.length > 0 ? (
                      <div className="grid max-h-80 gap-3 overflow-y-auto">
                        {workerGroups.map((group) => (
                          <div key={group.rootDirectory} className="grid gap-1.5">
                            <div className="font-mono text-xs text-muted-foreground">
                              {group.rootDirectory}
                            </div>
                            {group.workers.map((worker) => (
                              <label
                                key={worker.workerTag}
                                className="flex min-w-0 items-center gap-2"
                              >
                                <Checkbox
                                  checked={selectedWorkerTags.includes(worker.workerTag)}
                                  disabled={isSubmitting}
                                  onCheckedChange={() => onWorkerToggle(worker.workerTag)}
                                />
                                <span className="truncate text-sm">{worker.workerName}</span>
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : selectedAccountId &&
                      inventoryState !== "partial" &&
                      unconnectedWorkers.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No available Workers were found.
                      </div>
                    ) : null}
                    {unconnectedWorkers.length > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSubmitting}
                        onClick={() => onModeChange("connect")}
                      >
                        Connect another Worker
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <Input
                      value={createWorkerName}
                      onChange={(event) => onCreateWorkerNameChange(event.target.value)}
                      disabled={isSubmitting}
                      placeholder="Worker name"
                    />
                    <VaultRepositoryRootInput
                      disabled={isSubmitting}
                      folderSuggestions={folderSuggestions}
                      onValueChange={onCreateRootDirectoryChange}
                      value={createRootDirectory}
                    />
                  </div>
                )}
              </>
            )}
            {error ? <div className="text-sm text-red-600">{error}</div> : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (mode === "connect") {
                onConnectWorkerBack();
              } else {
                onOpenChange(false);
              }
            }}
            disabled={isSubmitting}
          >
            {mode === "connect"
              ? "Back"
              : didAddWorker
                ? selectedWorkerTags.length > 0
                  ? "Close"
                  : "Done"
                : "Cancel"}
          </Button>
          {!isLoading ? (
            <Button onClick={onSubmit} disabled={submitDisabled}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {repairWorker
                ? "Configure Workers Builds"
                : mode === "connect"
                  ? "Connect and add"
                  : mode === "existing"
                    ? selectedWorkerTags.length === 0
                      ? "Add Workers"
                      : `Add ${selectedWorkerTags.length} Worker${selectedWorkerTags.length === 1 ? "" : "s"}`
                    : "Create Worker"}
            </Button>
          ) : null}
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}

function buildVaultPullRequestRoute(args: {
  repositoryFullName: string;
  branchName: string;
}): string | null {
  const repository = tryParseRepositoryFullName(args.repositoryFullName);
  if (repository === null) {
    return null;
  }

  const branchRoute = buildVaultFileRoute({
    owner: repository.owner,
    repoName: repository.name,
    branch: args.branchName,
  });
  return buildFileViewSearchHref({
    pathname: branchRoute,
    search: {},
    fileViewSearch: buildFileViewRouteSearch({ compare: true }),
  });
}

function VaultPullRequestHeaderControls({
  filterOptions,
  filters,
  onChangeFilters,
}: {
  filterOptions: VaultPullRequestFilterOption[];
  filters: VaultPullRequestFiltersState;
  onChangeFilters: (nextFilters: VaultPullRequestFiltersState) => void;
}) {
  return (
    <div className="flex w-full justify-end">
      <VaultPullRequestFiltersControl
        value={filters}
        options={filterOptions}
        onChange={onChangeFilters}
      />
    </div>
  );
}

export function VaultSourceSetupSection({
  sourceSetup,
}: {
  sourceSetup: Extract<VaultDashboardSourceSetup, { status: "failed" | "running" }>;
}) {
  const stepLabel = formatVaultSourceSetupStep(sourceSetup.step);

  return (
    <VaultSetupProgressSection
      status={sourceSetup.status}
      label={`Setup: ${stepLabel}`}
      message={
        sourceSetup.status === "failed"
          ? `Setup failed during ${stepLabel}: ${sourceSetup.message}`
          : undefined
      }
    />
  );
}

type VaultSetupProgressSectionStatus = "failed" | "running";

const CLOUDFLARE_WORKERS_AND_PAGES_GITHUB_APP_URL =
  "https://github.com/apps/cloudflare-workers-and-pages";
const CLOUDFLARE_GITHUB_APP_RECOVERY_URL =
  "https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app";
const CLOUDFLARE_GITHUB_APP_AUTHORIZATION_FAILURE_MESSAGE =
  "Cloudflare Workers and Pages GitHub App is not authorized";

function isCloudflareGitHubAppAuthorizationFailure(
  providerSetup: Extract<VaultDashboardProviderSetup, { status: "failed" | "running" }>,
): boolean {
  return (
    providerSetup.status === "failed" &&
    providerSetup.provider === "cloudflare" &&
    providerSetup.message.includes(CLOUDFLARE_GITHUB_APP_AUTHORIZATION_FAILURE_MESSAGE)
  );
}

function VaultCloudflareGitHubAppAuthorizationFailure({
  repositoryFullName,
}: {
  repositoryFullName: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-destructive">Cloudflare cannot access this GitHub repo.</div>
      <div className="text-muted-foreground">
        Use{" "}
        <a
          href={CLOUDFLARE_GITHUB_APP_RECOVERY_URL}
          target="_blank"
          rel="noreferrer noopener"
          className={linkStyle}
        >
          Cloudflare's recovery steps
        </a>
        : uninstall the{" "}
        <a
          href={CLOUDFLARE_WORKERS_AND_PAGES_GITHUB_APP_URL}
          target="_blank"
          rel="noreferrer noopener"
          className={linkStyle}
        >
          Cloudflare Workers and Pages GitHub App
        </a>{" "}
        first, then reconnect GitHub from Workers & Pages → Create application. Include{" "}
        {repositoryFullName}, then retry.
      </div>
    </div>
  );
}

export function VaultSetupProgressSection({
  children,
  label,
  message,
  status,
}: {
  children?: ReactNode;
  label: string;
  message?: ReactNode;
  status: VaultSetupProgressSectionStatus;
}) {
  return (
    <div className="space-y-2 text-xs">
      {status === "failed" ? (
        <div className="text-destructive">{message ?? label}</div>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground">
          <UpdateIcon className="h-3 w-3 shrink-0 animate-spin" />
          <span>{label}</span>
        </div>
      )}
      {children}
    </div>
  );
}

export function VaultProviderSetupSection({
  isRetrying,
  onRetry,
  providerSetup,
  repositoryFullName,
}: {
  isRetrying: boolean;
  onRetry: () => void;
  providerSetup: Extract<VaultDashboardProviderSetup, { status: "failed" | "running" }>;
  repositoryFullName: string;
}) {
  const setupStatus = resolveVaultProviderSetupStatus(providerSetup);
  if (!setupStatus) {
    return null;
  }
  const stepLabel = formatVaultProviderSetupStep(providerSetup.step);
  const failureMessage =
    setupStatus.status === "failed" && providerSetup.status === "failed" ? (
      isCloudflareGitHubAppAuthorizationFailure(providerSetup) ? (
        <VaultCloudflareGitHubAppAuthorizationFailure repositoryFullName={repositoryFullName} />
      ) : (
        `${setupStatus.message} Last failure: ${stepLabel}: ${providerSetup.message}`
      )
    ) : undefined;
  const canRetry = providerSetup.status === "failed";

  return (
    <VaultSetupProgressSection
      status={setupStatus.status}
      label={setupStatus.label}
      message={failureMessage}
    >
      {canRetry ? (
        <Button size="sm" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isRetrying ? "Retrying..." : "Retry"}
        </Button>
      ) : null}
    </VaultSetupProgressSection>
  );
}

function formatVaultDeletionStep(step: VaultDashboardDeletionStep): string {
  return step.replace(/_/g, " ");
}

export function VaultDeletionStatusSection({
  deletion,
  isRetrying,
  onRetry,
}: {
  deletion: Extract<VaultDashboardDeletion, { state: "deleting" | "delete_failed" }>;
  isRetrying: boolean;
  onRetry: (runId: Id<"workflow_vaultDeletion_runs">) => void;
}) {
  const stepLabel = formatVaultDeletionStep(deletion.currentStep);
  if (deletion.state === "deleting") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <UpdateIcon className="h-3 w-3 shrink-0 animate-spin" />
        <span>{deletion.message || `Deleting vault: ${stepLabel}`}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="min-w-0 flex-1 text-destructive [overflow-wrap:anywhere]">
        {deletion.message || deletion.lastError || `Delete failed during ${stepLabel}.`}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          onRetry(deletion.runId);
        }}
        disabled={isRetrying}
      >
        {isRetrying ? (
          <>
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            Retrying...
          </>
        ) : (
          <>
            <UpdateIcon className="mr-1 h-3.5 w-3.5" />
            Retry
          </>
        )}
      </Button>
    </div>
  );
}

export function VaultDeleteBlockedSection({ reason }: { reason: string }) {
  return <div className="text-xs text-muted-foreground">{reason}</div>;
}

type VaultDashboardViewProps = {
  deleteModeActive: boolean;
  developerToolsVisible: boolean;
  schemaGraphAccessEnabled: boolean;
  cloudflareObservations: VaultCloudflareProviderObservationState;
  cloudflareWorkerConfigurationActionInFlight: CloudflareWorkerConfigurationActionInFlight | null;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  isRemovingVault: boolean;
  providerAttachmentDetachmentInFlight: ProviderAttachmentDetachmentInFlight | null;
  pullRequests: VaultPullRequestsState;
  reconcilingConvexProjectId: Id<"vaultConvexProjects"> | null;
  retryingDeletionRunId: Id<"workflow_vaultDeletion_runs"> | null;
  retryingInfrastructureVaultId: Id<"vaults"> | null;
  viewModel: VaultDashboardViewModel;
  logoRouteSearch: LogoRouteSearch;
  replaceLogoRouteSearch: (nextSearch: LogoRouteSearch) => void;
  openDeveloperToolsByVaultId: Partial<Record<Id<"vaults">, boolean>>;
  persistedVaultPullRequestFiltersByVaultId: Map<string, VaultPullRequestFiltersState>;
  persistedVaultResourceLinksOpenByVaultId: Map<string, boolean>;
  rootRouteSearch: RootRouteSearch;
  onConfigureWorkersBuildsForGitHub: (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
    rootDirectory: string | undefined,
  ) => void;
  onChangeConvexProjectConfigPath: (
    vaultId: Id<"vaults">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
  onReconcileConvexProjectTeam: (
    vaultId: Id<"vaults">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
  onRotateConvexDeployKeysForWorkersBuilds: (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
  onOpenDeveloperToolsChange: (vaultId: Id<"vaults">, isOpen: boolean) => void;
  onDetachCloudflareWorker: (vaultId: Id<"vaults">, workerId: Id<"vaultCloudflareWorkers">) => void;
  onDetachConvexProject: (
    vaultId: Id<"vaults">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
  onRetryInfrastructureProvisioning: (vaultId: Id<"vaults">) => void;
  onRetryVaultDeletion: (runId: Id<"workflow_vaultDeletion_runs">) => void;
  onSaveVaultPullRequestFilters: (
    vaultId: Id<"vaults">,
    nextVaultPullRequestFilters: VaultPullRequestFiltersState,
  ) => void;
  onResourceLinksOpenChange: (vaultId: Id<"vaults">, resourceLinksOpen: boolean) => void;
};

function applyVaultDashboardProviderAddSearch({
  currentSearch,
  provider,
}: {
  currentSearch: RootRouteSearch;
  provider: "cloudflare" | "convex";
}): RootRouteSearch {
  return provider === "convex"
    ? applySearchPatch(currentSearch, {
        "add-convex": true,
        "add-cloudflare": null,
        delete: null,
      })
    : applySearchPatch(currentSearch, {
        "add-cloudflare": true,
        "add-convex": null,
        delete: null,
      });
}

function buildVaultDashboardProviderAddHref({
  dashboardRoutePathname,
  provider,
  rootRouteSearch,
}: {
  dashboardRoutePathname: string;
  provider: "cloudflare" | "convex";
  rootRouteSearch: RootRouteSearch;
}): string {
  return buildPathWithTanStackSearch({
    pathname: dashboardRoutePathname,
    search: applyVaultDashboardProviderAddSearch({
      currentSearch: rootRouteSearch,
      provider,
    }),
  });
}

export function VaultDashboardVaultList({
  presentation,
  selectedVaultId,
  vaults,
}: {
  presentation: "legacy" | "v2";
  selectedVaultId: Id<"vaults"> | null;
  vaults: readonly VaultDashboardVault[];
}) {
  return (
    <VaultDashboardSidebarContent>
      <nav aria-label="Vaults" className="p-2">
        <ul className="space-y-1">
          {vaults.map((vault) => {
            const isSelected = vault._id === selectedVaultId;

            return (
              <li key={vault._id}>
                <Link
                  resetScroll={isSelected ? false : undefined}
                  to={
                    presentation === "v2"
                      ? buildVaultDashboardRoute({
                          owner: vault.ghRepoOwner,
                          repoName: vault.ghRepoName,
                        })
                      : buildVaultOldDashboardRoute({
                          owner: vault.ghRepoOwner,
                          repoName: vault.ghRepoName,
                        })
                  }
                  search={(currentSearch) =>
                    applySearchPatch(currentSearch, {
                      "add-cloudflare": null,
                      "add-convex": null,
                      delete: null,
                    })
                  }
                  title={vault.repositoryFullName}
                  className={clsx(
                    "flex min-h-8 min-w-0 items-center px-2 py-1.5 text-sm leading-5 no-underline transition-colors hover:no-underline",
                    isSelected
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span className="truncate">{vault.repositoryFullName}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </VaultDashboardSidebarContent>
  );
}

function VaultDashboardVaultListHeader() {
  return (
    <div className="flex h-full items-center px-2 text-sm font-medium text-foreground">Vaults</div>
  );
}

export function VaultDashboardVaultPickerPane({
  vaults,
}: {
  vaults: readonly VaultDashboardVault[];
}) {
  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <div className="flex h-8 shrink-0 items-center border-b border-border">
        <VaultDashboardVaultListHeader />
      </div>
      <VaultDashboardVaultList presentation="legacy" selectedVaultId={null} vaults={vaults} />
    </div>
  );
}

export function VaultOverviewVaultPickerPane({
  sidebarSummaries,
  vaults,
}: {
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: readonly VaultDashboardVault[] | null;
}) {
  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <div className="flex h-8 shrink-0 items-center border-b border-border">
        <VaultDashboardVaultListHeader />
      </div>
      {vaults === null ? (
        <VaultOverviewSidebarLoading />
      ) : vaults.length === 0 ? (
        <VaultDashboardPaneMessage>No vaults</VaultDashboardPaneMessage>
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

export function VaultDashboardPaneMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-start p-4 text-sm text-muted-foreground">{children}</div>
  );
}

export function VaultDashboardView({
  deleteModeActive,
  developerToolsVisible,
  schemaGraphAccessEnabled,
  cloudflareObservations,
  cloudflareWorkerConfigurationActionInFlight,
  convexObservations,
  isRemovingVault,
  providerAttachmentDetachmentInFlight,
  pullRequests,
  reconcilingConvexProjectId,
  retryingDeletionRunId,
  retryingInfrastructureVaultId,
  viewModel,
  logoRouteSearch,
  replaceLogoRouteSearch,
  openDeveloperToolsByVaultId,
  persistedVaultPullRequestFiltersByVaultId,
  persistedVaultResourceLinksOpenByVaultId,
  rootRouteSearch,
  onConfigureWorkersBuildsForGitHub,
  onChangeConvexProjectConfigPath,
  onReconcileConvexProjectTeam,
  onRotateConvexDeployKeysForWorkersBuilds,
  onOpenDeveloperToolsChange,
  onDetachCloudflareWorker,
  onDetachConvexProject,
  onRetryInfrastructureProvisioning,
  onRetryVaultDeletion,
  onSaveVaultPullRequestFilters,
  onResourceLinksOpenChange,
}: VaultDashboardViewProps) {
  const navigate = useNavigate();
  const dashboardRoutePathname = useLocation({
    select: (location) => location.pathname,
  });
  const { vaults } = viewModel;
  const openProviderAddDialog = useCallback(
    ({ provider }: { provider: "cloudflare" | "convex" }) => {
      void navigate({
        resetScroll: false,
        to: ".",
        search: (currentSearch) =>
          applyVaultDashboardProviderAddSearch({
            currentSearch,
            provider,
          }),
        state: (currentState) => ({
          ...currentState,
          vaultDashboardDialog: provider === "convex" ? "add-convex" : "add-cloudflare",
        }),
      });
    },
    [navigate],
  );

  if (vaults.length === 0) {
    return (
      <VaultDashboardEmptyState
        logoRouteSearch={logoRouteSearch}
        replaceRouteSearch={replaceLogoRouteSearch}
      />
    );
  }

  return (
    <VaultDashboardRepositoryList>
      {vaults.map((vault) => {
        const deletion = vault.deletion;
        const isDeletingVault = deletion.state !== "not_deleting";
        const canObservePullRequests = vault.hasConnectedGitHubRepository && !isDeletingVault;
        const canManageProviderAttachments = vault.hasConnectedGitHubRepository && !isDeletingVault;
        const vaultPullRequestFilters =
          persistedVaultPullRequestFiltersByVaultId.get(vault._id) ??
          getDefaultVaultPullRequestFilters();
        const vaultResourceLinksOpen =
          persistedVaultResourceLinksOpenByVaultId.get(vault._id) ?? false;
        const settledPullRequests =
          pullRequests.state === "current" || pullRequests.state === "stale" ? pullRequests : null;
        const primaryBranch = vault.defaultBranch?.trim() || null;
        const githubRepositoryUrl = `https://github.com/${vault.ghRepoOwner}/${vault.ghRepoName}`;
        const developerToolsOpen =
          developerToolsVisible && (openDeveloperToolsByVaultId[vault._id] ?? false);
        const isCloudflareWorkerConfigurationActionInFlight =
          cloudflareWorkerConfigurationActionInFlight !== null;
        const resourceRailState = buildVaultDashboardResourceRailState({
          buildAddCloudflareWorkerHref: canManageProviderAttachments
            ? () =>
                buildVaultDashboardProviderAddHref({
                  dashboardRoutePathname,
                  provider: "cloudflare",
                  rootRouteSearch,
                })
            : undefined,
          addCloudflareWorkerOnClick: canManageProviderAttachments
            ? () => {
                openProviderAddDialog({ provider: "cloudflare" });
              }
            : undefined,
          buildAddConvexHref: canManageProviderAttachments
            ? () =>
                buildVaultDashboardProviderAddHref({
                  dashboardRoutePathname,
                  provider: "convex",
                  rootRouteSearch,
                })
            : undefined,
          addConvexOnClick: canManageProviderAttachments
            ? () => {
                openProviderAddDialog({ provider: "convex" });
              }
            : undefined,
          configureWorkersBuildsForGitHubOnClick: isCloudflareWorkerConfigurationActionInFlight
            ? undefined
            : (workerId, rootDirectory) => {
                onConfigureWorkersBuildsForGitHub(vault._id, workerId, rootDirectory);
              },
          changeConvexProjectConfigPathOnClick: (convexProjectId) => {
            onChangeConvexProjectConfigPath(vault._id, convexProjectId);
          },
          cloudflareObservations,
          convexObservations,
          githubRepositoryUrl,
          isConfiguringWorkersBuildsForGitHub: (workerId) =>
            cloudflareWorkerConfigurationActionInFlight?.kind ===
              "configure_workers_builds_for_github" &&
            cloudflareWorkerConfigurationActionInFlight.vaultId === vault._id &&
            cloudflareWorkerConfigurationActionInFlight.workerId === workerId,
          isDetachingCloudflareWorker: (workerId) =>
            providerAttachmentDetachmentInFlight?.provider === "cloudflare" &&
            providerAttachmentDetachmentInFlight.vaultId === vault._id &&
            providerAttachmentDetachmentInFlight.workerId === workerId,
          isDetachingConvexProject: (convexProjectId) =>
            providerAttachmentDetachmentInFlight?.provider === "convex" &&
            providerAttachmentDetachmentInFlight.vaultId === vault._id &&
            providerAttachmentDetachmentInFlight.convexProjectId === convexProjectId,
          isReconcilingConvexProjectTeam: (convexProjectId) =>
            reconcilingConvexProjectId === convexProjectId,
          isRotatingConvexDeployKeysForWorkersBuilds: (workerId, convexProjectId) =>
            cloudflareWorkerConfigurationActionInFlight?.kind ===
              "rotate_convex_deploy_keys_for_workers_builds" &&
            cloudflareWorkerConfigurationActionInFlight.vaultId === vault._id &&
            cloudflareWorkerConfigurationActionInFlight.workerId === workerId &&
            cloudflareWorkerConfigurationActionInFlight.convexProjectId === convexProjectId,
          vault,
          detachCloudflareWorkerOnClick: providerAttachmentDetachmentInFlight
            ? undefined
            : (workerId) => {
                onDetachCloudflareWorker(vault._id, workerId);
              },
          detachConvexProjectOnClick: providerAttachmentDetachmentInFlight
            ? undefined
            : (convexProjectId) => {
                onDetachConvexProject(vault._id, convexProjectId);
              },
          reconcileConvexProjectTeamOnClick: reconcilingConvexProjectId
            ? undefined
            : (convexProjectId) => {
                onReconcileConvexProjectTeam(vault._id, convexProjectId);
              },
          rotateConvexDeployKeysForWorkersBuildsOnClick:
            isCloudflareWorkerConfigurationActionInFlight
              ? undefined
              : (workerId, convexProjectId) => {
                  onRotateConvexDeployKeysForWorkersBuilds(vault._id, workerId, convexProjectId);
                },
        });
        const productionRoots = buildVaultProductionRoots({
          cloudflareObservations,
          convexObservations,
          vault,
        });
        const pullRequestFilterOptions = buildVaultPullRequestFilterOptions({
          pullRequests: settledPullRequests?.allPullRequests ?? [],
          hiddenLabels: vaultPullRequestFilters.hiddenLabels,
          includeNoLabel: vaultPullRequestFilters.includeNoLabel,
        });
        const activeSourceSetup =
          vault.sourceSetup.status === "failed" || vault.sourceSetup.status === "running"
            ? vault.sourceSetup
            : null;
        const activeProviderSetup =
          vault.providerSetup.status === "failed" || vault.providerSetup.status === "running"
            ? vault.providerSetup
            : null;
        const hasProvisioningLog =
          Boolean(activeSourceSetup || activeProviderSetup) || vault.isSamebaseManaged;
        const sourceSetupSection =
          !isDeletingVault && activeSourceSetup ? (
            <VaultSourceSetupSection sourceSetup={activeSourceSetup} />
          ) : undefined;
        const providerSetupStatus = vault.hasConnectedGitHubRepository
          ? resolveVaultProviderSetupStatus(vault.providerSetup)
          : null;
        const providerSetupSection =
          providerSetupStatus && activeProviderSetup ? (
            <VaultProviderSetupSection
              isRetrying={retryingInfrastructureVaultId === vault._id}
              onRetry={() => onRetryInfrastructureProvisioning(vault._id)}
              providerSetup={activeProviderSetup}
              repositoryFullName={vault.repositoryFullName}
            />
          ) : undefined;
        const deleteBlockedSection =
          !isDeletingVault && deleteModeActive && deletion.deleteAction.state === "disabled" ? (
            <VaultDeleteBlockedSection reason={deletion.deleteAction.reason} />
          ) : undefined;
        const deletionSection =
          deletion.state === "deleting" || deletion.state === "delete_failed" ? (
            <VaultDeletionStatusSection
              deletion={deletion}
              isRetrying={retryingDeletionRunId === deletion.runId}
              onRetry={onRetryVaultDeletion}
            />
          ) : undefined;
        const setupSection =
          deletionSection ?? deleteBlockedSection ?? sourceSetupSection ?? providerSetupSection;
        const pullRequestSection = canObservePullRequests ? (
          <VaultPullRequestList
            buildSamebaseUrl={(branchName) =>
              buildVaultPullRequestRoute({
                repositoryFullName: vault.repositoryFullName,
                branchName,
              })
            }
            pullRequests={pullRequests}
          />
        ) : undefined;
        const defaultBranchSection =
          primaryBranch && !isDeletingVault ? (
            <VaultDefaultBranch
              convexProjects={vault.convexProjects}
              defaultBranch={primaryBranch}
              defaultBranchObservation={settledPullRequests?.defaultBranch ?? null}
              githubBranchUrl={buildGitHubBranchTreeUrl({
                repositoryFullName: vault.repositoryFullName,
                branchName: primaryBranch,
              })}
              githubRepositoryUrl={githubRepositoryUrl}
              owner={vault.ghRepoOwner}
              productionRoots={productionRoots}
              repoName={vault.ghRepoName}
              samebaseEditorUrl={buildVaultFileRoute({
                owner: vault.ghRepoOwner,
                repoName: vault.ghRepoName,
                branch: primaryBranch,
              })}
              schemaGraphAccessEnabled={schemaGraphAccessEnabled}
            />
          ) : undefined;
        const primarySection =
          defaultBranchSection || pullRequestSection ? (
            <>
              {defaultBranchSection}
              {pullRequestSection}
            </>
          ) : undefined;

        return (
          <div key={vault._id} data-vault-dashboard-repository-card="">
            <VaultDashboardRepositoryCard
              muted={!canObservePullRequests}
              repositoryName={vault.ghRepoName}
              repositoryLinks={
                isDeletingVault ? undefined : <VaultResourceRail state={resourceRailState} />
              }
              repositoryLinksOpen={vaultResourceLinksOpen}
              titleSuffix={
                deletion.state === "deleting" ? (
                  <>
                    <UpdateIcon className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">
                      (deleting...)
                    </span>
                  </>
                ) : deletion.state === "delete_failed" ? (
                  <span className="shrink-0 text-xs font-normal text-destructive">
                    (delete failed)
                  </span>
                ) : vault.sourceSetup.status === "failed" ? (
                  <span className="shrink-0 text-xs font-normal text-destructive">
                    (setup failed)
                  </span>
                ) : !vault.hasConnectedGitHubRepository ? (
                  <>
                    <UpdateIcon className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">
                      (setting up...)
                    </span>
                  </>
                ) : undefined
              }
              setupSection={setupSection}
              topRightAction={
                deletion.state === "not_deleting" ? (
                  <VaultDashboardDeleteControl
                    repositoryFullName={vault.repositoryFullName}
                    deleteAction={deletion.deleteAction}
                    isRemovingVault={isRemovingVault}
                  />
                ) : undefined
              }
              headerControls={
                canObservePullRequests ? (
                  <VaultPullRequestHeaderControls
                    filterOptions={pullRequestFilterOptions}
                    filters={vaultPullRequestFilters}
                    onChangeFilters={(nextVaultPullRequestFilters) => {
                      onSaveVaultPullRequestFilters(vault._id, nextVaultPullRequestFilters);
                    }}
                  />
                ) : undefined
              }
              primarySection={primarySection}
              developerToolsSection={
                hasProvisioningLog
                  ? {
                      open: developerToolsOpen,
                      visible: developerToolsVisible,
                      onOpenChange: (isOpen: boolean) => {
                        onOpenDeveloperToolsChange(vault._id, isOpen);
                      },
                      content: (
                        <div className="space-y-2">
                          {activeProviderSetup ? (
                            <div className="text-xs text-muted-foreground">
                              {formatProviderSetupDeveloperLabel(activeProviderSetup)}
                            </div>
                          ) : null}
                          <VaultProvisioningLog
                            repositoryFullName={vault.repositoryFullName}
                            vaultId={vault._id}
                          />
                        </div>
                      ),
                    }
                  : undefined
              }
              onRepositoryLinksOpenChange={(nextOpen) => {
                onResourceLinksOpenChange(vault._id, nextOpen);
              }}
            />
          </div>
        );
      })}
      <VaultDashboardScrollTargetEndPadding />
    </VaultDashboardRepositoryList>
  );
}

export function VaultDashboard({
  page = "overview",
  presentation = "legacy",
  selectedRepositoryFullName,
}: VaultDashboardProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const vaultDashboardDialogHistoryEntry = useLocation({
    select: (location) => location.state.vaultDashboardDialog,
  });
  const dashboardRoutePathname = useLocation({
    select: (location) => location.pathname,
  });
  const rootRouteSearch = useRootRouteSearch();
  const developerToolsVisible = rootRouteSearch[DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM] === true;
  const { commands: workspaceCommands, model: workspaceModel } = useVaultWorkspaceModel(
    selectedRepositoryFullName,
    presentation === "v2",
  );
  const vaults = workspaceModel.state === "ready" ? workspaceModel.vaults : undefined;
  const selectedWorkspace =
    workspaceModel.state === "ready" && workspaceModel.selection.state === "selected"
      ? workspaceModel.selection.workspace
      : null;
  const selectedVault = selectedWorkspace?.vault ?? null;
  const deleteVault = useAction(api.vault.actions.deleteVault);
  const retryDeleteVault = useAction(api.vault.actions.retryDeleteVault);
  const retryInfrastructureProvisioning = useAction(
    api.vault.actions.retryInfrastructureProvisioning,
  );
  const commitStaging = useAction(api.fileStagingActions.commitStaging);
  const discoverConvexProjects = useAction(api.vault.convex.discoverProjects);
  const attachConvexProjects = useAction(api.vault.convex.attachProjects);
  const changeConvexProjectCodeLocation = useAction(api.vault.convex.changeProjectCodeLocation);
  const createConvexProject = useAction(api.vault.convex.createProject);
  const reconcileConvexProjectTeam = useAction(api.vault.convex.reconcileProjectTeam);
  const listCloudflareAccounts = useAction(api.vault.cloudflare.listAccounts);
  const discoverCloudflareWorkers = useAction(api.vault.cloudflare.discoverWorkers);
  const attachCloudflareWorkers = useAction(api.vault.cloudflare.attachWorkers);
  const connectCloudflareWorker = useAction(api.vault.cloudflare.connectWorker);
  const createCloudflareWorker = useAction(api.vault.cloudflare.createWorker);
  const detachCloudflareWorker = useAction(api.vault.cloudflare.detachWorker);
  const detachConvexProject = useAction(api.vault.convex.detachProject);
  const configureWorkersBuildsForGitHub = useAction(
    api.vault.cloudflare.configureWorkersBuildsForGitHub,
  );
  const rotateConvexDeployKeysForWorkersBuilds = useAction(
    api.vault.cloudflare.rotateConvexDeployKeysForWorkersBuilds,
  );
  const [
    cloudflareWorkerConfigurationActionInFlight,
    setCloudflareWorkerConfigurationActionInFlight,
  ] = useState<CloudflareWorkerConfigurationActionInFlight | null>(null);
  const [retryingInfrastructureVaultId, setRetryingInfrastructureVaultId] =
    useState<Id<"vaults"> | null>(null);
  const [providerAttachmentDetachmentInFlight, setProviderAttachmentDetachmentInFlight] =
    useState<ProviderAttachmentDetachmentInFlight | null>(null);
  const [convexCodeLocationRepairTarget, setConvexCodeLocationRepairTarget] =
    useState<ConvexCodeLocationRepairTarget | null>(null);
  const [cloudflareBuildsRepairTarget, setCloudflareBuildsRepairTarget] =
    useState<CloudflareBuildsRepairTarget | null>(null);
  const [reconcilingConvexProjectId, setReconcilingConvexProjectId] =
    useState<Id<"vaultConvexProjects"> | null>(null);
  const userVaultPullRequestFilters = useConvexQuery(
    api.vault.dashboard.getUserVaultPullRequestFilters,
  );
  const selectedVaultPullRequestFilters = useMemo(() => {
    const savedFilters = userVaultPullRequestFilters?.find(
      (filters) => filters.vaultId === selectedVault?._id,
    );
    return savedFilters
      ? normalizeVaultPullRequestFilters(savedFilters)
      : getDefaultVaultPullRequestFilters();
  }, [selectedVault?._id, userVaultPullRequestFilters]);
  const pullRequests = useVaultPullRequests({
    vault:
      selectedVault?.hasConnectedGitHubRepository && selectedVault.deletion.state === "not_deleting"
        ? selectedVault
        : null,
    filters: selectedVaultPullRequestFilters,
    now,
  });
  const userVaultResourceLinksState = useConvexQuery(
    api.vault.dashboard.getUserVaultResourceLinksState,
  );
  const schemaGraphAccessEnabled =
    selectedWorkspace?.access.state === "ready" && selectedWorkspace.access.schemaGraphEnabled;
  const cloudflareConnection =
    selectedWorkspace?.cloudflareConnection.state === "ready"
      ? selectedWorkspace.cloudflareConnection.connection
      : undefined;
  const connectedCloudflareConnection =
    cloudflareConnection?.connected === true ? cloudflareConnection : null;
  const deleteModeActive = rootRouteSearch.delete === true;
  const addConvexModeActive = rootRouteSearch["add-convex"] === true;
  const addCloudflareWorkerModeActive = rootRouteSearch["add-cloudflare"] === true;
  const setVaultPullRequestFilters = useMutation(
    api.vault.dashboard.setVaultPullRequestFilters,
  ).withOptimisticUpdate((localStore, args) => {
    const currentFilters = localStore.getQuery(
      api.vault.dashboard.getUserVaultPullRequestFilters,
      {},
    );
    if (!currentFilters) {
      return;
    }

    const normalizedFilters = normalizeVaultPullRequestFilters(args);
    const nextFilters = currentFilters.filter(
      (vaultPullRequestFilter) => vaultPullRequestFilter.vaultId !== args.vaultId,
    );
    const shouldPersist =
      normalizedFilters.hiddenLabels.length > 0 ||
      normalizedFilters.includeDrafts ||
      !normalizedFilters.includeNoLabel;

    if (shouldPersist) {
      nextFilters.push({
        vaultId: args.vaultId,
        hiddenLabels: normalizedFilters.hiddenLabels,
        includeDrafts: normalizedFilters.includeDrafts,
        includeNoLabel: normalizedFilters.includeNoLabel,
      });
    }

    localStore.setQuery(api.vault.dashboard.getUserVaultPullRequestFilters, {}, nextFilters);
  });
  const setVaultResourceLinksOpen = useMutation(
    api.vault.dashboard.setVaultResourceLinksOpen,
  ).withOptimisticUpdate((localStore, args) => {
    const currentState = localStore.getQuery(
      api.vault.dashboard.getUserVaultResourceLinksState,
      {},
    );
    if (!currentState) {
      return;
    }

    const nextState = currentState.filter((state) => state.vaultId !== args.vaultId);
    nextState.push({
      resourceLinksOpen: args.resourceLinksOpen,
      vaultId: args.vaultId,
    });

    localStore.setQuery(api.vault.dashboard.getUserVaultResourceLinksState, {}, nextState);
  });
  const preparedDeleteRepositoryRef = useRef<string | null>(null);
  const preparedAddConvexRepositoryRef = useRef<string | null>(null);
  const preparedAddCloudflareWorkerRepositoryRef = useRef<string | null>(null);
  const convexDialogResourcesRequestIdRef = useRef(0);
  const cloudflareWorkersRequestIdRef = useRef(0);
  const cloudflareDialogResourcesRequestIdRef = useRef(0);
  const dashboardLocalStore = useVaultDashboardLocalStore();
  const {
    cloudflareConnectDialog,
    commitError,
    convexConnectDialog,
    deleteError,
    didAttemptCommit,
    isCommitting,
    isDeleting,
    openDeveloperToolsByVaultId,
    removeConvexProvision,
    removeGithubRepo,
    removeCloudflareProvision,
    retryingDeletionRunId,
  } = useSelector(dashboardLocalStore);
  const {
    accounts: cloudflareAccounts,
    connectMode: cloudflareConnectMode,
    createRootDirectory: cloudflareCreateRootDirectory,
    createWorkerName: cloudflareCreateWorkerName,
    didAddWorker: didAddCloudflareWorker,
    error: cloudflareDialogError,
    inventoryState: cloudflareInventoryState,
    isLoadingResources: isLoadingCloudflareResources,
    isSubmittingWorker: isSubmittingCloudflareWorker,
    selectedAccountId: selectedCloudflareAccountId,
    selectedWorkerTags: selectedCloudflareWorkerTags,
    workerToConnect: cloudflareWorkerToConnect,
    workers: cloudflareWorkers,
  } = cloudflareConnectDialog;
  const {
    codeLocations: convexCodeLocations,
    connectMode: convexConnectMode,
    createCodeLocationKey: convexCreateCodeLocationKey,
    createProjectName: convexCreateProjectName,
    projects: convexProjects,
    error: convexDialogError,
    isLoadingResources: isLoadingConvexResources,
    isSubmittingProject: isSubmittingConvexProject,
    selectedProjectCodeLocationKeys: selectedConvexProjectCodeLocationKeys,
    sourceCompleteness: convexSourceCompleteness,
  } = convexConnectDialog;
  const {
    markCommitAttempted,
    markCloudflareConnectDialogWorkerAdded,
    prepareDeleteDialog,
    resetCloudflareConnectDialogState,
    resetConvexConnectDialogState,
    resetDeleteDialogState,
    setCloudflareConnectDialogAccounts,
    setCloudflareConnectDialogConnectMode,
    setCloudflareConnectDialogCreateRootDirectory,
    setCloudflareConnectDialogCreateWorkerName,
    setCloudflareConnectDialogError,
    setCloudflareConnectDialogInventoryState,
    setCloudflareConnectDialogLoading,
    setCloudflareConnectDialogSelectedAccountId,
    setCloudflareConnectDialogSubmitting,
    setCloudflareConnectDialogWorkers,
    setCloudflareConnectDialogWorkerToConnect,
    toggleCloudflareConnectDialogWorker,
    setCommitError,
    setConvexConnectDialogConnectMode,
    setConvexConnectDialogCodeLocations,
    setConvexConnectDialogCreateCodeLocationKey,
    setConvexConnectDialogCreateProjectName,
    setConvexConnectDialogProjects,
    setConvexConnectDialogError,
    setConvexConnectDialogLoading,
    setConvexConnectDialogProjectCodeLocationKey,
    setConvexConnectDialogSubmitting,
    setConvexConnectDialogSourceCompleteness,
    setDeleteError,
    setDeleteOption,
    setDeveloperToolsOpen,
    setIsCommitting,
    setIsDeleting,
    setRetryingDeletionRunId,
    toggleConvexConnectDialogProject,
  } = dashboardLocalStore.actions;

  const deleteDialogVault = deleteModeActive ? selectedVault : null;
  const canOpenDeleteDialog =
    deleteDialogVault?.deletion.state === "not_deleting" &&
    deleteDialogVault.deletion.deleteAction.state === "available";
  const vaultToDelete =
    deleteDialogVault && canOpenDeleteDialog ? buildVaultDeleteIntent(deleteDialogVault) : null;
  const addConvexDialogVault = addConvexModeActive ? selectedVault : null;
  const vaultToConnectConvex = useMemo(() => {
    if (
      !addConvexDialogVault?.hasConnectedGitHubRepository ||
      addConvexDialogVault.deletion.state !== "not_deleting"
    ) {
      return null;
    }

    return {
      id: addConvexDialogVault._id,
      repositoryFullName: addConvexDialogVault.repositoryFullName,
      repositoryName: addConvexDialogVault.ghRepoName,
    };
  }, [addConvexDialogVault]);
  const convexCodeLocationRepairProject =
    vaultToConnectConvex && convexCodeLocationRepairTarget?.vaultId === vaultToConnectConvex.id
      ? (addConvexDialogVault?.convexProjects.find(
          (project) => project.convexProjectId === convexCodeLocationRepairTarget.convexProjectId,
        ) ?? null)
      : null;
  const unattachedConvexProjects = useMemo(() => {
    const attachedProjectIds = new Set(
      addConvexDialogVault?.convexProjects.map((project) => project.projectId) ?? [],
    );
    return convexProjects.filter((project) => !attachedProjectIds.has(project.projectId));
  }, [addConvexDialogVault?.convexProjects, convexProjects]);
  const addCloudflareWorkerDialogVault = addCloudflareWorkerModeActive ? selectedVault : null;
  const vaultToConnectCloudflare = useMemo(() => {
    if (
      !addCloudflareWorkerDialogVault?.hasConnectedGitHubRepository ||
      addCloudflareWorkerDialogVault.deletion.state !== "not_deleting"
    ) {
      return null;
    }

    return {
      id: addCloudflareWorkerDialogVault._id,
      repositoryFullName: addCloudflareWorkerDialogVault.repositoryFullName,
      repositoryName: addCloudflareWorkerDialogVault.ghRepoName,
    };
  }, [addCloudflareWorkerDialogVault]);
  const cloudflareRepositoryFolderSuggestions = useConvexQuery(
    api.vault.dashboard.listVaultRepositoryFolderSuggestions,
    vaultToConnectCloudflare ? { vaultId: vaultToConnectCloudflare.id } : "skip",
  );
  const cloudflareBuildsRepairWorker =
    vaultToConnectCloudflare &&
    cloudflareBuildsRepairTarget?.vaultId === vaultToConnectCloudflare.id
      ? (addCloudflareWorkerDialogVault?.cloudflareWorkers.find(
          (worker) => worker.workerId === cloudflareBuildsRepairTarget.workerId,
        ) ?? null)
      : null;
  const stagedChangesCount = deleteDialogVault?.fileCount ?? 0;

  const replaceVaultDashboardDialogRoute = useCallback(
    (dialog: VaultDashboardQueryDialog) => {
      void navigate({
        replace: true,
        resetScroll: false,
        search: (currentSearch) => clearVaultDashboardQueryDialogSearch(currentSearch, dialog),
        state: (currentState) => ({
          ...currentState,
          vaultDashboardDialog: undefined,
        }),
        to: ".",
      });
    },
    [navigate],
  );

  const closeVaultDashboardDialog = (dialog: VaultDashboardQueryDialog) => {
    if (vaultDashboardDialogHistoryEntry === dialog && router.history.canGoBack()) {
      router.history.back();
      return;
    }

    replaceVaultDashboardDialogRoute(dialog);
  };

  const closeDeletedVaultRoute = useCallback(() => {
    void navigate({
      replace: true,
      search: (currentSearch) =>
        applySearchPatch(currentSearch, {
          "add-cloudflare": null,
          "add-convex": null,
          delete: null,
        }),
      state: (currentState) => ({
        ...currentState,
        vaultDashboardDialog: undefined,
      }),
      to: presentation === "legacy" ? "/vaultold" : "/vault",
    });
  }, [navigate, presentation]);

  const loadConvexDialogResources = useCallback(
    async (vaultId: Id<"vaults">) => {
      const requestId = convexDialogResourcesRequestIdRef.current + 1;
      convexDialogResourcesRequestIdRef.current = requestId;
      setConvexConnectDialogLoading(true);
      setConvexConnectDialogError(null);
      try {
        const discovery = await discoverConvexProjects({ vaultId });
        if (convexDialogResourcesRequestIdRef.current !== requestId) {
          return;
        }
        setConvexConnectDialogCodeLocations(discovery.source.locations);
        setConvexConnectDialogProjects(discovery.projects);
        setConvexConnectDialogSourceCompleteness(discovery.source.completeness);
      } catch (error) {
        if (convexDialogResourcesRequestIdRef.current !== requestId) {
          return;
        }
        setConvexConnectDialogError(
          error instanceof Error ? error.message : "Could not discover Convex projects.",
        );
      } finally {
        if (convexDialogResourcesRequestIdRef.current === requestId) {
          setConvexConnectDialogLoading(false);
        }
      }
    },
    [
      discoverConvexProjects,
      setConvexConnectDialogCodeLocations,
      setConvexConnectDialogError,
      setConvexConnectDialogLoading,
      setConvexConnectDialogProjects,
      setConvexConnectDialogSourceCompleteness,
    ],
  );

  const resetConvexDialogState = useCallback(() => {
    convexDialogResourcesRequestIdRef.current += 1;
    resetConvexConnectDialogState();
  }, [resetConvexConnectDialogState]);

  const loadCloudflareWorkersForAccount = useCallback(
    async (args: { accountId: string; vaultId: Id<"vaults"> }) => {
      const requestId = cloudflareWorkersRequestIdRef.current + 1;
      cloudflareWorkersRequestIdRef.current = requestId;
      setCloudflareConnectDialogLoading(true);
      setCloudflareConnectDialogWorkers([]);
      try {
        const discovery = await discoverCloudflareWorkers({
          accountId: args.accountId,
          vaultId: args.vaultId,
        });
        if (cloudflareWorkersRequestIdRef.current !== requestId) {
          return;
        }
        const attachedWorkerTags = new Set(
          (addCloudflareWorkerDialogVault?.cloudflareWorkers ?? [])
            .filter((worker) => worker.accountId === args.accountId)
            .map((worker) => worker.workerTag),
        );
        setCloudflareConnectDialogWorkers(
          discovery.workers.filter((worker) => !attachedWorkerTags.has(worker.workerTag)),
        );
        setCloudflareConnectDialogInventoryState(discovery.inventoryState);
      } catch (error) {
        if (cloudflareWorkersRequestIdRef.current !== requestId) {
          return;
        }
        setCloudflareConnectDialogError(
          error instanceof Error ? error.message : "Could not discover Cloudflare Workers.",
        );
      } finally {
        if (cloudflareWorkersRequestIdRef.current === requestId) {
          setCloudflareConnectDialogLoading(false);
        }
      }
    },
    [
      addCloudflareWorkerDialogVault?.cloudflareWorkers,
      discoverCloudflareWorkers,
      setCloudflareConnectDialogError,
      setCloudflareConnectDialogLoading,
      setCloudflareConnectDialogInventoryState,
      setCloudflareConnectDialogWorkers,
    ],
  );

  const loadCloudflareDialogResources = useCallback(
    async (args: { preferredAccountId: string | undefined; vaultId: Id<"vaults"> }) => {
      const requestId = cloudflareDialogResourcesRequestIdRef.current + 1;
      cloudflareDialogResourcesRequestIdRef.current = requestId;
      setCloudflareConnectDialogLoading(true);
      setCloudflareConnectDialogError(null);
      try {
        const accounts = await listCloudflareAccounts({});
        if (cloudflareDialogResourcesRequestIdRef.current !== requestId) {
          return;
        }
        setCloudflareConnectDialogAccounts(accounts);
        if (accounts.length === 0) {
          setCloudflareConnectDialogSelectedAccountId("");
          setCloudflareConnectDialogWorkers([]);
          setCloudflareConnectDialogError("No Cloudflare accounts are available.");
          return;
        }

        const selectedAccount =
          accounts.find((account) => account.accountId === args.preferredAccountId) ?? accounts[0];
        setCloudflareConnectDialogSelectedAccountId(selectedAccount.accountId);
        if (cloudflareDialogResourcesRequestIdRef.current !== requestId) {
          return;
        }
        await loadCloudflareWorkersForAccount({
          accountId: selectedAccount.accountId,
          vaultId: args.vaultId,
        });
      } catch (error) {
        if (cloudflareDialogResourcesRequestIdRef.current !== requestId) {
          return;
        }
        setCloudflareConnectDialogError(
          error instanceof Error ? error.message : "Could not load Cloudflare resources.",
        );
      } finally {
        if (cloudflareDialogResourcesRequestIdRef.current === requestId) {
          setCloudflareConnectDialogLoading(false);
        }
      }
    },
    [
      listCloudflareAccounts,
      loadCloudflareWorkersForAccount,
      setCloudflareConnectDialogAccounts,
      setCloudflareConnectDialogError,
      setCloudflareConnectDialogLoading,
      setCloudflareConnectDialogSelectedAccountId,
      setCloudflareConnectDialogWorkers,
    ],
  );

  const resetCloudflareDialogState = useCallback(() => {
    cloudflareWorkersRequestIdRef.current += 1;
    cloudflareDialogResourcesRequestIdRef.current += 1;
    resetCloudflareConnectDialogState();
  }, [resetCloudflareConnectDialogState]);

  useEffect(() => {
    if (!vaultToDelete) {
      if (preparedDeleteRepositoryRef.current) {
        preparedDeleteRepositoryRef.current = null;
        resetDeleteDialogState();
      }
      if (deleteModeActive && vaults && !deleteDialogVault) {
        replaceVaultDashboardDialogRoute("delete");
      }
      return;
    }

    if (preparedDeleteRepositoryRef.current === vaultToDelete.repositoryFullName) {
      return;
    }

    prepareDeleteDialog();
    preparedDeleteRepositoryRef.current = vaultToDelete.repositoryFullName;
  }, [
    deleteDialogVault,
    deleteModeActive,
    prepareDeleteDialog,
    replaceVaultDashboardDialogRoute,
    resetDeleteDialogState,
    vaultToDelete,
    vaults,
  ]);

  useEffect(() => {
    if (!vaultToConnectConvex) {
      setConvexCodeLocationRepairTarget(null);
      if (preparedAddConvexRepositoryRef.current) {
        preparedAddConvexRepositoryRef.current = null;
        resetConvexDialogState();
      }
      if (addConvexModeActive && vaults) {
        replaceVaultDashboardDialogRoute("add-convex");
      }
      return;
    }

    if (preparedAddConvexRepositoryRef.current === vaultToConnectConvex.repositoryFullName) {
      return;
    }

    preparedAddConvexRepositoryRef.current = vaultToConnectConvex.repositoryFullName;
    setConvexConnectDialogCreateProjectName(
      buildDefaultAppResourceName({
        repositoryName: vaultToConnectConvex.repositoryName,
        provider: "convex",
      }),
    );
    void loadConvexDialogResources(vaultToConnectConvex.id);
  }, [
    addConvexModeActive,
    loadConvexDialogResources,
    replaceVaultDashboardDialogRoute,
    resetConvexDialogState,
    setConvexConnectDialogCreateProjectName,
    vaultToConnectConvex,
    vaults,
  ]);

  useEffect(() => {
    if (!vaultToConnectCloudflare) {
      setCloudflareBuildsRepairTarget(null);
      if (preparedAddCloudflareWorkerRepositoryRef.current) {
        preparedAddCloudflareWorkerRepositoryRef.current = null;
        resetCloudflareDialogState();
      }
      if (addCloudflareWorkerModeActive && vaults) {
        replaceVaultDashboardDialogRoute("add-cloudflare");
      }
      return;
    }

    if (cloudflareBuildsRepairWorker) {
      preparedAddCloudflareWorkerRepositoryRef.current =
        vaultToConnectCloudflare.repositoryFullName;
      setCloudflareConnectDialogError(null);
      setCloudflareConnectDialogLoading(false);
      return;
    }

    if (
      preparedAddCloudflareWorkerRepositoryRef.current ===
      vaultToConnectCloudflare.repositoryFullName
    ) {
      return;
    }

    preparedAddCloudflareWorkerRepositoryRef.current = vaultToConnectCloudflare.repositoryFullName;
    setCloudflareConnectDialogCreateWorkerName(
      buildDefaultAppResourceName({
        repositoryName: vaultToConnectCloudflare.repositoryName,
        provider: "cloudflare",
      }),
    );
    void loadCloudflareDialogResources({
      preferredAccountId: connectedCloudflareConnection?.accountId,
      vaultId: vaultToConnectCloudflare.id,
    });
  }, [
    addCloudflareWorkerModeActive,
    cloudflareBuildsRepairWorker,
    connectedCloudflareConnection?.accountId,
    loadCloudflareDialogResources,
    replaceVaultDashboardDialogRoute,
    resetCloudflareDialogState,
    setCloudflareConnectDialogError,
    setCloudflareConnectDialogCreateWorkerName,
    setCloudflareConnectDialogLoading,
    vaultToConnectCloudflare,
    vaults,
  ]);

  const handleCloudflareAccountChange = (accountId: string) => {
    if (!vaultToConnectCloudflare) {
      return;
    }
    setCloudflareConnectDialogSelectedAccountId(accountId);
    setCloudflareConnectDialogError(null);
    void loadCloudflareWorkersForAccount({
      accountId,
      vaultId: vaultToConnectCloudflare.id,
    });
  };

  const handleConnectCloudflareDialogOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      return;
    }
    closeVaultDashboardDialog("add-cloudflare");
  };

  const handleConnectConvexDialogOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      return;
    }
    closeVaultDashboardDialog("add-convex");
  };

  const handleSubmitConvexProject = async () => {
    if (!vaultToConnectConvex || isSubmittingConvexProject) {
      return;
    }
    setConvexConnectDialogError(null);
    setConvexConnectDialogSubmitting(true);
    try {
      const codeLocationsByKey = new Map(
        convexCodeLocations.map((location) => [getConvexCodeLocationOptionKey(location), location]),
      );
      if (convexCodeLocationRepairProject) {
        const codeLocation = codeLocationsByKey.get(convexCreateCodeLocationKey);
        if (!codeLocation) {
          throw new Error("Choose a discovered Convex code location.");
        }
        await changeConvexProjectCodeLocation({
          vaultId: vaultToConnectConvex.id,
          convexProjectId: convexCodeLocationRepairProject.convexProjectId,
          codeLocation: getConvexCodeLocationSelection(codeLocation),
        });
      } else if (convexConnectMode === "existing") {
        const projects = Object.entries(selectedConvexProjectCodeLocationKeys).map(
          ([projectId, codeLocationKey]) => {
            if (!codeLocationKey) {
              throw new Error("Choose a discovered Convex code location for every project.");
            }
            const codeLocation = codeLocationsByKey.get(codeLocationKey);
            if (!codeLocation) {
              throw new Error("Choose a discovered Convex code location for every project.");
            }
            return {
              codeLocation: getConvexCodeLocationSelection(codeLocation),
              projectId,
            };
          },
        );
        if (projects.length === 0) {
          throw new Error("Choose at least one Convex project.");
        }
        await attachConvexProjects({
          vaultId: vaultToConnectConvex.id,
          projects,
        });
      } else {
        const codeLocation = codeLocationsByKey.get(convexCreateCodeLocationKey);
        if (!codeLocation) {
          throw new Error("Choose a discovered Convex code location.");
        }
        await createConvexProject({
          vaultId: vaultToConnectConvex.id,
          projectName: convexCreateProjectName,
          codeLocation: getConvexCodeLocationSelection(codeLocation),
        });
      }
      void workspaceCommands.invalidateProviderObservations();
      setConvexCodeLocationRepairTarget(null);
      resetConvexDialogState();
      closeVaultDashboardDialog("add-convex");
    } catch (error) {
      setConvexConnectDialogError(
        error instanceof Error ? error.message : "Could not add Convex projects.",
      );
    } finally {
      setConvexConnectDialogSubmitting(false);
    }
  };

  const handleSubmitCloudflareWorker = async () => {
    if (!vaultToConnectCloudflare || isSubmittingCloudflareWorker) {
      return;
    }
    setCloudflareConnectDialogError(null);
    setCloudflareConnectDialogSubmitting(true);
    try {
      if (cloudflareBuildsRepairWorker && cloudflareBuildsRepairTarget) {
        await runConfigureWorkersBuildsForGitHub(
          cloudflareBuildsRepairTarget.vaultId,
          cloudflareBuildsRepairTarget.workerId,
          cloudflareCreateRootDirectory,
        );
      } else if (cloudflareWorkerToConnect) {
        const result = await connectCloudflareWorker({
          vaultId: vaultToConnectCloudflare.id,
          accountId: selectedCloudflareAccountId,
          workerName: cloudflareWorkerToConnect.workerName,
          workerTag: cloudflareWorkerToConnect.workerTag,
          rootDirectory: cloudflareCreateRootDirectory,
        });
        void workspaceCommands.invalidateProviderObservations();
        markCloudflareConnectDialogWorkerAdded(cloudflareWorkerToConnect.workerTag);
        if (result.state === "added_with_notice") {
          setCloudflareConnectDialogError(result.message);
        }
        return;
      } else if (cloudflareConnectMode === "existing") {
        const workers = selectedCloudflareWorkerTags.map((workerTag) => {
          const worker = cloudflareWorkers.find((candidate) => candidate.workerTag === workerTag);
          if (!worker || worker.repository.state !== "ready") {
            throw new Error("Choose Workers connected to this repository.");
          }
          return {
            workerName: worker.workerName,
            workerTag: worker.workerTag,
          };
        });
        if (workers.length === 0) {
          throw new Error("Choose at least one Cloudflare Worker.");
        }
        await attachCloudflareWorkers({
          vaultId: vaultToConnectCloudflare.id,
          accountId: selectedCloudflareAccountId,
          workers,
        });
      } else {
        await createCloudflareWorker({
          vaultId: vaultToConnectCloudflare.id,
          accountId: selectedCloudflareAccountId,
          workerName: cloudflareCreateWorkerName,
          rootDirectory: cloudflareCreateRootDirectory,
        });
      }
      void workspaceCommands.invalidateProviderObservations();
      setCloudflareBuildsRepairTarget(null);
      resetCloudflareDialogState();
      closeVaultDashboardDialog("add-cloudflare");
    } catch (error) {
      setCloudflareConnectDialogError(
        error instanceof Error ? error.message : "Could not add Cloudflare Workers.",
      );
    } finally {
      setCloudflareConnectDialogSubmitting(false);
    }
  };

  const handleRemoveVault = async () => {
    if (!vaultToDelete || isDeleting || isCommitting) {
      return;
    }
    setDeleteError(null);

    try {
      setIsDeleting(true);
      await deleteVault({
        vaultId: vaultToDelete.id,
        removeGithubRepo: vaultToDelete.isSamebaseManaged
          ? vaultToDelete.canRemoveGithubRepo && removeGithubRepo
          : false,
        removeConvexProvision: vaultToDelete.canRemoveConvexProvision
          ? removeConvexProvision
          : false,
        removeCloudflareProvision: vaultToDelete.canRemoveCloudflareProvision
          ? removeCloudflareProvision
          : false,
      });
      resetDeleteDialogState();
      closeDeletedVaultRoute();
    } catch (error) {
      console.error("Failed to remove vault:", error);
      setDeleteError(error instanceof Error ? error.message : "Failed to remove vault");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetryVaultDeletion = async (runId: Id<"workflow_vaultDeletion_runs">) => {
    if (retryingDeletionRunId) {
      return;
    }

    setRetryingDeletionRunId(runId);
    try {
      await retryDeleteVault({ runId });
    } catch (error) {
      toast({
        title: "Could not retry vault deletion",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRetryingDeletionRunId(null);
    }
  };

  const handleRetryInfrastructureProvisioning = async (vaultId: Id<"vaults">) => {
    if (retryingInfrastructureVaultId) {
      return;
    }

    setRetryingInfrastructureVaultId(vaultId);
    try {
      await retryInfrastructureProvisioning({ vaultId });
    } catch (error) {
      toast({
        title: "Could not retry infrastructure setup",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRetryingInfrastructureVaultId(null);
    }
  };

  const handleChangeConvexProjectConfigPath = (
    vaultId: Id<"vaults">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => {
    setConvexCodeLocationRepairTarget({ vaultId, convexProjectId });
    void navigate({
      resetScroll: false,
      to: ".",
      search: (currentSearch) =>
        applyVaultDashboardProviderAddSearch({
          currentSearch,
          provider: "convex",
        }),
      state: (currentState) => ({
        ...currentState,
        vaultDashboardDialog: "add-convex",
      }),
    });
  };

  const handleReconcileConvexProjectTeam = async (
    vaultId: Id<"vaults">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => {
    if (reconcilingConvexProjectId) {
      return;
    }
    setReconcilingConvexProjectId(convexProjectId);
    try {
      await reconcileConvexProjectTeam({ vaultId, convexProjectId });
    } catch (error) {
      toast({
        title: "Could not update the Convex team",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setReconcilingConvexProjectId(null);
      void workspaceCommands.invalidateProviderObservations();
    }
  };

  const handleDetachCloudflareWorker = async (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
  ) => {
    if (providerAttachmentDetachmentInFlight) {
      return;
    }
    setProviderAttachmentDetachmentInFlight({ provider: "cloudflare", vaultId, workerId });
    try {
      await detachCloudflareWorker({ vaultId, workerId });
    } catch (error) {
      toast({
        title: "Could not remove Cloudflare attachment",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setProviderAttachmentDetachmentInFlight(null);
    }
  };

  const handleDetachConvexProject = async (
    vaultId: Id<"vaults">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => {
    if (providerAttachmentDetachmentInFlight) {
      return;
    }
    setProviderAttachmentDetachmentInFlight({ provider: "convex", vaultId, convexProjectId });
    try {
      await detachConvexProject({ vaultId, convexProjectId });
    } catch (error) {
      toast({
        title: "Could not remove Convex attachment",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setProviderAttachmentDetachmentInFlight(null);
    }
  };

  const runConfigureWorkersBuildsForGitHub = async (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
    rootDirectory: string,
  ) => {
    if (cloudflareWorkerConfigurationActionInFlight) {
      throw new Error("Another Cloudflare configuration change is already running.");
    }

    setCloudflareWorkerConfigurationActionInFlight({
      kind: "configure_workers_builds_for_github",
      vaultId,
      workerId,
    });
    try {
      await configureWorkersBuildsForGitHub({ workerId, vaultId, rootDirectory });
    } finally {
      setCloudflareWorkerConfigurationActionInFlight(null);
      void workspaceCommands.invalidateProviderObservations();
    }
  };

  const handleConfigureWorkersBuildsForGitHub = (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
    rootDirectory: string | undefined,
  ) => {
    if (!rootDirectory) {
      setCloudflareBuildsRepairTarget({ vaultId, workerId });
      setCloudflareConnectDialogCreateRootDirectory("/");
      void navigate({
        resetScroll: false,
        to: ".",
        search: (currentSearch) =>
          applyVaultDashboardProviderAddSearch({
            currentSearch,
            provider: "cloudflare",
          }),
        state: (currentState) => ({
          ...currentState,
          vaultDashboardDialog: "add-cloudflare",
        }),
      });
      return;
    }

    void runConfigureWorkersBuildsForGitHub(vaultId, workerId, rootDirectory).catch((error) => {
      toast({
        title: "Could not configure Workers Builds for GitHub",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    });
  };

  const handleRotateConvexDeployKeysForWorkersBuilds = async (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => {
    if (cloudflareWorkerConfigurationActionInFlight) {
      return;
    }

    setCloudflareWorkerConfigurationActionInFlight({
      kind: "rotate_convex_deploy_keys_for_workers_builds",
      vaultId,
      workerId,
      convexProjectId,
    });
    try {
      await rotateConvexDeployKeysForWorkersBuilds({ convexProjectId, workerId, vaultId });
    } catch (error) {
      toast({
        title: "Could not rotate Convex deploy keys for Workers Builds",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCloudflareWorkerConfigurationActionInFlight(null);
      void workspaceCommands.invalidateProviderObservations();
    }
  };

  const handleCommitBeforeRemove = async () => {
    if (!vaultToDelete || isCommitting || isDeleting) return;

    setIsCommitting(true);
    setCommitError(null);

    try {
      await commitStaging({
        repositoryFullName: vaultToDelete.repositoryFullName,
      });
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : "Failed to commit changes");
    } finally {
      markCommitAttempted();
      setIsCommitting(false);
    }
  };

  if (workspaceModel.state === "loading") {
    if (presentation !== "v2") {
      return null;
    }
    if (!selectedRepositoryFullName) {
      return <VaultOverviewVaultPickerPane sidebarSummaries={{ state: "loading" }} vaults={null} />;
    }
    const loadingRepository = tryParseRepositoryFullName(selectedRepositoryFullName);
    if (!loadingRepository) {
      return null;
    }
    return (
      <AppWorkspaceRouteChrome
        left={{
          header: <VaultDashboardVaultListHeader />,
          content: <VaultOverviewSidebarLoading />,
        }}
      >
        <VaultOverviewLoadingPage
          owner={loadingRepository.owner}
          page={page}
          repoName={loadingRepository.name}
        />
      </AppWorkspaceRouteChrome>
    );
  }

  const allVaults = workspaceModel.vaults;
  const dashboardViewModel = {
    vaults: selectedVault ? [selectedVault] : [],
  };

  const persistedVaultPullRequestFiltersByVaultId = new Map<string, VaultPullRequestFiltersState>(
    selectedWorkspace ? [[selectedWorkspace.vault._id, selectedWorkspace.pullRequestFilters]] : [],
  );
  const persistedVaultResourceLinksOpenByVaultId = new Map<string, boolean>(
    (userVaultResourceLinksState ?? []).map((state) => [state.vaultId, state.resourceLinksOpen]),
  );

  const saveVaultPullRequestFilters = async (
    vaultId: Id<"vaults">,
    nextVaultPullRequestFilters: VaultPullRequestFiltersState,
  ) => {
    const normalizedFilters = normalizeVaultPullRequestFilters(nextVaultPullRequestFilters);

    try {
      await setVaultPullRequestFilters({
        vaultId,
        hiddenLabels: normalizedFilters.hiddenLabels,
        includeDrafts: normalizedFilters.includeDrafts,
        includeNoLabel: normalizedFilters.includeNoLabel,
      });
    } catch (error: unknown) {
      toast({
        title: "Could not save filters",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const saveVaultResourceLinksOpen = async (vaultId: Id<"vaults">, resourceLinksOpen: boolean) => {
    try {
      await setVaultResourceLinksOpen({ vaultId, resourceLinksOpen });
    } catch (error: unknown) {
      toast({
        title: "Could not save resource links",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleVaultDeveloperToolsOpenChange = (vaultId: Id<"vaults">, isOpen: boolean) => {
    setDeveloperToolsOpen(vaultId, isOpen);
  };

  const handleVaultPullRequestFiltersChange = (
    vaultId: Id<"vaults">,
    nextVaultPullRequestFilters: VaultPullRequestFiltersState,
  ) => {
    void saveVaultPullRequestFilters(vaultId, nextVaultPullRequestFilters);
  };

  const handleVaultResourceLinksOpenChange = (
    vaultId: Id<"vaults">,
    resourceLinksOpen: boolean,
  ) => {
    void saveVaultResourceLinksOpen(vaultId, resourceLinksOpen);
  };

  const handleDeleteDialogOpenChange = (isOpen: boolean) => {
    if (isOpen || isDeleting || isCommitting) {
      return;
    }

    closeVaultDashboardDialog("delete");
  };

  const openSelectedProviderAddDialog = (provider: "cloudflare" | "convex") => {
    void navigate({
      resetScroll: false,
      to: ".",
      search: (currentSearch) =>
        applyVaultDashboardProviderAddSearch({
          currentSearch,
          provider,
        }),
      state: (currentState) => ({
        ...currentState,
        vaultDashboardDialog: provider === "convex" ? "add-convex" : "add-cloudflare",
      }),
    });
  };
  const openSelectedVaultDeleteDialog = () => {
    void navigate({
      resetScroll: false,
      to: ".",
      search: (currentSearch) => ({ ...currentSearch, delete: true }),
      state: (currentState) => ({
        ...currentState,
        vaultDashboardDialog: "delete",
      }),
    });
  };
  const canManageSelectedProviderAttachments =
    selectedWorkspace?.vault.hasConnectedGitHubRepository === true &&
    selectedWorkspace.vault.deletion.state === "not_deleting";
  const selectedResourceRailState = selectedWorkspace
    ? buildVaultDashboardResourceRailState({
        buildAddCloudflareWorkerHref: canManageSelectedProviderAttachments
          ? () =>
              buildVaultDashboardProviderAddHref({
                dashboardRoutePathname,
                provider: "cloudflare",
                rootRouteSearch,
              })
          : undefined,
        addCloudflareWorkerOnClick: canManageSelectedProviderAttachments
          ? () => openSelectedProviderAddDialog("cloudflare")
          : undefined,
        buildAddConvexHref: canManageSelectedProviderAttachments
          ? () =>
              buildVaultDashboardProviderAddHref({
                dashboardRoutePathname,
                provider: "convex",
                rootRouteSearch,
              })
          : undefined,
        addConvexOnClick: canManageSelectedProviderAttachments
          ? () => openSelectedProviderAddDialog("convex")
          : undefined,
        configureWorkersBuildsForGitHubOnClick:
          !canManageSelectedProviderAttachments || cloudflareWorkerConfigurationActionInFlight
            ? undefined
            : (workerId, rootDirectory) => {
                handleConfigureWorkersBuildsForGitHub(
                  selectedWorkspace.vault._id,
                  workerId,
                  rootDirectory,
                );
              },
        changeConvexProjectConfigPathOnClick: canManageSelectedProviderAttachments
          ? (convexProjectId) => {
              handleChangeConvexProjectConfigPath(selectedWorkspace.vault._id, convexProjectId);
            }
          : undefined,
        cloudflareObservations: selectedWorkspace.cloudflareObservations,
        convexObservations: selectedWorkspace.convexObservations,
        githubRepositoryUrl: selectedWorkspace.githubRepositoryUrl,
        isConfiguringWorkersBuildsForGitHub: (workerId) =>
          cloudflareWorkerConfigurationActionInFlight?.kind ===
            "configure_workers_builds_for_github" &&
          cloudflareWorkerConfigurationActionInFlight.vaultId === selectedWorkspace.vault._id &&
          cloudflareWorkerConfigurationActionInFlight.workerId === workerId,
        isDetachingCloudflareWorker: (workerId) =>
          providerAttachmentDetachmentInFlight?.provider === "cloudflare" &&
          providerAttachmentDetachmentInFlight.vaultId === selectedWorkspace.vault._id &&
          providerAttachmentDetachmentInFlight.workerId === workerId,
        isDetachingConvexProject: (convexProjectId) =>
          providerAttachmentDetachmentInFlight?.provider === "convex" &&
          providerAttachmentDetachmentInFlight.vaultId === selectedWorkspace.vault._id &&
          providerAttachmentDetachmentInFlight.convexProjectId === convexProjectId,
        isReconcilingConvexProjectTeam: (convexProjectId) =>
          reconcilingConvexProjectId === convexProjectId,
        isRotatingConvexDeployKeysForWorkersBuilds: (workerId, convexProjectId) =>
          cloudflareWorkerConfigurationActionInFlight?.kind ===
            "rotate_convex_deploy_keys_for_workers_builds" &&
          cloudflareWorkerConfigurationActionInFlight.vaultId === selectedWorkspace.vault._id &&
          cloudflareWorkerConfigurationActionInFlight.workerId === workerId &&
          cloudflareWorkerConfigurationActionInFlight.convexProjectId === convexProjectId,
        vault: selectedWorkspace.vault,
        detachCloudflareWorkerOnClick:
          !canManageSelectedProviderAttachments || providerAttachmentDetachmentInFlight
            ? undefined
            : (workerId) => {
                void handleDetachCloudflareWorker(selectedWorkspace.vault._id, workerId);
              },
        detachConvexProjectOnClick:
          !canManageSelectedProviderAttachments || providerAttachmentDetachmentInFlight
            ? undefined
            : (convexProjectId) => {
                void handleDetachConvexProject(selectedWorkspace.vault._id, convexProjectId);
              },
        reconcileConvexProjectTeamOnClick:
          !canManageSelectedProviderAttachments || reconcilingConvexProjectId
            ? undefined
            : (convexProjectId) => {
                void handleReconcileConvexProjectTeam(selectedWorkspace.vault._id, convexProjectId);
              },
        rotateConvexDeployKeysForWorkersBuildsOnClick:
          !canManageSelectedProviderAttachments || cloudflareWorkerConfigurationActionInFlight
            ? undefined
            : (workerId, convexProjectId) => {
                void handleRotateConvexDeployKeysForWorkersBuilds(
                  selectedWorkspace.vault._id,
                  workerId,
                  convexProjectId,
                );
              },
      })
    : null;

  const selectedVaultMissing = Boolean(selectedRepositoryFullName) && selectedVault === null;
  const isVaultRootRoute = selectedRepositoryFullName === undefined;
  const leftPane = {
    header: <VaultDashboardVaultListHeader />,
    content:
      presentation === "v2" ? (
        <VaultOverviewSidebar
          page={page}
          selectedVaultId={selectedVault?._id ?? null}
          sidebarSummaries={workspaceModel.sidebarSummaries}
          vaults={allVaults}
          workspace={selectedWorkspace}
        />
      ) : (
        <VaultDashboardVaultList
          presentation="legacy"
          selectedVaultId={selectedVault?._id ?? null}
          vaults={allVaults}
        />
      ),
  };
  const dashboardBody =
    presentation === "v2" && isVaultRootRoute ? (
      <VaultOverviewVaultPickerPane
        sidebarSummaries={workspaceModel.sidebarSummaries}
        vaults={allVaults}
      />
    ) : selectedVaultMissing && selectedRepositoryFullName ? (
      <VaultDashboardPaneMessage>
        Vault not found: {selectedRepositoryFullName}
      </VaultDashboardPaneMessage>
    ) : selectedVault === null && allVaults.length > 0 ? (
      isVaultRootRoute ? (
        <VaultDashboardVaultPickerPane vaults={allVaults} />
      ) : (
        <VaultDashboardPaneMessage>
          Select a vault from the left sidebar or add one from the right sidebar.
        </VaultDashboardPaneMessage>
      )
    ) : presentation === "v2" && selectedWorkspace && selectedResourceRailState ? (
      <VaultOverviewPage
        developerToolsVisible={developerToolsVisible}
        isRemovingVault={isDeleting || isCommitting}
        page={page}
        resourceRailState={selectedResourceRailState}
        workspace={selectedWorkspace}
        onOpenDeleteDialog={openSelectedVaultDeleteDialog}
        onPullRequestFiltersChange={(filters) => {
          handleVaultPullRequestFiltersChange(selectedWorkspace.vault._id, filters);
        }}
        onRetryInfrastructureProvisioning={() => {
          void handleRetryInfrastructureProvisioning(selectedWorkspace.vault._id);
        }}
        onRetryVaultDeletion={() => {
          if (selectedWorkspace.vault.deletion.state === "delete_failed") {
            void handleRetryVaultDeletion(selectedWorkspace.vault.deletion.runId);
          }
        }}
      />
    ) : (
      <VaultDashboardView
        deleteModeActive={deleteModeActive}
        developerToolsVisible={developerToolsVisible}
        schemaGraphAccessEnabled={schemaGraphAccessEnabled}
        cloudflareObservations={
          selectedWorkspace?.cloudflareObservations ?? {
            workers: { state: "loading" },
            builds: { state: "loading" },
            convexBuildAccess: { state: "loading" },
          }
        }
        cloudflareWorkerConfigurationActionInFlight={cloudflareWorkerConfigurationActionInFlight}
        convexObservations={selectedWorkspace?.convexObservations ?? { state: "loading" }}
        isRemovingVault={isDeleting || isCommitting}
        providerAttachmentDetachmentInFlight={providerAttachmentDetachmentInFlight}
        pullRequests={selectedWorkspace?.pullRequests ?? { state: "not_requested" }}
        reconcilingConvexProjectId={reconcilingConvexProjectId}
        retryingDeletionRunId={retryingDeletionRunId}
        retryingInfrastructureVaultId={retryingInfrastructureVaultId}
        viewModel={dashboardViewModel}
        logoRouteSearch={rootRouteSearch}
        replaceLogoRouteSearch={(nextSearch) => {
          void navigate({
            replace: true,
            resetScroll: false,
            search: (currentSearch) => replaceRootLogoRouteSearch(currentSearch, nextSearch),
            state: true,
            to: ".",
          });
        }}
        openDeveloperToolsByVaultId={openDeveloperToolsByVaultId}
        persistedVaultPullRequestFiltersByVaultId={persistedVaultPullRequestFiltersByVaultId}
        persistedVaultResourceLinksOpenByVaultId={persistedVaultResourceLinksOpenByVaultId}
        rootRouteSearch={rootRouteSearch}
        onConfigureWorkersBuildsForGitHub={handleConfigureWorkersBuildsForGitHub}
        onChangeConvexProjectConfigPath={handleChangeConvexProjectConfigPath}
        onReconcileConvexProjectTeam={(vaultId, convexProjectId) => {
          void handleReconcileConvexProjectTeam(vaultId, convexProjectId);
        }}
        onRotateConvexDeployKeysForWorkersBuilds={(vaultId, workerId, convexProjectId) => {
          void handleRotateConvexDeployKeysForWorkersBuilds(vaultId, workerId, convexProjectId);
        }}
        onOpenDeveloperToolsChange={handleVaultDeveloperToolsOpenChange}
        onDetachCloudflareWorker={(vaultId, workerId) => {
          void handleDetachCloudflareWorker(vaultId, workerId);
        }}
        onDetachConvexProject={(vaultId, convexProjectId) => {
          void handleDetachConvexProject(vaultId, convexProjectId);
        }}
        onRetryInfrastructureProvisioning={(vaultId) => {
          void handleRetryInfrastructureProvisioning(vaultId);
        }}
        onRetryVaultDeletion={(runId) => {
          void handleRetryVaultDeletion(runId);
        }}
        onSaveVaultPullRequestFilters={handleVaultPullRequestFiltersChange}
        onResourceLinksOpenChange={handleVaultResourceLinksOpenChange}
      />
    );

  return (
    <AppWorkspaceRouteChrome left={isVaultRootRoute ? null : leftPane}>
      {dashboardBody}

      <VaultDashboardDeleteDialog
        commitError={commitError}
        deleteError={deleteError}
        didAttemptCommit={didAttemptCommit}
        isCommitting={isCommitting}
        isDeleting={isDeleting}
        onCommitBeforeRemove={() => {
          void handleCommitBeforeRemove();
        }}
        onDeleteOptionChange={setDeleteOption}
        onOpenChange={handleDeleteDialogOpenChange}
        onRemoveVault={() => {
          void handleRemoveVault();
        }}
        open={vaultToDelete !== null}
        removeConvexProvision={removeConvexProvision}
        removeGithubRepo={removeGithubRepo}
        removeCloudflareProvision={removeCloudflareProvision}
        stagedChangesCount={stagedChangesCount}
        vaultToDelete={vaultToDelete}
      />
      <VaultDashboardConvexDialog
        codeLocations={convexCodeLocations}
        createCodeLocationKey={convexCreateCodeLocationKey}
        createProjectName={convexCreateProjectName}
        projects={unattachedConvexProjects}
        repairProject={
          convexCodeLocationRepairProject
            ? {
                codeLocation: convexCodeLocationRepairProject.codeLocation,
                projectId: convexCodeLocationRepairProject.projectId,
              }
            : null
        }
        error={convexDialogError}
        isLoading={isLoadingConvexResources}
        isSubmitting={isSubmittingConvexProject}
        mode={convexConnectMode}
        onCreateCodeLocationKeyChange={setConvexConnectDialogCreateCodeLocationKey}
        onCreateProjectNameChange={setConvexConnectDialogCreateProjectName}
        onModeChange={setConvexConnectDialogConnectMode}
        onOpenChange={handleConnectConvexDialogOpenChange}
        onProjectCodeLocationKeyChange={setConvexConnectDialogProjectCodeLocationKey}
        onProjectToggle={toggleConvexConnectDialogProject}
        onSubmit={() => {
          void handleSubmitConvexProject();
        }}
        open={vaultToConnectConvex !== null}
        selectedProjectCodeLocationKeys={selectedConvexProjectCodeLocationKeys}
        sourceCompleteness={convexSourceCompleteness}
        vault={vaultToConnectConvex}
      />
      <VaultDashboardCloudflareDialog
        accounts={cloudflareAccounts}
        createRootDirectory={cloudflareCreateRootDirectory}
        createWorkerName={cloudflareCreateWorkerName}
        didAddWorker={didAddCloudflareWorker}
        error={cloudflareDialogError}
        folderSuggestions={
          cloudflareRepositoryFolderSuggestions ?? EMPTY_REPOSITORY_FOLDER_SUGGESTIONS
        }
        isLoading={isLoadingCloudflareResources}
        isSubmitting={isSubmittingCloudflareWorker}
        inventoryState={cloudflareInventoryState}
        mode={cloudflareConnectMode}
        onAccountChange={handleCloudflareAccountChange}
        onCreateRootDirectoryChange={setCloudflareConnectDialogCreateRootDirectory}
        onCreateWorkerNameChange={setCloudflareConnectDialogCreateWorkerName}
        onConnectWorker={setCloudflareConnectDialogWorkerToConnect}
        onConnectWorkerBack={() => {
          setCloudflareConnectDialogWorkerToConnect(null);
          setCloudflareConnectDialogConnectMode("existing");
        }}
        onModeChange={setCloudflareConnectDialogConnectMode}
        onOpenChange={handleConnectCloudflareDialogOpenChange}
        onSubmit={() => {
          void handleSubmitCloudflareWorker();
        }}
        onWorkerToggle={toggleCloudflareConnectDialogWorker}
        open={vaultToConnectCloudflare !== null}
        selectedAccountId={selectedCloudflareAccountId}
        selectedWorkerTags={selectedCloudflareWorkerTags}
        repairWorker={
          cloudflareBuildsRepairWorker
            ? { workerName: cloudflareBuildsRepairWorker.workerName }
            : null
        }
        vault={vaultToConnectCloudflare}
        workerToConnect={cloudflareWorkerToConnect}
        workers={cloudflareWorkers}
      />
    </AppWorkspaceRouteChrome>
  );
}
