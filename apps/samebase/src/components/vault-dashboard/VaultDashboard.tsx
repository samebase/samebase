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
import { VaultRepositoryRootInput } from "@/components/vault-dashboard/VaultRepositoryRootInput";
import { buildVaultDashboardResourceRailState } from "@/components/vault-dashboard/vaultResourceRailState";
import { buildVaultProductionRoots } from "@/components/vault-dashboard/vaultProductionRoots";
import { TrashIcon, UpdateIcon } from "@/lib/radixIcons";
import { Loader2 } from "lucide-react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { linkStyle } from "../styles";
import { clsx } from "clsx";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { useNow } from "@/hooks/useNow";
import { useVaultPullRequests, type VaultPullRequestsState } from "@/hooks/useVaultPullRequests";
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
import { CodespaceStatus } from "@/components/CodespaceStatus";
import { VaultPullRequestFiltersControl } from "@/components/vault-dashboard/VaultPullRequestFilters";
import { EditorChatPanel } from "@/components/EditorChatPanel";
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
  buildVaultCodespaceChatRoute,
  buildVaultFileRoute,
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
import { CHAT_ENABLED, CODESPACES_ENABLED } from "../../../shared/featureFlags";
import { buildDefaultAppResourceName } from "../../../shared/appResourceNames";
import { buildGitHubBranchTreeUrl } from "@/lib/githubUrls";
import { tryParseRepositoryFullName } from "../../../shared/repoName";
import {
  useVaultProviderObservations,
  type VaultCloudflareProviderObservationState,
  type VaultConvexProjectObservation,
  type VaultProviderObservationState,
} from "@/components/vault-dashboard/useVaultProviderObservations";

const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";
const EMPTY_REPOSITORY_FOLDER_SUGGESTIONS: readonly string[] = [];

export type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];
export type VaultDashboardViewModel = {
  vaults: VaultDashboardVault[];
};
export type VaultDashboardProps = {
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
type ConvexConfigOption = Extract<
  (typeof api.vault.convex.discoverProjects)["_returnType"]["source"]["configs"][number],
  { state: "valid" }
>;
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
type ConvexConfigPathRepairTarget = {
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
  | "removeCodespaces"
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
    configs: ConvexConfigOption[];
    connectMode: ConvexProjectConnectMode;
    createConfigPath: string;
    createProjectName: string;
    error: string | null;
    isLoadingResources: boolean;
    isSubmittingProject: boolean;
    projects: ConvexProjectOption[];
    selectedProjectConfigPaths: Record<string, string | undefined>;
    sourceCompleteness: ConvexSourceCompleteness | null;
  };
  commitError: string | null;
  deleteError: string | null;
  didAttemptCommit: boolean;
  isCommitting: boolean;
  isDeleting: boolean;
  isGlobalChatBusy: boolean;
  openDeveloperToolsByVaultId: Partial<Record<Id<"vaults">, boolean>>;
  removeCodespaces: boolean;
  removeConvexProvision: boolean;
  removeGithubRepo: boolean;
  removeCloudflareProvision: boolean;
  retryingDeletionRunId: Id<"workflow_vaultDeletion_runs"> | null;
  shouldAutoFocusChatInput: boolean;
};

function readInitialConvexConnectDialogState(): VaultDashboardLocalState["convexConnectDialog"] {
  return {
    configs: [],
    connectMode: "existing",
    createConfigPath: "",
    createProjectName: "",
    error: null,
    isLoadingResources: false,
    isSubmittingProject: false,
    projects: [],
    selectedProjectConfigPaths: {},
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
    isGlobalChatBusy: false,
    openDeveloperToolsByVaultId: {},
    removeCodespaces: false,
    removeConvexProvision: false,
    removeGithubRepo: false,
    removeCloudflareProvision: false,
    retryingDeletionRunId: null,
    shouldAutoFocusChatInput: false,
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
        removeCodespaces: false,
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
        removeCodespaces: false,
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
    setConvexConnectDialogConfigs: (configs: ConvexConfigOption[]) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: {
          ...state.convexConnectDialog,
          configs,
          createConfigPath: configs[0]?.convexConfigPath ?? "",
          selectedProjectConfigPaths: {},
        },
      }));
    },
    setConvexConnectDialogProjects: (projects: ConvexProjectOption[]) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: {
          ...state.convexConnectDialog,
          projects,
          selectedProjectConfigPaths: {},
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
    setConvexConnectDialogCreateConfigPath: (createConfigPath: string) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: { ...state.convexConnectDialog, createConfigPath },
      }));
    },
    setConvexConnectDialogProjectConfigPath: (projectId: string, convexConfigPath: string) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: {
          ...state.convexConnectDialog,
          selectedProjectConfigPaths: {
            ...state.convexConnectDialog.selectedProjectConfigPaths,
            [projectId]: convexConfigPath,
          },
        },
      }));
    },
    toggleConvexConnectDialogProject: (projectId: string) => {
      setState((state) => {
        const selectedConfigPath = state.convexConnectDialog.selectedProjectConfigPaths[projectId];
        const selectedProjectConfigPaths =
          selectedConfigPath !== undefined
            ? Object.fromEntries(
                Object.entries(state.convexConnectDialog.selectedProjectConfigPaths).filter(
                  ([candidate]) => candidate !== projectId,
                ),
              )
            : {
                ...state.convexConnectDialog.selectedProjectConfigPaths,
                [projectId]: state.convexConnectDialog.configs[0]?.convexConfigPath ?? "",
              };
        return {
          ...state,
          convexConnectDialog: {
            ...state.convexConnectDialog,
            selectedProjectConfigPaths,
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
          case "removeCodespaces":
            return { ...state, removeCodespaces: value };
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
    setGlobalChatAutoFocus: (shouldAutoFocusChatInput: boolean) => {
      setState((state) => ({ ...state, shouldAutoFocusChatInput }));
    },
    setGlobalChatBusy: (isGlobalChatBusy: boolean) => {
      setState((state) => ({ ...state, isGlobalChatBusy }));
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
  connectedCodespacesCount,
  deleteError,
  didAttemptCommit,
  isCommitting,
  isDeleting,
  onCommitBeforeRemove,
  onDeleteOptionChange,
  onOpenChange,
  onRemoveVault,
  open,
  removeCodespaces,
  removeConvexProvision,
  removeGithubRepo,
  removeCloudflareProvision,
  stagedChangesCount,
  vaultToDelete,
}: {
  commitError: string | null;
  connectedCodespacesCount: number | undefined;
  deleteError: string | null;
  didAttemptCommit: boolean;
  isCommitting: boolean;
  isDeleting: boolean;
  onCommitBeforeRemove: () => void;
  onDeleteOptionChange: (option: VaultDeleteOptionKey, value: boolean) => void;
  onOpenChange: (isOpen: boolean) => void;
  onRemoveVault: () => void;
  open: boolean;
  removeCodespaces: boolean;
  removeConvexProvision: boolean;
  removeGithubRepo: boolean;
  removeCloudflareProvision: boolean;
  stagedChangesCount: number;
  vaultToDelete: VaultDeleteDialogTarget | null;
}) {
  const hasStagedChanges = stagedChangesCount > 0;
  const removeCloudflareCheckboxId = "remove-cloudflare-provision";
  const removeCloudflareLabel = "Also remove Cloudflare Worker";
  const showCodespacesCleanup =
    CODESPACES_ENABLED && connectedCodespacesCount !== undefined && connectedCodespacesCount > 0;
  const isCodespacesCleanupPending = CODESPACES_ENABLED && connectedCodespacesCount === undefined;

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
            {showCodespacesCleanup ? (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="remove-codespaces"
                  checked={removeCodespaces}
                  onCheckedChange={(checked) =>
                    onDeleteOptionChange("removeCodespaces", checked === true)
                  }
                  disabled={isDeleting || isCommitting}
                  className="mt-0.5"
                />
                <label htmlFor="remove-codespaces" className="text-sm text-muted-foreground">
                  Also remove all Codespaces ({connectedCodespacesCount} connected)
                </label>
              </div>
            ) : null}
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
            disabled={!vaultToDelete || isDeleting || isCommitting || isCodespacesCleanupPending}
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

export function VaultDashboardConvexDialog({
  configs,
  createConfigPath,
  createProjectName,
  projects,
  error,
  isLoading,
  isSubmitting,
  mode,
  onCreateConfigPathChange,
  onCreateProjectNameChange,
  onModeChange,
  onOpenChange,
  onProjectConfigPathChange,
  onProjectToggle,
  onSubmit,
  open,
  repairProject,
  selectedProjectConfigPaths,
  sourceCompleteness,
  vault,
}: {
  configs: readonly ConvexConfigOption[];
  createConfigPath: string;
  createProjectName: string;
  projects: readonly ConvexProjectOption[];
  error: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  mode: ConvexProjectConnectMode;
  onCreateConfigPathChange: (convexConfigPath: string) => void;
  onCreateProjectNameChange: (projectName: string) => void;
  onModeChange: (mode: ConvexProjectConnectMode) => void;
  onOpenChange: (isOpen: boolean) => void;
  onProjectConfigPathChange: (projectId: string, convexConfigPath: string) => void;
  onProjectToggle: (projectId: string) => void;
  onSubmit: () => void;
  open: boolean;
  repairProject: { convexConfigPath: string; projectId: string } | null;
  selectedProjectConfigPaths: Readonly<Record<string, string | undefined>>;
  sourceCompleteness: ConvexSourceCompleteness | null;
  vault: VaultConvexDialogTarget | null;
}) {
  const configPaths = configs.map((config) => config.convexConfigPath);
  const sortedProjects = useMemo(() => [...projects].sort(compareConvexProjectOption), [projects]);
  const discoveryResultsAvailable = !isLoading && sourceCompleteness !== null;
  const selectedProjectCount = Object.keys(selectedProjectConfigPaths).length;
  const submitDisabled =
    isLoading ||
    isSubmitting ||
    configPaths.length === 0 ||
    (repairProject
      ? !createConfigPath
      : mode === "existing"
        ? selectedProjectCount === 0 ||
          Object.values(selectedProjectConfigPaths).some((path) => !path)
        : !createProjectName.trim() || !createConfigPath);

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
              ? `Choose the convex.json file for this project. Current location: ${repairProject.convexConfigPath}.`
              : mode === "existing"
                ? "Choose one or more projects and the convex.json file for each."
                : "Choose a project name and its convex.json file."}
          </DialogDescription>
        </DialogHeader>
        {vault ? (
          <div className="space-y-3">
            {!repairProject ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mode === "existing" ? "default" : "outline"}
                  onClick={() => onModeChange("existing")}
                  disabled={isLoading || isSubmitting}
                >
                  Existing
                </Button>
                <Button
                  type="button"
                  variant={mode === "create" ? "default" : "outline"}
                  onClick={() => onModeChange("create")}
                  disabled={isLoading || isSubmitting}
                >
                  Create
                </Button>
              </div>
            ) : null}
            {discoveryResultsAvailable && sourceCompleteness === "partial" ? (
              <div className="text-sm text-muted-foreground">
                The repository could not be fully scanned. Verified configs found so far are shown.
              </div>
            ) : null}
            {!discoveryResultsAvailable ? null : configPaths.length === 0 ? (
              sourceCompleteness === "complete" ? (
                <div className="text-sm text-muted-foreground">
                  No valid convex.json files were found on the default branch.
                </div>
              ) : null
            ) : repairProject ? (
              <Select
                modal={false}
                value={createConfigPath}
                onValueChange={onCreateConfigPathChange}
                disabled={isSubmitting}
              >
                <SelectTrigger aria-label="New Convex config path" className="w-full">
                  <SelectValue placeholder="convex.json" />
                </SelectTrigger>
                <AppSelectContent>
                  {configPaths.map((path) => (
                    <AppSelectItem key={path} value={path}>
                      <span className="font-mono">{path}</span>
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
                    const selectedConfigPath = selectedProjectConfigPaths[project.projectId];
                    const selected = selectedConfigPath !== undefined;
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
                            value={selectedConfigPath}
                            onValueChange={(convexConfigPath) =>
                              onProjectConfigPathChange(project.projectId, convexConfigPath)
                            }
                            disabled={isSubmitting}
                          >
                            <SelectTrigger
                              aria-label={`convex.json for ${project.projectName}`}
                              className="w-full"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <AppSelectContent>
                              {configPaths.map((path) => (
                                <AppSelectItem key={path} value={path}>
                                  <span className="font-mono">{path}</span>
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
                  value={createConfigPath}
                  onValueChange={onCreateConfigPathChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger aria-label="Convex config path" className="w-full">
                    <SelectValue placeholder="convex.json" />
                  </SelectTrigger>
                  <AppSelectContent>
                    {configPaths.map((path) => (
                      <AppSelectItem key={path} value={path}>
                        <span className="font-mono">{path}</span>
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </Select>
              </div>
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
                <Select
                  value={selectedAccountId}
                  onValueChange={onAccountChange}
                  disabled={isLoading}
                >
                  <SelectTrigger aria-label="Cloudflare account" className="w-full">
                    <SelectValue
                      placeholder={isLoading ? "Loading accounts" : "Cloudflare account"}
                    >
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
                    disabled={isLoading || isSubmitting}
                  >
                    Existing
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "create" ? "default" : "outline"}
                    onClick={() => onModeChange("create")}
                    disabled={isLoading || isSubmitting}
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
                                  disabled={isLoading || isSubmitting}
                                  onCheckedChange={() => onWorkerToggle(worker.workerTag)}
                                />
                                <span className="truncate text-sm">{worker.workerName}</span>
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : !isLoading &&
                      selectedAccountId &&
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
                        disabled={isLoading || isSubmitting}
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
                      disabled={isLoading || isSubmitting}
                      placeholder="Worker name"
                    />
                    <VaultRepositoryRootInput
                      disabled={isLoading || isSubmitting}
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
  selectedVaultId,
  vaults,
}: {
  selectedVaultId: Id<"vaults"> | null;
  vaults: VaultDashboardVault[];
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
                  to={buildVaultDashboardRoute({
                    owner: vault.ghRepoOwner,
                    repoName: vault.ghRepoName,
                  })}
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

export function VaultDashboardVaultPickerPane({ vaults }: { vaults: VaultDashboardVault[] }) {
  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <div className="flex h-8 shrink-0 items-center border-b border-border">
        <VaultDashboardVaultListHeader />
      </div>
      <VaultDashboardVaultList selectedVaultId={null} vaults={vaults} />
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
        const chatRoute =
          primaryBranch && !isDeletingVault
            ? buildVaultCodespaceChatRoute({
                repositoryFullName: vault.repositoryFullName,
                branch: primaryBranch,
              })
            : null;
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
              defaultBranch={primaryBranch}
              githubBranchUrl={buildGitHubBranchTreeUrl({
                repositoryFullName: vault.repositoryFullName,
                branchName: primaryBranch,
              })}
              productionRoots={productionRoots}
              samebaseEditorUrl={buildVaultFileRoute({
                owner: vault.ghRepoOwner,
                repoName: vault.ghRepoName,
                branch: primaryBranch,
              })}
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
                canObservePullRequests || hasProvisioningLog
                  ? {
                      open: developerToolsOpen,
                      visible: developerToolsVisible,
                      onOpenChange: (isOpen: boolean) => {
                        onOpenDeveloperToolsChange(vault._id, isOpen);
                      },
                      content: (
                        <>
                          {canObservePullRequests && CODESPACES_ENABLED ? (
                            <CodespaceStatus
                              vaultId={vault._id}
                              repositoryFullName={vault.repositoryFullName}
                            />
                          ) : null}
                          {hasProvisioningLog ? (
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
                          ) : null}
                        </>
                      ),
                    }
                  : undefined
              }
              footerActions={
                CHAT_ENABLED &&
                CODESPACES_ENABLED &&
                developerToolsVisible &&
                developerToolsOpen &&
                chatRoute ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to={chatRoute}>Chat</Link>
                    </Button>
                  </div>
                ) : undefined
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

export function VaultDashboard({ selectedRepositoryFullName }: VaultDashboardProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const vaultDashboardDialogHistoryEntry = useLocation({
    select: (location) => location.state.vaultDashboardDialog,
  });
  const rootRouteSearch = useRootRouteSearch();
  const developerToolsVisible = rootRouteSearch[DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM] === true;
  const vaults = useQuery(api.vault.dashboard.getUserVaults);
  const selectedVault = useMemo(() => {
    if (!vaults || vaults.length === 0) {
      return null;
    }
    if (!selectedRepositoryFullName) {
      return null;
    }
    return vaults.find((vault) => vault.repositoryFullName === selectedRepositoryFullName) ?? null;
  }, [selectedRepositoryFullName, vaults]);
  const providerObservations = useVaultProviderObservations(selectedVault);
  const dashboardData = useMemo(
    () =>
      vaults
        ? {
            allVaults: vaults,
            viewModel: {
              vaults: selectedVault ? [selectedVault] : [],
            },
          }
        : null,
    [selectedVault, vaults],
  );
  const now = useNow({ intervalMs: 15_000 });
  const deleteVault = useAction(api.vault.actions.deleteVault);
  const retryDeleteVault = useAction(api.vault.actions.retryDeleteVault);
  const retryInfrastructureProvisioning = useAction(
    api.vault.actions.retryInfrastructureProvisioning,
  );
  const commitStaging = useAction(api.fileStagingActions.commitStaging);
  const discoverConvexProjects = useAction(api.vault.convex.discoverProjects);
  const attachConvexProjects = useAction(api.vault.convex.attachProjects);
  const changeConvexProjectConfigPath = useAction(api.vault.convex.changeProjectConfigPath);
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
  const [convexConfigPathRepairTarget, setConvexConfigPathRepairTarget] =
    useState<ConvexConfigPathRepairTarget | null>(null);
  const [cloudflareBuildsRepairTarget, setCloudflareBuildsRepairTarget] =
    useState<CloudflareBuildsRepairTarget | null>(null);
  const [reconcilingConvexProjectId, setReconcilingConvexProjectId] =
    useState<Id<"vaultConvexProjects"> | null>(null);
  const setEditorChatOpen = useMutation(
    api.dashboardSettings.setEditorChatOpen,
  ).withOptimisticUpdate((localStore, args) => {
    const currentSettings = localStore.getQuery(api.dashboardSettings.getDashboardSettings, {});
    if (!currentSettings) {
      return;
    }
    localStore.setQuery(
      api.dashboardSettings.getDashboardSettings,
      {},
      args.scope === "vault"
        ? {
            ...currentSettings,
            editorChatOpen: args.isOpen,
          }
        : {
            ...currentSettings,
            globalChatOpen: args.isOpen,
          },
    );
  });
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
  const cloudflareConnection = useConvexQuery(api.users.getCloudflareConnectionStatus);
  const connectedCloudflareConnection =
    cloudflareConnection?.connected === true ? cloudflareConnection : null;
  const dashboardSettings = useConvexQuery(api.dashboardSettings.getDashboardSettings);
  const dashboardGlobalChatOpen = dashboardSettings?.globalChatOpen;
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
    isGlobalChatBusy,
    openDeveloperToolsByVaultId,
    removeCodespaces,
    removeConvexProvision,
    removeGithubRepo,
    removeCloudflareProvision,
    retryingDeletionRunId,
    shouldAutoFocusChatInput,
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
    configs: convexConfigs,
    connectMode: convexConnectMode,
    createConfigPath: convexCreateConfigPath,
    createProjectName: convexCreateProjectName,
    projects: convexProjects,
    error: convexDialogError,
    isLoadingResources: isLoadingConvexResources,
    isSubmittingProject: isSubmittingConvexProject,
    selectedProjectConfigPaths: selectedConvexProjectConfigPaths,
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
    setConvexConnectDialogConfigs,
    setConvexConnectDialogCreateConfigPath,
    setConvexConnectDialogCreateProjectName,
    setConvexConnectDialogProjects,
    setConvexConnectDialogError,
    setConvexConnectDialogLoading,
    setConvexConnectDialogProjectConfigPath,
    setConvexConnectDialogSubmitting,
    setConvexConnectDialogSourceCompleteness,
    setDeleteError,
    setDeleteOption,
    setDeveloperToolsOpen,
    setGlobalChatAutoFocus,
    setGlobalChatBusy,
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
  const convexConfigPathRepairProject =
    vaultToConnectConvex && convexConfigPathRepairTarget?.vaultId === vaultToConnectConvex.id
      ? (addConvexDialogVault?.convexProjects.find(
          (project) => project.convexProjectId === convexConfigPathRepairTarget.convexProjectId,
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
  const connectedCodespacesCount = useConvexQuery(
    api.codespaces.mutations.getConnectedCodespacesCount,
    CODESPACES_ENABLED && vaultToDelete ? { vaultId: vaultToDelete.id } : "skip",
  );

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
      to: "/vault",
    });
  }, [navigate]);

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
        setConvexConnectDialogConfigs(
          discovery.source.configs.filter((config) => config.state === "valid"),
        );
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
      setConvexConnectDialogConfigs,
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
      setConvexConfigPathRepairTarget(null);
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
      const configsByPath = new Map(
        convexConfigs.map((config) => [config.convexConfigPath, config]),
      );
      if (convexConfigPathRepairProject) {
        const config = configsByPath.get(convexCreateConfigPath);
        if (!config) {
          throw new Error("Choose a discovered convex.json file.");
        }
        await changeConvexProjectConfigPath({
          vaultId: vaultToConnectConvex.id,
          convexProjectId: convexConfigPathRepairProject.convexProjectId,
          convexConfigPath: config.convexConfigPath,
          blobSha: config.blobSha,
        });
      } else if (convexConnectMode === "existing") {
        const projects = Object.entries(selectedConvexProjectConfigPaths).map(
          ([projectId, convexConfigPath]) => {
            if (!convexConfigPath) {
              throw new Error("Choose a discovered convex.json file for every project.");
            }
            const config = configsByPath.get(convexConfigPath);
            if (!config) {
              throw new Error("Choose a discovered convex.json file for every project.");
            }
            return {
              blobSha: config.blobSha,
              convexConfigPath: config.convexConfigPath,
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
        const config = configsByPath.get(convexCreateConfigPath);
        if (!config) {
          throw new Error("Choose a discovered convex.json file.");
        }
        await createConvexProject({
          vaultId: vaultToConnectConvex.id,
          projectName: convexCreateProjectName,
          convexConfigPath: config.convexConfigPath,
          blobSha: config.blobSha,
        });
      }
      void providerObservations.invalidate();
      setConvexConfigPathRepairTarget(null);
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
        void providerObservations.invalidate();
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
      void providerObservations.invalidate();
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
    if (
      !vaultToDelete ||
      isDeleting ||
      isCommitting ||
      (CODESPACES_ENABLED && connectedCodespacesCount === undefined)
    ) {
      return;
    }
    setDeleteError(null);

    try {
      setIsDeleting(true);
      await deleteVault({
        vaultId: vaultToDelete.id,
        removeCodespaces:
          CODESPACES_ENABLED &&
          connectedCodespacesCount !== undefined &&
          connectedCodespacesCount > 0 &&
          removeCodespaces,
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
    setConvexConfigPathRepairTarget({ vaultId, convexProjectId });
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
      void providerObservations.invalidate();
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
      void providerObservations.invalidate();
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
      void providerObservations.invalidate();
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

  const resolvedGlobalChatOpen = dashboardGlobalChatOpen ?? false;

  const handleGlobalChatOpenChange = (isOpen: boolean) => {
    setGlobalChatAutoFocus(isOpen);
    void setEditorChatOpen({ isOpen, scope: "global" }).catch((error: unknown) => {
      console.error("Failed to persist global chat state:", error);
      setGlobalChatAutoFocus(false);
    });
  };

  if (!dashboardData) {
    return null;
  }

  const { allVaults, viewModel: dashboardViewModel } = dashboardData;

  const persistedVaultPullRequestFiltersByVaultId = new Map<string, VaultPullRequestFiltersState>(
    (userVaultPullRequestFilters ?? []).map((vaultPullRequestFilter) => [
      vaultPullRequestFilter.vaultId,
      normalizeVaultPullRequestFilters(vaultPullRequestFilter),
    ]),
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

  const selectedVaultMissing = Boolean(selectedRepositoryFullName) && selectedVault === null;
  const isVaultRootRoute = selectedRepositoryFullName === undefined;
  const leftPane = {
    header: <VaultDashboardVaultListHeader />,
    content: (
      <VaultDashboardVaultList selectedVaultId={selectedVault?._id ?? null} vaults={allVaults} />
    ),
  };
  const dashboardBody =
    selectedVaultMissing && selectedRepositoryFullName ? (
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
    ) : (
      <VaultDashboardView
        deleteModeActive={deleteModeActive}
        developerToolsVisible={developerToolsVisible}
        cloudflareObservations={providerObservations.cloudflare}
        cloudflareWorkerConfigurationActionInFlight={cloudflareWorkerConfigurationActionInFlight}
        convexObservations={providerObservations.convex}
        isRemovingVault={isDeleting || isCommitting}
        providerAttachmentDetachmentInFlight={providerAttachmentDetachmentInFlight}
        pullRequests={pullRequests}
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
    <AppWorkspaceRouteChrome
      left={isVaultRootRoute ? null : leftPane}
      panel={
        CHAT_ENABLED
          ? {
              content: (
                <EditorChatPanel
                  autoFocusInput={shouldAutoFocusChatInput}
                  onBusyStateChange={setGlobalChatBusy}
                  shellMode="embedded"
                />
              ),
              closeDisabled: isGlobalChatBusy,
              onOpenChange: handleGlobalChatOpenChange,
              open: resolvedGlobalChatOpen,
            }
          : undefined
      }
    >
      {dashboardBody}

      <VaultDashboardDeleteDialog
        commitError={commitError}
        connectedCodespacesCount={connectedCodespacesCount}
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
        removeCodespaces={removeCodespaces}
        removeConvexProvision={removeConvexProvision}
        removeGithubRepo={removeGithubRepo}
        removeCloudflareProvision={removeCloudflareProvision}
        stagedChangesCount={stagedChangesCount}
        vaultToDelete={vaultToDelete}
      />
      <VaultDashboardConvexDialog
        configs={convexConfigs}
        createConfigPath={convexCreateConfigPath}
        createProjectName={convexCreateProjectName}
        projects={unattachedConvexProjects}
        repairProject={
          convexConfigPathRepairProject
            ? {
                convexConfigPath: convexConfigPathRepairProject.convexConfigPath,
                projectId: convexConfigPathRepairProject.projectId,
              }
            : null
        }
        error={convexDialogError}
        isLoading={isLoadingConvexResources}
        isSubmitting={isSubmittingConvexProject}
        mode={convexConnectMode}
        onCreateConfigPathChange={setConvexConnectDialogCreateConfigPath}
        onCreateProjectNameChange={setConvexConnectDialogCreateProjectName}
        onModeChange={setConvexConnectDialogConnectMode}
        onOpenChange={handleConnectConvexDialogOpenChange}
        onProjectConfigPathChange={setConvexConnectDialogProjectConfigPath}
        onProjectToggle={toggleConvexConnectDialogProject}
        onSubmit={() => {
          void handleSubmitConvexProject();
        }}
        open={vaultToConnectConvex !== null}
        selectedProjectConfigPaths={selectedConvexProjectConfigPaths}
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
