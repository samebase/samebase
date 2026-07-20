import { api } from "../../../convex/_generated/api";
import { AppDialogContent } from "@/components/AppDialogContent";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { VaultProvisioningLog } from "@/components/vault-dashboard/VaultProvisioningLogViewer";
import { VaultPullRequestList } from "@/components/vault-dashboard/VaultPullRequestList";
import { VaultResourceRail } from "@/components/vault-dashboard/VaultResourceRail";
import { buildVaultDashboardResourceRailState } from "@/components/vault-dashboard/vaultResourceRailState";
import { TrashIcon, UpdateIcon } from "@/lib/radixIcons";
import { Loader2 } from "lucide-react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { linkStyle } from "../styles";
import { clsx } from "clsx";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { highlightMatches, rankFuzzyPathMatches } from "@/lib/fuzzySearch.tsx";
import { useNow } from "@/hooks/useNow";
import {
  useVaultPullRequestObservations,
  type VaultPullRequestObservation,
} from "@/hooks/useVaultPullRequestObservations";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
  resolveVaultProviderSetupStatus,
  type VaultDashboardProviderSetup,
} from "@/components/vault-dashboard/vaultProviderSetup";
import { type LogoRouteSearch } from "@/routeSearch/logo";
import {
  DASHBOARD_ADD_APP_ROOT_QUERY_PARAM,
  DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM,
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
import { tryParseRepositoryFullName } from "../../../shared/repoName";
import { VAULT_ROOT_DIRECTORY } from "../../../shared/vaultRootDirectory";
import type {
  CloudflareWorkerOption,
  CloudflareWorkerRepositoryEvidence,
} from "@/components/vault-dashboard/vaultDashboardCloudflareWorkerSelection";
import {
  isSelectableCloudflareWorker,
  readDefaultCloudflareWorkerSelection,
} from "@/components/vault-dashboard/vaultDashboardCloudflareWorkerSelection";
import {
  useVaultProviderObservations,
  type VaultCloudflareWorkerObservation,
  type VaultConvexProjectObservation,
  type VaultProviderObservationState,
} from "@/components/vault-dashboard/useVaultProviderObservations";

const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";

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
type VaultAppRootDialogTarget = {
  hasAppRoots: boolean;
  hasRootAppRoot: boolean;
  id: Id<"vaults">;
  repositoryFullName: string;
};
const EMPTY_APP_ROOT_FOLDER_SUGGESTIONS: readonly string[] = [];
type VaultCloudflareDialogTarget = {
  appId: Id<"vaultApps">;
  id: Id<"vaults">;
  repositoryFullName: string;
  repositoryName: string;
  rootDirectory: string;
};
type VaultConvexDialogTarget = {
  appId: Id<"vaultApps">;
  id: Id<"vaults">;
  repositoryFullName: string;
  repositoryName: string;
  rootDirectory: string;
};
type CloudflareWorkerConnectMode = "existing" | "create";
type ConvexProjectOption = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  teamSlug: string;
};
type ConvexProjectConnectMode = "existing" | "create";

function compareCloudflareWorkerOptions(
  left: CloudflareWorkerOption,
  right: CloudflareWorkerOption,
) {
  return (
    getCloudflareWorkerDiscoveryRank(left) - getCloudflareWorkerDiscoveryRank(right) ||
    left.workerName.localeCompare(right.workerName) ||
    left.workerTag.localeCompare(right.workerTag)
  );
}

function getCloudflareWorkerDiscoveryRank(worker: CloudflareWorkerOption): number {
  switch (worker.discovery.classification) {
    case "recommended":
      return 0;
    case "blocked":
      return worker.discovery.evidence.state === "same_repo_different_root" ? 1 : 4;
    case "available":
      return 2;
    case "unknown":
      return 3;
    default:
      worker.discovery.classification satisfies never;
      return 4;
  }
}

function formatCloudflareWorkerRepositoryEvidence(
  evidence: CloudflareWorkerRepositoryEvidence,
): string {
  switch (evidence.state) {
    case "none":
      return "No active Builds repo trigger";
    case "matching_repo":
      return `Builds repo ${formatCloudflareWorkerRepositoryLabel(evidence)}, root ${formatCloudflareWorkerRootLabel(evidence.rootDirectory)}`;
    case "same_repo_different_root":
      return `Builds root ${formatCloudflareWorkerRootLabel(evidence.rootDirectory)}, expected ${formatCloudflareWorkerRootLabel(evidence.expectedRootDirectory)}`;
    case "different_repo":
      return `Builds repo ${formatCloudflareWorkerRepositoryLabel(evidence)}`;
    case "deleted_repo_connection":
      return "Builds repo connection was deleted";
    case "missing_repo_id":
      return "Builds repo id missing";
    case "missing_root_directory":
      return `Builds root missing, expected ${formatCloudflareWorkerRootLabel(evidence.expectedRootDirectory)}`;
    case "trigger_read_failed":
      return "Builds triggers could not be read";
    default:
      evidence satisfies never;
      return "";
  }
}

function formatCloudflareWorkerRepositoryLabel(args: {
  repoId: string;
  repoName: string | null;
}): string {
  return args.repoName ? `${args.repoName} (${args.repoId})` : args.repoId;
}

function formatCloudflareWorkerRootLabel(rootDirectory: string): string {
  return rootDirectory === "/" ? "/" : rootDirectory;
}

function formatCloudflareWorkerDiscoveryLabel(worker: CloudflareWorkerOption): string {
  switch (worker.discovery.classification) {
    case "recommended":
      return "Recommended";
    case "available":
      return "Available";
    case "blocked":
      if (worker.discovery.evidence.state === "same_repo_different_root") {
        return "Same repo, different root";
      }
      return "Different repo";
    case "unknown":
      return "Cannot inspect";
    default:
      worker.discovery.classification satisfies never;
      return "";
  }
}

function formatCloudflareWorkerDiscoveryDescription(worker: CloudflareWorkerOption): string {
  return `${formatCloudflareWorkerDiscoveryLabel(worker)}: ${formatCloudflareWorkerRepositoryEvidence(worker.discovery.evidence)}`;
}

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
type ProviderAttachmentRemovalInFlight =
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

function buildConvexProjectOptionKey(project: ConvexProjectOption): string {
  return project.projectId;
}

function compareConvexProjectOption(left: ConvexProjectOption, right: ConvexProjectOption): number {
  return (
    left.projectName.localeCompare(right.projectName) ||
    left.projectSlug.localeCompare(right.projectSlug) ||
    left.projectId.localeCompare(right.projectId)
  );
}

export type VaultDeleteOptionKey =
  | "removeCodespaces"
  | "removeConvexProvision"
  | "removeGithubRepo"
  | "removeCloudflareProvision";
type AddAppRootMode = "app" | "monorepo";

type VaultDashboardLocalState = {
  addAppRootDialog: {
    appRoot: string;
    error: string | null;
    isSubmitting: boolean;
    mode: AddAppRootMode;
  };
  cloudflareConnectDialog: {
    accounts: CloudflareAccountOption[];
    appRoot: string;
    connectMode: CloudflareWorkerConnectMode;
    createWorkerName: string;
    error: string | null;
    isLoadingResources: boolean;
    isSubmittingWorker: boolean;
    selectedAccountId: string;
    selectedWorkerName: string;
    workers: CloudflareWorkerOption[];
  };
  convexConnectDialog: {
    appRoot: string;
    connectMode: ConvexProjectConnectMode;
    createProjectName: string;
    projects: ConvexProjectOption[];
    error: string | null;
    isLoadingResources: boolean;
    isSubmittingProject: boolean;
    selectedProjectId: string;
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
    appRoot: VAULT_ROOT_DIRECTORY,
    connectMode: "existing",
    createProjectName: "",
    projects: [],
    error: null,
    isLoadingResources: false,
    isSubmittingProject: false,
    selectedProjectId: "",
  };
}

function readVaultDashboardInitialLocalState(): VaultDashboardLocalState {
  return {
    addAppRootDialog: {
      appRoot: VAULT_ROOT_DIRECTORY,
      error: null,
      isSubmitting: false,
      mode: "app",
    },
    cloudflareConnectDialog: {
      accounts: [],
      appRoot: VAULT_ROOT_DIRECTORY,
      connectMode: "existing",
      createWorkerName: "",
      error: null,
      isLoadingResources: false,
      isSubmittingWorker: false,
      selectedAccountId: "",
      selectedWorkerName: "",
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
    resetAddAppRootDialogState: () => {
      setState((state) => ({
        ...state,
        addAppRootDialog: {
          appRoot: VAULT_ROOT_DIRECTORY,
          error: null,
          isSubmitting: false,
          mode: "app",
        },
      }));
    },
    prepareAddAppRootDialog: ({ hasAppRoots }: { hasAppRoots: boolean }) => {
      setState((state) => ({
        ...state,
        addAppRootDialog: {
          appRoot: hasAppRoots ? "" : VAULT_ROOT_DIRECTORY,
          error: null,
          isSubmitting: false,
          mode: hasAppRoots ? "monorepo" : "app",
        },
      }));
    },
    setAddAppRootDialogAppRoot: (appRoot: string) => {
      setState((state) => ({
        ...state,
        addAppRootDialog: { ...state.addAppRootDialog, appRoot, error: null },
      }));
    },
    setAddAppRootDialogMode: (mode: AddAppRootMode) => {
      setState((state) => ({
        ...state,
        addAppRootDialog: {
          ...state.addAppRootDialog,
          appRoot:
            mode === "app"
              ? VAULT_ROOT_DIRECTORY
              : state.addAppRootDialog.appRoot === VAULT_ROOT_DIRECTORY
                ? ""
                : state.addAppRootDialog.appRoot,
          error: null,
          mode,
        },
      }));
    },
    setAddAppRootDialogError: (error: string | null) => {
      setState((state) => ({
        ...state,
        addAppRootDialog: { ...state.addAppRootDialog, error },
      }));
    },
    setAddAppRootDialogSubmitting: (isSubmitting: boolean) => {
      setState((state) => ({
        ...state,
        addAppRootDialog: { ...state.addAppRootDialog, isSubmitting },
      }));
    },
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
          appRoot: VAULT_ROOT_DIRECTORY,
          connectMode: "existing",
          createWorkerName: "",
          error: null,
          isLoadingResources: false,
          isSubmittingWorker: false,
          selectedAccountId: "",
          selectedWorkerName: "",
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
    setCloudflareConnectDialogAppRoot: (appRoot: string) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, appRoot },
      }));
    },
    setCloudflareConnectDialogConnectMode: (connectMode: CloudflareWorkerConnectMode) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, connectMode },
      }));
    },
    setCloudflareConnectDialogCreateWorkerName: (createWorkerName: string) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, createWorkerName },
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
    setCloudflareConnectDialogSelectedAccountId: (selectedAccountId: string) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, selectedAccountId },
      }));
    },
    setCloudflareConnectDialogSelectedWorkerName: (selectedWorkerName: string) => {
      setState((state) => ({
        ...state,
        cloudflareConnectDialog: { ...state.cloudflareConnectDialog, selectedWorkerName },
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
          selectedWorkerName: readDefaultCloudflareWorkerSelection(
            workers,
            state.cloudflareConnectDialog.selectedWorkerName,
          ),
          workers,
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
    setConvexConnectDialogAppRoot: (appRoot: string) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: { ...state.convexConnectDialog, appRoot },
      }));
    },
    setConvexConnectDialogProjects: (projects: ConvexProjectOption[]) => {
      const sortedProjects = [...projects].sort(compareConvexProjectOption);
      setState((state) => ({
        ...state,
        convexConnectDialog: {
          ...state.convexConnectDialog,
          projects: sortedProjects,
          selectedProjectId: sortedProjects[0]
            ? buildConvexProjectOptionKey(sortedProjects[0])
            : "",
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
    setConvexConnectDialogSelectedProjectId: (selectedProjectId: string) => {
      setState((state) => ({
        ...state,
        convexConnectDialog: { ...state.convexConnectDialog, selectedProjectId },
      }));
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

export function VaultDashboardAppRootDialog({
  appRoot,
  error,
  folderSuggestions,
  isSubmitting,
  mode,
  onAppRootChange,
  onModeChange,
  onOpenChange,
  onSubmit,
  open,
  vault,
}: {
  appRoot: string;
  error: string | null;
  folderSuggestions: readonly string[];
  isSubmitting: boolean;
  mode: AddAppRootMode;
  onAppRootChange: (appRoot: string) => void;
  onModeChange: (mode: AddAppRootMode) => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: () => void;
  open: boolean;
  vault: VaultAppRootDialogTarget | null;
}) {
  const canSelectAppMode = vault ? !vault.hasAppRoots : false;
  const effectiveMode = canSelectAppMode ? mode : "monorepo";
  const isRepositoryAppMode = effectiveMode === "app";
  const showAppRootInput = !isRepositoryAppMode;
  const submitDisabled = isSubmitting || (showAppRootInput && !appRoot.trim());
  const submitLabel = isRepositoryAppMode ? "Use as app" : "Add app root";
  const title = vault ? `Add app root ${vault.repositoryFullName}` : "Add app root";
  const description = canSelectAppMode
    ? "Choose whether this repository is one app or a monorepo."
    : vault?.hasRootAppRoot
      ? "Add a folder app root to convert this repository to a monorepo."
      : "Add another folder app root.";
  const appRootSuggestionContainerRef = useRef<HTMLDivElement>(null);
  const appRootSuggestionListId = useId();
  const [appRootSuggestionsOpen, setAppRootSuggestionsOpen] = useState(false);
  const [selectedAppRootSuggestionIndex, setSelectedAppRootSuggestionIndex] = useState<
    number | null
  >(null);
  const appRootQuery = appRoot.trim();
  const appRootSuggestionMatches = useMemo(() => {
    if (!showAppRootInput || appRootQuery.length === 0) {
      return [];
    }

    return rankFuzzyPathMatches({
      paths: folderSuggestions,
      query: appRootQuery,
      limit: 8,
    });
  }, [appRootQuery, folderSuggestions, showAppRootInput]);
  const showAppRootSuggestions =
    appRootSuggestionsOpen && showAppRootInput && appRootSuggestionMatches.length > 0;
  const activeAppRootSuggestionIndex =
    selectedAppRootSuggestionIndex === null || appRootSuggestionMatches.length === 0
      ? null
      : Math.min(selectedAppRootSuggestionIndex, appRootSuggestionMatches.length - 1);
  const selectedAppRootSuggestion =
    showAppRootSuggestions && activeAppRootSuggestionIndex !== null
      ? appRootSuggestionMatches[activeAppRootSuggestionIndex]
      : undefined;
  const activeAppRootSuggestionId = selectedAppRootSuggestion
    ? `${appRootSuggestionListId}-${activeAppRootSuggestionIndex}`
    : undefined;
  useEffect(() => {
    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      const container = appRootSuggestionContainerRef.current;
      if (container && !container.contains(event.target)) {
        setAppRootSuggestionsOpen(false);
        setSelectedAppRootSuggestionIndex(null);
      }
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, []);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitDisabled) {
      return;
    }
    onSubmit();
  };
  const handleAppRootSuggestionSelect = (folderPath: string) => {
    onAppRootChange(folderPath);
    setAppRootSuggestionsOpen(false);
    setSelectedAppRootSuggestionIndex(null);
  };
  const handleAppRootInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        if (appRootSuggestionMatches.length > 0) {
          event.preventDefault();
          setAppRootSuggestionsOpen(true);
          setSelectedAppRootSuggestionIndex((current) =>
            current === null || !appRootSuggestionsOpen
              ? 0
              : Math.min(current + 1, appRootSuggestionMatches.length - 1),
          );
        }
        return;
      case "ArrowUp":
        if (appRootSuggestionMatches.length > 0) {
          event.preventDefault();
          setAppRootSuggestionsOpen(true);
          setSelectedAppRootSuggestionIndex((current) =>
            current === null || !appRootSuggestionsOpen
              ? appRootSuggestionMatches.length - 1
              : Math.max(current - 1, 0),
          );
        }
        return;
      case "Enter":
        if (selectedAppRootSuggestion) {
          event.preventDefault();
          handleAppRootSuggestionSelect(selectedAppRootSuggestion.path);
        }
        return;
      case "Escape":
        if (appRootSuggestionsOpen) {
          event.preventDefault();
          event.stopPropagation();
          setAppRootSuggestionsOpen(false);
          setSelectedAppRootSuggestionIndex(null);
        }
        return;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {vault ? (
            <div className="space-y-3">
              {canSelectAppMode ? (
                <div className="grid grid-cols-2" role="group" aria-label="App root mode">
                  <button
                    type="button"
                    className={clsx(
                      buttonVariants({
                        variant: isRepositoryAppMode ? "default" : "outline",
                        size: "sm",
                      }),
                      "rounded-r-none",
                    )}
                    aria-pressed={isRepositoryAppMode}
                    onClick={() => onModeChange("app")}
                    disabled={isSubmitting}
                  >
                    App
                  </button>
                  <button
                    type="button"
                    className={clsx(
                      buttonVariants({
                        variant: isRepositoryAppMode ? "outline" : "default",
                        size: "sm",
                      }),
                      "rounded-l-none border-l-0",
                    )}
                    aria-pressed={!isRepositoryAppMode}
                    onClick={() => onModeChange("monorepo")}
                    disabled={isSubmitting}
                  >
                    Monorepo
                  </button>
                </div>
              ) : null}
              {showAppRootInput ? (
                <div ref={appRootSuggestionContainerRef} className="relative">
                  <Input
                    aria-activedescendant={activeAppRootSuggestionId}
                    aria-autocomplete="list"
                    aria-controls={showAppRootSuggestions ? appRootSuggestionListId : undefined}
                    aria-expanded={showAppRootSuggestions}
                    aria-label="App root"
                    autoComplete="off"
                    value={appRoot}
                    onChange={(event) => {
                      const nextAppRoot = event.target.value;
                      onAppRootChange(nextAppRoot);
                      setAppRootSuggestionsOpen(nextAppRoot.trim().length > 0);
                      setSelectedAppRootSuggestionIndex(null);
                    }}
                    onFocus={() => setAppRootSuggestionsOpen(appRootQuery.length > 0)}
                    onKeyDown={handleAppRootInputKeyDown}
                    disabled={isSubmitting}
                    placeholder="apps/samebase"
                  />
                  {showAppRootSuggestions ? (
                    <div
                      id={appRootSuggestionListId}
                      role="listbox"
                      aria-label="App root suggestions"
                      className="corner-notch-1 absolute z-50 mt-1 max-h-56 w-full overflow-y-auto border bg-popover text-popover-foreground shadow-md"
                    >
                      {appRootSuggestionMatches.map((suggestion, index) => (
                        <button
                          key={suggestion.path}
                          id={`${appRootSuggestionListId}-${index}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeAppRootSuggestionIndex}
                          className={clsx(
                            "block w-full cursor-pointer truncate px-3 py-2 text-left font-mono text-sm hover:bg-accent hover:text-accent-foreground",
                            index === activeAppRootSuggestionIndex &&
                              "bg-accent text-accent-foreground",
                          )}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            handleAppRootSuggestionSelect(suggestion.path);
                          }}
                          onClick={() => handleAppRootSuggestionSelect(suggestion.path)}
                        >
                          {highlightMatches(suggestion.path, suggestion.matches)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {error ? <div className="text-sm text-red-600">{error}</div> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </AppDialogContent>
    </Dialog>
  );
}

export function VaultDashboardConvexDialog({
  appRoot,
  appRootReadOnly,
  createProjectName,
  projects,
  error,
  isLoading,
  isSubmitting,
  mode,
  onCreateProjectNameChange,
  onAppRootChange,
  onProjectChange,
  onModeChange,
  onOpenChange,
  onSubmit,
  open,
  selectedProjectId,
  vault,
}: {
  appRoot: string;
  appRootReadOnly: boolean;
  createProjectName: string;
  projects: ConvexProjectOption[];
  error: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  mode: ConvexProjectConnectMode;
  onAppRootChange: (appRoot: string) => void;
  onCreateProjectNameChange: (projectName: string) => void;
  onProjectChange: (projectId: string) => void;
  onModeChange: (mode: ConvexProjectConnectMode) => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: () => void;
  open: boolean;
  selectedProjectId: string;
  vault: VaultConvexDialogTarget | null;
}) {
  const sortedProjects = [...projects].sort(compareConvexProjectOption);
  const selectedProject = sortedProjects.find(
    (project) => buildConvexProjectOptionKey(project) === selectedProjectId,
  );
  const showAppRootInput = appRoot !== VAULT_ROOT_DIRECTORY;
  const submitDisabled =
    isLoading ||
    isSubmitting ||
    !appRoot.trim() ||
    (mode === "existing" ? !selectedProject : !createProjectName.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>
            {vault ? `Connect Convex ${vault.repositoryFullName}` : "Connect Convex"}
          </DialogTitle>
          <DialogDescription>Convex project.</DialogDescription>
        </DialogHeader>
        {vault ? (
          <div className="space-y-3">
            {showAppRootInput ? (
              <Input
                value={appRoot}
                onChange={(event) => onAppRootChange(event.target.value)}
                disabled={isLoading || isSubmitting}
                readOnly={appRootReadOnly}
                aria-label="App root"
                placeholder="App root"
              />
            ) : null}
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
            {mode === "existing" ? (
              <Select
                // The dialog owns modality; a second modal lock here can shift mobile focus/scroll during open.
                modal={false}
                value={selectedProjectId}
                onValueChange={onProjectChange}
                disabled={isLoading || sortedProjects.length === 0}
              >
                <SelectTrigger aria-label="Convex project" className="w-full">
                  <SelectValue placeholder={isLoading ? "Loading projects" : "Convex project"}>
                    {selectedProject ? selectedProject.projectName : undefined}
                  </SelectValue>
                </SelectTrigger>
                <AppSelectContent>
                  {sortedProjects.map((project) => {
                    const key = buildConvexProjectOptionKey(project);
                    return (
                      <AppSelectItem key={key} value={key}>
                        {project.projectName}
                      </AppSelectItem>
                    );
                  })}
                </AppSelectContent>
              </Select>
            ) : (
              <Input
                value={createProjectName}
                onChange={(event) => onCreateProjectNameChange(event.target.value)}
                disabled={isLoading || isSubmitting}
                placeholder="Project name"
              />
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
            {mode === "existing" ? "Connect Project" : "Create Project"}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}

export function VaultDashboardCloudflareDialog({
  accounts,
  appRoot,
  appRootReadOnly,
  createWorkerName,
  error,
  isLoading,
  isSubmitting,
  mode,
  onAccountChange,
  onAppRootChange,
  onCreateWorkerNameChange,
  onModeChange,
  onOpenChange,
  onSubmit,
  onWorkerChange,
  open,
  selectedAccountId,
  selectedWorkerName,
  vault,
  workers,
}: {
  accounts: CloudflareAccountOption[];
  appRoot: string;
  appRootReadOnly: boolean;
  createWorkerName: string;
  error: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  mode: CloudflareWorkerConnectMode;
  onAccountChange: (accountId: string) => void;
  onAppRootChange: (appRoot: string) => void;
  onCreateWorkerNameChange: (workerName: string) => void;
  onModeChange: (mode: CloudflareWorkerConnectMode) => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: () => void;
  onWorkerChange: (workerName: string) => void;
  open: boolean;
  selectedAccountId: string;
  selectedWorkerName: string;
  vault: VaultCloudflareDialogTarget | null;
  workers: CloudflareWorkerOption[];
}) {
  const sortedAccounts = useMemo(
    () => [...accounts].sort(compareCloudflareAccountOptions),
    [accounts],
  );
  const sortedWorkers = useMemo(() => [...workers].sort(compareCloudflareWorkerOptions), [workers]);
  const selectedAccount = sortedAccounts.find((account) => account.accountId === selectedAccountId);
  const selectedWorker = sortedWorkers.find((worker) => worker.workerName === selectedWorkerName);
  const selectedWorkerSelectable = selectedWorker
    ? isSelectableCloudflareWorker(selectedWorker)
    : false;
  const showAppRootInput = appRoot !== VAULT_ROOT_DIRECTORY;
  const submitDisabled =
    isLoading ||
    isSubmitting ||
    !appRoot.trim() ||
    !selectedAccountId ||
    (mode === "existing"
      ? !selectedWorkerName || !selectedWorkerSelectable
      : !createWorkerName.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>
            {vault ? `Connect Cloudflare ${vault.repositoryFullName}` : "Connect Cloudflare"}
          </DialogTitle>
          <DialogDescription>Choose a Cloudflare account and Worker.</DialogDescription>
        </DialogHeader>
        {vault ? (
          <div className="space-y-3">
            <Select value={selectedAccountId} onValueChange={onAccountChange} disabled={isLoading}>
              <SelectTrigger aria-label="Cloudflare account" className="w-full">
                <SelectValue placeholder={isLoading ? "Loading accounts" : "Cloudflare account"}>
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
            {showAppRootInput ? (
              <Input
                value={appRoot}
                onChange={(event) => onAppRootChange(event.target.value)}
                disabled={isLoading || isSubmitting}
                readOnly={appRootReadOnly}
                aria-label="App root"
                placeholder="App root"
              />
            ) : null}
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
            {mode === "existing" ? (
              <Select
                // The dialog owns modality; a second modal lock here can shift mobile focus/scroll during open.
                modal={false}
                value={selectedWorkerName}
                onValueChange={onWorkerChange}
                disabled={isLoading || workers.length === 0}
              >
                <SelectTrigger aria-label="Cloudflare Worker" className="w-full">
                  <SelectValue placeholder={isLoading ? "Loading Workers" : "Cloudflare Worker"}>
                    {selectedWorker?.workerName}
                  </SelectValue>
                </SelectTrigger>
                <AppSelectContent>
                  {sortedWorkers.map((worker) => (
                    <AppSelectItem
                      key={worker.workerTag}
                      value={worker.workerName}
                      disabled={!isSelectableCloudflareWorker(worker)}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span>{worker.workerName}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatCloudflareWorkerDiscoveryDescription(worker)}
                        </span>
                      </span>
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </Select>
            ) : (
              <Input
                value={createWorkerName}
                onChange={(event) => onCreateWorkerNameChange(event.target.value)}
                disabled={isLoading || isSubmitting}
                placeholder="Worker name"
              />
            )}
            {mode === "existing" && selectedWorker ? (
              <div className="text-xs text-muted-foreground">
                {formatCloudflareWorkerDiscoveryDescription(selectedWorker)}
              </div>
            ) : null}
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
            {mode === "existing" ? "Connect Worker" : "Create Worker"}
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
  const stepLabel = formatVaultSourceSetupStep(providerSetup.step);
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
  cloudflareObservations: VaultProviderObservationState<VaultCloudflareWorkerObservation>;
  cloudflareWorkerConfigurationActionInFlight: CloudflareWorkerConfigurationActionInFlight | null;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  isRemovingVault: boolean;
  providerAttachmentRemovalInFlight: ProviderAttachmentRemovalInFlight | null;
  pullRequestObservation: VaultPullRequestObservation;
  retryingDeletionRunId: Id<"workflow_vaultDeletion_runs"> | null;
  retryingInfrastructureVaultId: Id<"vaults"> | null;
  now: number;
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
  ) => void;
  onRotateConvexDeployKeysForWorkersBuilds: (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => void;
  onOpenDeveloperToolsChange: (vaultId: Id<"vaults">, isOpen: boolean) => void;
  onRemoveMissingCloudflareWorker: (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
  ) => void;
  onRemoveMissingConvexProject: (
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
  appRoot,
  currentSearch,
  provider,
}: {
  appRoot: string | null;
  currentSearch: RootRouteSearch;
  provider: "cloudflare" | "convex";
}): RootRouteSearch {
  const appRootPatch = {
    [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]: appRoot,
  };

  return provider === "convex"
    ? applySearchPatch(currentSearch, {
        "add-convex": true,
        "add-cloudflare": null,
        ...appRootPatch,
        [DASHBOARD_ADD_APP_ROOT_QUERY_PARAM]: null,
        delete: null,
      })
    : applySearchPatch(currentSearch, {
        "add-cloudflare": true,
        "add-convex": null,
        ...appRootPatch,
        [DASHBOARD_ADD_APP_ROOT_QUERY_PARAM]: null,
        delete: null,
      });
}

function applyVaultDashboardAddAppRootSearch(currentSearch: RootRouteSearch): RootRouteSearch {
  return applySearchPatch(currentSearch, {
    [DASHBOARD_ADD_APP_ROOT_QUERY_PARAM]: true,
    [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]: null,
    "add-cloudflare": null,
    "add-convex": null,
    delete: null,
  });
}

function buildVaultDashboardProviderAddHref({
  appRoot,
  dashboardRoutePathname,
  provider,
  rootRouteSearch,
}: {
  appRoot: string;
  dashboardRoutePathname: string;
  provider: "cloudflare" | "convex";
  rootRouteSearch: RootRouteSearch;
}): string {
  return buildPathWithTanStackSearch({
    pathname: dashboardRoutePathname,
    search: applyVaultDashboardProviderAddSearch({
      appRoot,
      currentSearch: rootRouteSearch,
      provider,
    }),
  });
}

function buildVaultDashboardAddAppRootHref({
  dashboardRoutePathname,
  rootRouteSearch,
}: {
  dashboardRoutePathname: string;
  rootRouteSearch: RootRouteSearch;
}): string {
  return buildPathWithTanStackSearch({
    pathname: dashboardRoutePathname,
    search: applyVaultDashboardAddAppRootSearch(rootRouteSearch),
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
                      [DASHBOARD_ADD_APP_ROOT_QUERY_PARAM]: null,
                      [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]: null,
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
  providerAttachmentRemovalInFlight,
  pullRequestObservation,
  retryingDeletionRunId,
  retryingInfrastructureVaultId,
  now,
  viewModel,
  logoRouteSearch,
  replaceLogoRouteSearch,
  openDeveloperToolsByVaultId,
  persistedVaultPullRequestFiltersByVaultId,
  persistedVaultResourceLinksOpenByVaultId,
  rootRouteSearch,
  onConfigureWorkersBuildsForGitHub,
  onRotateConvexDeployKeysForWorkersBuilds,
  onOpenDeveloperToolsChange,
  onRemoveMissingCloudflareWorker,
  onRemoveMissingConvexProject,
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
    ({ appRoot, provider }: { appRoot: string; provider: "cloudflare" | "convex" }) => {
      void navigate({
        resetScroll: false,
        to: ".",
        search: (currentSearch) =>
          applyVaultDashboardProviderAddSearch({
            appRoot,
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
  const openAppRootAddDialog = useCallback(() => {
    void navigate({
      resetScroll: false,
      to: ".",
      search: applyVaultDashboardAddAppRootSearch,
      state: (currentState) => ({
        ...currentState,
        vaultDashboardDialog: "add-app-root",
      }),
    });
  }, [navigate]);

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
        const isReady = vault.state === "ready" && !isDeletingVault;
        const vaultPullRequestFilters =
          persistedVaultPullRequestFiltersByVaultId.get(vault._id) ??
          getDefaultVaultPullRequestFilters();
        const vaultResourceLinksOpen =
          persistedVaultResourceLinksOpenByVaultId.get(vault._id) ?? false;
        const settledPullRequests =
          pullRequestObservation.state === "current" || pullRequestObservation.state === "stale"
            ? pullRequestObservation
            : null;
        const primaryBranch =
          settledPullRequests?.page.defaultBranch.state === "ready"
            ? settledPullRequests.page.defaultBranch.name
            : null;
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
          buildAddAppRootHref: () =>
            buildVaultDashboardAddAppRootHref({
              dashboardRoutePathname,
              rootRouteSearch,
            }),
          addAppRootOnClick: () => {
            openAppRootAddDialog();
          },
          buildAddCloudflareWorkerHref: (rootDirectory) =>
            buildVaultDashboardProviderAddHref({
              appRoot: rootDirectory,
              dashboardRoutePathname,
              provider: "cloudflare",
              rootRouteSearch,
            }),
          addCloudflareWorkerOnClick: (_appId, rootDirectory) => {
            openProviderAddDialog({ appRoot: rootDirectory, provider: "cloudflare" });
          },
          buildAddConvexHref: (rootDirectory) =>
            buildVaultDashboardProviderAddHref({
              appRoot: rootDirectory,
              dashboardRoutePathname,
              provider: "convex",
              rootRouteSearch,
            }),
          addConvexOnClick: (_appId, rootDirectory) => {
            openProviderAddDialog({ appRoot: rootDirectory, provider: "convex" });
          },
          configureWorkersBuildsForGitHubOnClick: isCloudflareWorkerConfigurationActionInFlight
            ? undefined
            : (workerId) => {
                onConfigureWorkersBuildsForGitHub(vault._id, workerId);
              },
          cloudflareObservations,
          convexObservations,
          githubRepositoryUrl,
          isConfiguringWorkersBuildsForGitHub: (workerId) =>
            cloudflareWorkerConfigurationActionInFlight?.kind ===
              "configure_workers_builds_for_github" &&
            cloudflareWorkerConfigurationActionInFlight.vaultId === vault._id &&
            cloudflareWorkerConfigurationActionInFlight.workerId === workerId,
          isRemovingMissingCloudflareWorker: (workerId) =>
            providerAttachmentRemovalInFlight?.provider === "cloudflare" &&
            providerAttachmentRemovalInFlight.vaultId === vault._id &&
            providerAttachmentRemovalInFlight.workerId === workerId,
          isRemovingMissingConvexProject: (convexProjectId) =>
            providerAttachmentRemovalInFlight?.provider === "convex" &&
            providerAttachmentRemovalInFlight.vaultId === vault._id &&
            providerAttachmentRemovalInFlight.convexProjectId === convexProjectId,
          isRotatingConvexDeployKeysForWorkersBuilds: (workerId, convexProjectId) =>
            cloudflareWorkerConfigurationActionInFlight?.kind ===
              "rotate_convex_deploy_keys_for_workers_builds" &&
            cloudflareWorkerConfigurationActionInFlight.vaultId === vault._id &&
            cloudflareWorkerConfigurationActionInFlight.workerId === workerId &&
            cloudflareWorkerConfigurationActionInFlight.convexProjectId === convexProjectId,
          vault,
          removeMissingCloudflareWorkerOnClick: providerAttachmentRemovalInFlight
            ? undefined
            : (workerId) => {
                onRemoveMissingCloudflareWorker(vault._id, workerId);
              },
          removeMissingConvexProjectOnClick: providerAttachmentRemovalInFlight
            ? undefined
            : (convexProjectId) => {
                onRemoveMissingConvexProject(vault._id, convexProjectId);
              },
          rotateConvexDeployKeysForWorkersBuildsOnClick:
            isCloudflareWorkerConfigurationActionInFlight
              ? undefined
              : (workerId, convexProjectId) => {
                  onRotateConvexDeployKeysForWorkersBuilds(vault._id, workerId, convexProjectId);
                },
        });
        const pullRequestFilterOptions = buildVaultPullRequestFilterOptions({
          pullRequests: settledPullRequests?.page.pullRequests ?? [],
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
          !isReady && activeSourceSetup ? (
            <VaultSourceSetupSection sourceSetup={activeSourceSetup} />
          ) : undefined;
        const providerSetupStatus = isReady
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
        const pullRequestSection = isReady ? (
          <VaultPullRequestList
            buildSamebaseUrl={(branchName) =>
              buildVaultPullRequestRoute({
                repositoryFullName: vault.repositoryFullName,
                branchName,
              })
            }
            now={now}
            observation={pullRequestObservation}
            repositoryFullName={vault.repositoryFullName}
          />
        ) : undefined;
        return (
          <div key={vault._id} data-vault-dashboard-repository-card="">
            <VaultDashboardRepositoryCard
              isReady={isReady}
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
                ) : vault.state === "failed" ? (
                  <span className="shrink-0 text-xs font-normal text-destructive">(failed)</span>
                ) : !isReady ? (
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
                isReady ? (
                  <VaultPullRequestHeaderControls
                    filterOptions={pullRequestFilterOptions}
                    filters={vaultPullRequestFilters}
                    onChangeFilters={(nextVaultPullRequestFilters) => {
                      onSaveVaultPullRequestFilters(vault._id, nextVaultPullRequestFilters);
                    }}
                  />
                ) : undefined
              }
              primarySection={pullRequestSection}
              developerToolsSection={
                isReady || hasProvisioningLog
                  ? {
                      open: developerToolsOpen,
                      visible: developerToolsVisible,
                      onOpenChange: (isOpen: boolean) => {
                        onOpenDeveloperToolsChange(vault._id, isOpen);
                      },
                      content: (
                        <>
                          {isReady && CODESPACES_ENABLED ? (
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
  const now = useNow();
  const deleteVault = useAction(api.vault.actions.deleteVault);
  const retryDeleteVault = useAction(api.vault.actions.retryDeleteVault);
  const retryInfrastructureProvisioning = useAction(
    api.vault.actions.retryInfrastructureProvisioning,
  );
  const commitStaging = useAction(api.fileStagingActions.commitStaging);
  const listConvexProjects = useAction(api.vault.convex.listProjects);
  const connectExistingConvexProject = useAction(api.vault.convex.connectExistingProject);
  const createConvexProject = useAction(api.vault.convex.createProject);
  const listCloudflareAccounts = useAction(api.vault.cloudflare.listAccounts);
  const listCloudflareWorkers = useAction(api.vault.cloudflare.listWorkers);
  const connectExistingCloudflareWorker = useAction(api.vault.cloudflare.connectExistingWorker);
  const createCloudflareWorker = useAction(api.vault.cloudflare.createWorker);
  const removeMissingCloudflareWorker = useAction(api.vault.cloudflare.removeMissingWorker);
  const removeMissingConvexProject = useAction(api.vault.convex.removeMissingProject);
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
  const [providerAttachmentRemovalInFlight, setProviderAttachmentRemovalInFlight] =
    useState<ProviderAttachmentRemovalInFlight | null>(null);
  const createVaultApp = useMutation(api.vault.dashboard.createVaultApp);
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
    return normalizeVaultPullRequestFilters(savedFilters);
  }, [selectedVault?._id, userVaultPullRequestFilters]);
  const pullRequestObservation = useVaultPullRequestObservations({
    vault:
      selectedVault?.state === "ready" && selectedVault.deletion.state === "not_deleting"
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
  const addAppRootModeActive = rootRouteSearch[DASHBOARD_ADD_APP_ROOT_QUERY_PARAM] === true;
  const deleteModeActive = rootRouteSearch.delete === true;
  const addConvexModeActive = rootRouteSearch["add-convex"] === true;
  const addCloudflareWorkerModeActive = rootRouteSearch["add-cloudflare"] === true;
  const providerAddAppRoot = rootRouteSearch[DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM] ?? null;
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
  const preparedAddAppRootRepositoryRef = useRef<string | null>(null);
  const preparedDeleteRepositoryRef = useRef<string | null>(null);
  const preparedAddConvexRepositoryRef = useRef<string | null>(null);
  const preparedAddCloudflareWorkerRepositoryRef = useRef<string | null>(null);
  const convexDialogResourcesRequestIdRef = useRef(0);
  const cloudflareWorkersRequestIdRef = useRef(0);
  const cloudflareDialogResourcesRequestIdRef = useRef(0);
  const dashboardLocalStore = useVaultDashboardLocalStore();
  const {
    addAppRootDialog,
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
    appRoot: addAppRootValue,
    error: addAppRootError,
    isSubmitting: isSubmittingAppRoot,
    mode: addAppRootMode,
  } = addAppRootDialog;
  const {
    accounts: cloudflareAccounts,
    appRoot: cloudflareAppRoot,
    connectMode: cloudflareConnectMode,
    createWorkerName: cloudflareCreateWorkerName,
    error: cloudflareDialogError,
    isLoadingResources: isLoadingCloudflareResources,
    isSubmittingWorker: isSubmittingCloudflareWorker,
    selectedAccountId: selectedCloudflareAccountId,
    selectedWorkerName: selectedCloudflareWorkerName,
    workers: cloudflareWorkers,
  } = cloudflareConnectDialog;
  const {
    appRoot: convexAppRoot,
    connectMode: convexConnectMode,
    createProjectName: convexCreateProjectName,
    projects: convexProjects,
    error: convexDialogError,
    isLoadingResources: isLoadingConvexResources,
    isSubmittingProject: isSubmittingConvexProject,
    selectedProjectId: selectedConvexProjectId,
  } = convexConnectDialog;
  const selectedConvexProject = convexProjects.find(
    (project) => buildConvexProjectOptionKey(project) === selectedConvexProjectId,
  );
  const {
    resetAddAppRootDialogState,
    markCommitAttempted,
    prepareAddAppRootDialog,
    prepareDeleteDialog,
    resetCloudflareConnectDialogState,
    resetConvexConnectDialogState,
    resetDeleteDialogState,
    setAddAppRootDialogAppRoot,
    setAddAppRootDialogError,
    setAddAppRootDialogMode,
    setAddAppRootDialogSubmitting,
    setCloudflareConnectDialogAccounts,
    setCloudflareConnectDialogAppRoot,
    setCloudflareConnectDialogConnectMode,
    setCloudflareConnectDialogCreateWorkerName,
    setCloudflareConnectDialogError,
    setCloudflareConnectDialogLoading,
    setCloudflareConnectDialogSelectedAccountId,
    setCloudflareConnectDialogSelectedWorkerName,
    setCloudflareConnectDialogSubmitting,
    setCloudflareConnectDialogWorkers,
    setConvexConnectDialogAppRoot,
    setCommitError,
    setConvexConnectDialogConnectMode,
    setConvexConnectDialogCreateProjectName,
    setConvexConnectDialogProjects,
    setConvexConnectDialogError,
    setConvexConnectDialogLoading,
    setConvexConnectDialogSelectedProjectId,
    setConvexConnectDialogSubmitting,
    setDeleteError,
    setDeleteOption,
    setDeveloperToolsOpen,
    setGlobalChatAutoFocus,
    setGlobalChatBusy,
    setIsCommitting,
    setIsDeleting,
    setRetryingDeletionRunId,
  } = dashboardLocalStore.actions;

  const addAppRootDialogVault = addAppRootModeActive ? selectedVault : null;
  const vaultToAddAppRoot = useMemo(
    () =>
      addAppRootDialogVault?.state === "ready"
        ? {
            hasAppRoots: addAppRootDialogVault.apps.length > 0,
            hasRootAppRoot: addAppRootDialogVault.apps.some(
              (app) => app.rootDirectory === VAULT_ROOT_DIRECTORY,
            ),
            id: addAppRootDialogVault._id,
            repositoryFullName: addAppRootDialogVault.repositoryFullName,
          }
        : null,
    [addAppRootDialogVault],
  );
  const deleteDialogVault = deleteModeActive ? selectedVault : null;
  const canOpenDeleteDialog =
    deleteDialogVault?.deletion.state === "not_deleting" &&
    deleteDialogVault.deletion.deleteAction.state === "available";
  const vaultToDelete =
    deleteDialogVault && canOpenDeleteDialog ? buildVaultDeleteIntent(deleteDialogVault) : null;
  const addConvexDialogVault = addConvexModeActive ? selectedVault : null;
  const vaultToConnectConvex = useMemo(() => {
    if (addConvexDialogVault?.state !== "ready" || providerAddAppRoot === null) {
      return null;
    }
    const app = addConvexDialogVault.apps.find(
      (candidate) => candidate.rootDirectory === providerAddAppRoot,
    );
    if (!app) {
      return null;
    }

    return {
      appId: app.appId,
      id: addConvexDialogVault._id,
      repositoryFullName: addConvexDialogVault.repositoryFullName,
      repositoryName: addConvexDialogVault.ghRepoName,
      rootDirectory: app.rootDirectory,
    };
  }, [addConvexDialogVault, providerAddAppRoot]);
  const addCloudflareWorkerDialogVault = addCloudflareWorkerModeActive ? selectedVault : null;
  const vaultToConnectCloudflare = useMemo(() => {
    if (addCloudflareWorkerDialogVault?.state !== "ready" || providerAddAppRoot === null) {
      return null;
    }
    const app = addCloudflareWorkerDialogVault.apps.find(
      (candidate) => candidate.rootDirectory === providerAddAppRoot,
    );
    if (!app) {
      return null;
    }

    return {
      appId: app.appId,
      id: addCloudflareWorkerDialogVault._id,
      repositoryFullName: addCloudflareWorkerDialogVault.repositoryFullName,
      repositoryName: addCloudflareWorkerDialogVault.ghRepoName,
      rootDirectory: app.rootDirectory,
    };
  }, [addCloudflareWorkerDialogVault, providerAddAppRoot]);
  const stagedChangesCount = deleteDialogVault?.fileCount ?? 0;
  const addAppRootFolderSuggestions = useConvexQuery(
    api.vault.dashboard.listVaultRootDirectorySuggestions,
    vaultToAddAppRoot ? { vaultId: vaultToAddAppRoot.id } : "skip",
  );
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
          [DASHBOARD_ADD_APP_ROOT_QUERY_PARAM]: null,
          [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]: null,
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

  const loadConvexDialogResources = useCallback(async () => {
    const requestId = convexDialogResourcesRequestIdRef.current + 1;
    convexDialogResourcesRequestIdRef.current = requestId;
    setConvexConnectDialogLoading(true);
    setConvexConnectDialogError(null);
    try {
      const projects = await listConvexProjects({});
      if (convexDialogResourcesRequestIdRef.current !== requestId) {
        return;
      }
      setConvexConnectDialogProjects(projects);
    } catch (error) {
      if (convexDialogResourcesRequestIdRef.current !== requestId) {
        return;
      }
      setConvexConnectDialogError(
        error instanceof Error ? error.message : "Could not load Convex projects.",
      );
    } finally {
      if (convexDialogResourcesRequestIdRef.current === requestId) {
        setConvexConnectDialogLoading(false);
      }
    }
  }, [
    listConvexProjects,
    setConvexConnectDialogProjects,
    setConvexConnectDialogError,
    setConvexConnectDialogLoading,
  ]);

  const resetConvexDialogState = useCallback(() => {
    convexDialogResourcesRequestIdRef.current += 1;
    resetConvexConnectDialogState();
  }, [resetConvexConnectDialogState]);

  const loadCloudflareWorkersForAccount = useCallback(
    async (args: { accountId: string; vaultId: Id<"vaults">; appId: Id<"vaultApps"> }) => {
      const requestId = cloudflareWorkersRequestIdRef.current + 1;
      cloudflareWorkersRequestIdRef.current = requestId;
      setCloudflareConnectDialogLoading(true);
      setCloudflareConnectDialogWorkers([]);
      try {
        const workers = await listCloudflareWorkers({
          accountId: args.accountId,
          vaultId: args.vaultId,
          appId: args.appId,
        });
        if (cloudflareWorkersRequestIdRef.current !== requestId) {
          return;
        }
        setCloudflareConnectDialogWorkers(workers);
      } catch (error) {
        if (cloudflareWorkersRequestIdRef.current !== requestId) {
          return;
        }
        setCloudflareConnectDialogError(
          error instanceof Error ? error.message : "Could not load Cloudflare Workers.",
        );
      } finally {
        if (cloudflareWorkersRequestIdRef.current === requestId) {
          setCloudflareConnectDialogLoading(false);
        }
      }
    },
    [
      listCloudflareWorkers,
      setCloudflareConnectDialogError,
      setCloudflareConnectDialogLoading,
      setCloudflareConnectDialogWorkers,
    ],
  );

  const loadCloudflareDialogResources = useCallback(
    async (args: {
      preferredAccountId: string | undefined;
      vaultId: Id<"vaults">;
      appId: Id<"vaultApps">;
    }) => {
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
          appId: args.appId,
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
    if (!vaultToAddAppRoot) {
      if (preparedAddAppRootRepositoryRef.current) {
        preparedAddAppRootRepositoryRef.current = null;
        resetAddAppRootDialogState();
      }
      if (addAppRootModeActive && vaults) {
        replaceVaultDashboardDialogRoute("add-app-root");
      }
      return;
    }

    if (preparedAddAppRootRepositoryRef.current === vaultToAddAppRoot.repositoryFullName) {
      return;
    }

    preparedAddAppRootRepositoryRef.current = vaultToAddAppRoot.repositoryFullName;
    prepareAddAppRootDialog({ hasAppRoots: vaultToAddAppRoot.hasAppRoots });
  }, [
    addAppRootModeActive,
    prepareAddAppRootDialog,
    replaceVaultDashboardDialogRoute,
    resetAddAppRootDialogState,
    vaultToAddAppRoot,
    vaults,
  ]);

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

    // The URL owns which vault is targeted; local state only seeds editable
    // cleanup options when that routed target changes.
    prepareDeleteDialog();
    preparedDeleteRepositoryRef.current = vaultToDelete.repositoryFullName;
  }, [
    deleteModeActive,
    prepareDeleteDialog,
    resetDeleteDialogState,
    replaceVaultDashboardDialogRoute,
    deleteDialogVault,
    vaultToDelete,
    vaults,
  ]);

  useEffect(() => {
    if (!vaultToConnectConvex) {
      if (preparedAddConvexRepositoryRef.current) {
        preparedAddConvexRepositoryRef.current = null;
        resetConvexDialogState();
      }
      if (addConvexModeActive && vaults) {
        replaceVaultDashboardDialogRoute("add-convex");
      }
      return;
    }

    const preparedConvexKey = `${vaultToConnectConvex.repositoryFullName}\n${vaultToConnectConvex.appId}`;
    if (preparedAddConvexRepositoryRef.current === preparedConvexKey) {
      return;
    }

    preparedAddConvexRepositoryRef.current = preparedConvexKey;
    setConvexConnectDialogAppRoot(vaultToConnectConvex.rootDirectory);
    setConvexConnectDialogCreateProjectName(
      buildDefaultAppResourceName({
        repositoryName: vaultToConnectConvex.repositoryName,
        provider: "convex",
      }),
    );
    void loadConvexDialogResources();
  }, [
    addConvexModeActive,
    loadConvexDialogResources,
    replaceVaultDashboardDialogRoute,
    resetConvexDialogState,
    setConvexConnectDialogAppRoot,
    setConvexConnectDialogCreateProjectName,
    vaultToConnectConvex,
    vaults,
  ]);

  useEffect(() => {
    if (!vaultToConnectCloudflare) {
      if (preparedAddCloudflareWorkerRepositoryRef.current) {
        preparedAddCloudflareWorkerRepositoryRef.current = null;
        resetCloudflareDialogState();
      }
      if (addCloudflareWorkerModeActive && vaults) {
        replaceVaultDashboardDialogRoute("add-cloudflare");
      }
      return;
    }

    const preparedCloudflareKey = `${vaultToConnectCloudflare.repositoryFullName}\n${vaultToConnectCloudflare.appId}`;
    if (preparedAddCloudflareWorkerRepositoryRef.current === preparedCloudflareKey) {
      return;
    }

    preparedAddCloudflareWorkerRepositoryRef.current = preparedCloudflareKey;
    setCloudflareConnectDialogAppRoot(vaultToConnectCloudflare.rootDirectory);
    setCloudflareConnectDialogCreateWorkerName(
      buildDefaultAppResourceName({
        repositoryName: vaultToConnectCloudflare.repositoryName,
        provider: "cloudflare",
      }),
    );
    void loadCloudflareDialogResources({
      preferredAccountId: connectedCloudflareConnection?.accountId,
      vaultId: vaultToConnectCloudflare.id,
      appId: vaultToConnectCloudflare.appId,
    });
  }, [
    addCloudflareWorkerModeActive,
    connectedCloudflareConnection?.accountId,
    loadCloudflareDialogResources,
    resetCloudflareDialogState,
    replaceVaultDashboardDialogRoute,
    setCloudflareConnectDialogAppRoot,
    setCloudflareConnectDialogCreateWorkerName,
    vaultToConnectCloudflare,
    vaults,
  ]);

  const handleAddAppRootDialogOpenChange = (isOpen: boolean) => {
    if (isOpen || isSubmittingAppRoot) {
      return;
    }
    closeVaultDashboardDialog("add-app-root");
  };

  const handleSubmitAppRoot = async () => {
    if (!vaultToAddAppRoot || isSubmittingAppRoot) {
      return;
    }
    setAddAppRootDialogError(null);
    setAddAppRootDialogSubmitting(true);
    try {
      const appRoot =
        !vaultToAddAppRoot.hasAppRoots && addAppRootMode === "app"
          ? VAULT_ROOT_DIRECTORY
          : addAppRootValue;
      await createVaultApp({
        vaultId: vaultToAddAppRoot.id,
        rootDirectory: appRoot,
      });
      resetAddAppRootDialogState();
      closeVaultDashboardDialog("add-app-root");
    } catch (error) {
      setAddAppRootDialogError(error instanceof Error ? error.message : "Could not add app root.");
    } finally {
      setAddAppRootDialogSubmitting(false);
    }
  };

  const handleCloudflareAccountChange = (accountId: string) => {
    if (!vaultToConnectCloudflare) {
      return;
    }
    setCloudflareConnectDialogSelectedAccountId(accountId);
    setCloudflareConnectDialogSelectedWorkerName("");
    setCloudflareConnectDialogError(null);
    void loadCloudflareWorkersForAccount({
      accountId,
      vaultId: vaultToConnectCloudflare.id,
      appId: vaultToConnectCloudflare.appId,
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
      if (convexConnectMode === "existing") {
        if (!selectedConvexProject) {
          throw new Error("Convex project is required.");
        }
        await connectExistingConvexProject({
          vaultId: vaultToConnectConvex.id,
          appId: vaultToConnectConvex.appId,
          projectId: selectedConvexProject.projectId,
        });
      } else {
        await createConvexProject({
          vaultId: vaultToConnectConvex.id,
          appId: vaultToConnectConvex.appId,
          projectName: convexCreateProjectName,
        });
      }
      resetConvexDialogState();
      closeVaultDashboardDialog("add-convex");
    } catch (error) {
      setConvexConnectDialogError(
        error instanceof Error ? error.message : "Could not connect Convex project.",
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
      if (cloudflareConnectMode === "existing") {
        await connectExistingCloudflareWorker({
          vaultId: vaultToConnectCloudflare.id,
          appId: vaultToConnectCloudflare.appId,
          accountId: selectedCloudflareAccountId,
          workerName: selectedCloudflareWorkerName,
        });
      } else {
        await createCloudflareWorker({
          vaultId: vaultToConnectCloudflare.id,
          appId: vaultToConnectCloudflare.appId,
          accountId: selectedCloudflareAccountId,
          workerName: cloudflareCreateWorkerName,
        });
      }
      resetCloudflareDialogState();
      closeVaultDashboardDialog("add-cloudflare");
    } catch (error) {
      setCloudflareConnectDialogError(
        error instanceof Error ? error.message : "Could not connect Cloudflare Worker.",
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

  const handleRemoveMissingCloudflareWorker = async (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
  ) => {
    if (providerAttachmentRemovalInFlight) {
      return;
    }
    setProviderAttachmentRemovalInFlight({ provider: "cloudflare", vaultId, workerId });
    try {
      await removeMissingCloudflareWorker({ vaultId, workerId });
    } catch (error) {
      toast({
        title: "Could not remove Cloudflare attachment",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setProviderAttachmentRemovalInFlight(null);
    }
  };

  const handleRemoveMissingConvexProject = async (
    vaultId: Id<"vaults">,
    convexProjectId: Id<"vaultConvexProjects">,
  ) => {
    if (providerAttachmentRemovalInFlight) {
      return;
    }
    setProviderAttachmentRemovalInFlight({ provider: "convex", vaultId, convexProjectId });
    try {
      await removeMissingConvexProject({ vaultId, convexProjectId });
    } catch (error) {
      toast({
        title: "Could not remove Convex attachment",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setProviderAttachmentRemovalInFlight(null);
    }
  };

  const handleConfigureWorkersBuildsForGitHub = async (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
  ) => {
    if (cloudflareWorkerConfigurationActionInFlight) {
      return;
    }

    setCloudflareWorkerConfigurationActionInFlight({
      kind: "configure_workers_builds_for_github",
      vaultId,
      workerId,
    });
    try {
      await configureWorkersBuildsForGitHub({ workerId, vaultId });
    } catch (error) {
      toast({
        title: "Could not configure Workers Builds for GitHub",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCloudflareWorkerConfigurationActionInFlight(null);
      if (providerObservations.cloudflare.state !== "loading") {
        providerObservations.cloudflare.reload();
      }
    }
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
      if (providerObservations.cloudflare.state !== "loading") {
        providerObservations.cloudflare.reload();
      }
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
    const normalizedVaultPullRequestFilters = normalizeVaultPullRequestFilters(
      nextVaultPullRequestFilters,
    );

    try {
      await setVaultPullRequestFilters({
        vaultId,
        hiddenLabels: normalizedVaultPullRequestFilters.hiddenLabels,
        includeDrafts: normalizedVaultPullRequestFilters.includeDrafts,
        includeNoLabel: normalizedVaultPullRequestFilters.includeNoLabel,
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
        providerAttachmentRemovalInFlight={providerAttachmentRemovalInFlight}
        pullRequestObservation={pullRequestObservation}
        retryingDeletionRunId={retryingDeletionRunId}
        retryingInfrastructureVaultId={retryingInfrastructureVaultId}
        now={now}
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
        onConfigureWorkersBuildsForGitHub={(vaultId, workerId) => {
          void handleConfigureWorkersBuildsForGitHub(vaultId, workerId);
        }}
        onRotateConvexDeployKeysForWorkersBuilds={(vaultId, workerId, convexProjectId) => {
          void handleRotateConvexDeployKeysForWorkersBuilds(vaultId, workerId, convexProjectId);
        }}
        onOpenDeveloperToolsChange={handleVaultDeveloperToolsOpenChange}
        onRemoveMissingCloudflareWorker={(vaultId, workerId) => {
          void handleRemoveMissingCloudflareWorker(vaultId, workerId);
        }}
        onRemoveMissingConvexProject={(vaultId, convexProjectId) => {
          void handleRemoveMissingConvexProject(vaultId, convexProjectId);
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

      <VaultDashboardAppRootDialog
        appRoot={addAppRootValue}
        error={addAppRootError}
        folderSuggestions={addAppRootFolderSuggestions ?? EMPTY_APP_ROOT_FOLDER_SUGGESTIONS}
        isSubmitting={isSubmittingAppRoot}
        mode={addAppRootMode}
        onAppRootChange={setAddAppRootDialogAppRoot}
        onModeChange={setAddAppRootDialogMode}
        onOpenChange={handleAddAppRootDialogOpenChange}
        onSubmit={() => {
          void handleSubmitAppRoot();
        }}
        open={vaultToAddAppRoot !== null}
        vault={vaultToAddAppRoot}
      />
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
        appRoot={convexAppRoot}
        appRootReadOnly={vaultToConnectConvex !== null}
        createProjectName={convexCreateProjectName}
        projects={convexProjects}
        error={convexDialogError}
        isLoading={isLoadingConvexResources}
        isSubmitting={isSubmittingConvexProject}
        mode={convexConnectMode}
        onAppRootChange={setConvexConnectDialogAppRoot}
        onCreateProjectNameChange={setConvexConnectDialogCreateProjectName}
        onProjectChange={setConvexConnectDialogSelectedProjectId}
        onModeChange={setConvexConnectDialogConnectMode}
        onOpenChange={handleConnectConvexDialogOpenChange}
        onSubmit={() => {
          void handleSubmitConvexProject();
        }}
        open={vaultToConnectConvex !== null}
        selectedProjectId={selectedConvexProjectId}
        vault={vaultToConnectConvex}
      />
      <VaultDashboardCloudflareDialog
        accounts={cloudflareAccounts}
        appRoot={cloudflareAppRoot}
        appRootReadOnly={vaultToConnectCloudflare !== null}
        createWorkerName={cloudflareCreateWorkerName}
        error={cloudflareDialogError}
        isLoading={isLoadingCloudflareResources}
        isSubmitting={isSubmittingCloudflareWorker}
        mode={cloudflareConnectMode}
        onAccountChange={handleCloudflareAccountChange}
        onAppRootChange={setCloudflareConnectDialogAppRoot}
        onCreateWorkerNameChange={setCloudflareConnectDialogCreateWorkerName}
        onModeChange={setCloudflareConnectDialogConnectMode}
        onOpenChange={handleConnectCloudflareDialogOpenChange}
        onSubmit={() => {
          void handleSubmitCloudflareWorker();
        }}
        onWorkerChange={setCloudflareConnectDialogSelectedWorkerName}
        open={vaultToConnectCloudflare !== null}
        selectedAccountId={selectedCloudflareAccountId}
        selectedWorkerName={selectedCloudflareWorkerName}
        vault={vaultToConnectCloudflare}
        workers={cloudflareWorkers}
      />
    </AppWorkspaceRouteChrome>
  );
}
