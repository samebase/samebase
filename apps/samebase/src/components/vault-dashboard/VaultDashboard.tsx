import { api } from "../../../convex/_generated/api";
import { AppDialogContent } from "@/components/AppDialogContent";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { VaultProvisioningLog } from "@/components/vault-dashboard/VaultProvisioningLogViewer";
import { VaultPullRequestFiltersControl } from "@/components/vault-dashboard/VaultPullRequestFilters";
import { VaultResourceRail } from "@/components/vault-dashboard/VaultResourceRail";
import {
  RepositorySummaryDirectoryHeader,
  RepositorySummaryDirectoryList,
  RepositorySummaryDirectoryPane,
} from "@/components/vault-dashboard/RepositorySummaryDirectory";
import { buildVaultDashboardResourceRailState } from "@/components/vault-dashboard/vaultResourceRailState";
import { ChevronDownIcon, TrashIcon, UpdateIcon } from "@/lib/radixIcons";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  GitBranch,
  Loader2,
} from "lucide-react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { linkStyle } from "../styles";
import { clsx } from "clsx";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { formatRelativeTimeAgoWithSeconds } from "@/lib/formatRelativeTime";
import { highlightMatches, rankFuzzyPathMatches } from "@/lib/fuzzySearch.tsx";
import { useNow } from "@/hooks/useNow";
import {
  useAction,
  useMutation,
  useQuery as useConvexQuery,
  type PaginationStatus,
} from "convex/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
import { EditedFilesCategoriesPopover } from "@/components/EditedFilesCategories";
import { EditorChatPanel } from "@/components/EditorChatPanel";
import {
  VaultDashboardEmptyState,
  VaultDashboardRepositoryCard,
  VaultDashboardRepositoryList,
  VaultDashboardScrollTargetEndPadding,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import { findVaultDashboardVerticalScrollport } from "@/components/vault-dashboard/vaultDashboardScrollport";
import {
  compareCloudflareAccountOptions,
  type CloudflareAccountOption,
} from "@/components/vault-dashboard/vaultDashboardCloudflareAccountOptions";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  buildVaultCodespaceChatRoute,
  buildVaultDatabaseRoute,
  buildVaultFileRoute,
  buildVaultSchemaRoute,
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
import { buildPullRequestLabelStyle } from "@/lib/pullRequestLabels";
import { applySearchPatch } from "@/routing/searchFlags";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  mapRepositoryInventoryItemToDashboardRow,
  type VaultRepositoryInventoryBranchComparison,
  type VaultRepositoryInventoryCommitChecksSummary,
  type VaultRepositoryInventoryPullRequestComparison,
  type VaultRepositoryInventoryRow,
} from "@/components/vault-dashboard/VaultDashboardBranchSectionState";
import {
  buildRepositoryInventoryFilterChange,
  buildPullRequestFilterOptions,
  normalizeRepositoryInventoryFilters,
  type PullRequestFilterOption,
  type RepositoryInventoryFilters,
} from "@/components/vault-dashboard/repositoryInventoryFilters";
import {
  buildVaultBranchRowViewModel,
  type VaultBranchHeadCommitViewModel,
} from "@/components/vault-dashboard/vaultDashboardBranchRowViewModel";
import { toast } from "@/components/ui/use-toast";
import { CHAT_ENABLED, CODESPACES_ENABLED } from "../../../shared/featureFlags";
import { buildDefaultAppResourceName } from "../../../shared/appResourceNames";
import { tryParseRepositoryFullName } from "../../../shared/repoName";
import { VAULT_ROOT_DIRECTORY } from "../../../shared/vaultRootDirectory";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
  SamebaseLogoMark,
  PullRequestStateLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { useRepositoryObservationDemand } from "@/hooks/useRepositoryObservationDemand";
import { useRepositoryInventoryFilter } from "@/hooks/useRepositoryInventoryFilter";
import {
  useRepositoryInventoryChecks,
  type RepositoryInventoryCheck,
} from "@/hooks/useRepositoryInventoryChecks";
import {
  useRepositoryInventoryCloudflareBuilds,
  type RepositoryInventoryCloudflareBuild,
} from "@/hooks/useRepositoryInventoryCloudflareBuilds";
import { useRepositoryInventoryUnattributedCloudflareBuilds } from "@/hooks/useRepositoryInventoryUnattributedCloudflareBuilds";
import { useRepositoryInventorySnapshot } from "@/hooks/useRepositoryInventorySnapshot";
import { useRepositorySummaryDirectory } from "@/hooks/useRepositorySummaryDirectory";
import type {
  CloudflareWorkerOption,
  CloudflareWorkerRepositoryEvidence,
} from "@/components/vault-dashboard/vaultDashboardCloudflareWorkerSelection";
import {
  isSelectableCloudflareWorker,
  readDefaultCloudflareWorkerSelection,
} from "@/components/vault-dashboard/vaultDashboardCloudflareWorkerSelection";
import {
  buildVaultProductionApps,
  type VaultBranchProductionApp,
  type VaultBranchProductionLinkProvider,
} from "@/components/vault-dashboard/vaultProductionApps";

const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";
const VAULT_BRANCH_LOAD_MORE_PAGE_SIZE = 10;
const VAULT_BRANCH_ROW_ESTIMATE_PX = 92;
const VAULT_BRANCH_LOADER_ROW_KEY = "vault-branch-loader";
const VAULT_DASHBOARD_REPOSITORY_HEADER_SELECTOR = "[data-vault-dashboard-repository-header]";

export type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaultByRepository)["_returnType"]
>;
type VaultDashboardStagedBranchSummary = NonNullable<
  (typeof api.fileStaging.listStagedFilesBranchSummaries)["_returnType"]
>[number];
type VaultDashboardConvexDeployment = VaultDashboardVault["convexDeployments"][number];
type VaultDashboardApp = VaultDashboardVault["apps"][number];
type VaultDashboardStagedBranchSummariesByVaultId = Map<
  string,
  readonly VaultDashboardStagedBranchSummary[]
>;
type VaultDashboardRepositoryInventoryState =
  (typeof api.repositoryInventory.getRepositoryInventoryState)["_returnType"];
type VaultDashboardRepositoryInventoryStatesByVaultId = Map<
  string,
  VaultDashboardRepositoryInventoryState
>;
type VaultDashboardRemoteBranchPage = {
  remoteBranches: readonly VaultRepositoryInventoryRow[];
  status: PaginationStatus;
  loadMore: (numItems: number) => void;
  pullRequestFilter: {
    value: RepositoryInventoryFilters;
    options: readonly PullRequestFilterOption[];
    totalPullRequestCount: number;
    visiblePullRequestCount: number;
    isApplying: boolean;
  } | null;
};
type VaultDashboardRemoteBranchPagesByVaultId = Map<string, VaultDashboardRemoteBranchPage>;
export type VaultDashboardViewModel = {
  vaults: VaultDashboardVault[];
  repositoryInventoryStatesByVaultId: VaultDashboardRepositoryInventoryStatesByVaultId;
  remoteBranchPagesByVaultId: VaultDashboardRemoteBranchPagesByVaultId;
  stagedBranchSummariesByVaultId: VaultDashboardStagedBranchSummariesByVaultId;
};
export type VaultDashboardProps = {
  selectedRepositoryFullName?: string;
};

type VaultDashboardLogoComponent = () => ReactNode;

function ignoreVaultBranchLoadMore(_numItems: number): void {}

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
  hasApps: boolean;
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
type VaultCloudflareBuildsDialogMode = "connect_repository" | "deploy_convex";
type VaultCloudflareBuildsDialogSelection =
  | { state: "unselected" }
  | { state: "worker_only" }
  | {
      state: "deploys_convex";
      convexDeploymentId: Id<"vaultConvexDeployments">;
    };
type VaultCloudflareBuildsDialogState = {
  mode: VaultCloudflareBuildsDialogMode;
  selection: VaultCloudflareBuildsDialogSelection;
  vaultId: Id<"vaults">;
  workerId: Id<"vaultCloudflareWorkers">;
};
type VaultCloudflareBuildsDialogTarget = {
  convexDeployments: Array<{
    convexDeploymentId: Id<"vaultConvexDeployments">;
    projectSlug: string;
    rootDirectory: string;
    teamSlug: string;
  }>;
  mode: VaultCloudflareBuildsDialogMode;
  workerName: string;
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
type CloudflareWorkerRepairActionInFlight =
  | {
      kind: "connect_github_repo" | "verify_infrastructure";
      vaultId: Id<"vaults">;
      workerId: Id<"vaultCloudflareWorkers">;
    }
  | {
      kind: "set_convex_deploy_keys";
      vaultId: Id<"vaults">;
      workerId: Id<"vaultCloudflareWorkers">;
      convexDeploymentId: Id<"vaultConvexDeployments">;
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
  retryingDeletionRunId: Id<"vaultDeletionRuns"> | null;
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
    setRetryingDeletionRunId: (retryingDeletionRunId: Id<"vaultDeletionRuns"> | null) => {
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
    repositoryFullName: vault.routeRepositoryFullName,
    isSamebaseManaged: vault.isSamebaseManaged,
    canRemoveGithubRepo: vault.isSamebaseManaged && vault.hasConnectedGitHubRepository,
    hasConvexProvision: vault.hasConvexProvision,
    hasCloudflareProvision: vault.hasCloudflareProvision,
    canRemoveConvexProvision: vault.canRemoveConvexProvision,
    canRemoveCloudflareProvision: vault.canRemoveCloudflareProvision,
  };
}

const dashboardLinkIconSlotClassName = "inline-flex h-4 w-5 shrink-0 items-center justify-center";

const DashboardLinkIconSlot = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <span aria-hidden="true" className={clsx(dashboardLinkIconSlotClassName, className)}>
    {children}
  </span>
);

function formatChecksCount(count: number): string {
  return `${count} ${count === 1 ? "check" : "checks"}`;
}

const repositoryInventoryCountFormatter = new Intl.NumberFormat("en-US");

function formatRepositoryInventoryCount(count: number): string {
  return repositoryInventoryCountFormatter.format(count);
}

function formatRepositoryComparisonUnavailableReason(
  reason:
    | Extract<VaultRepositoryInventoryBranchComparison, { state: "unavailable" }>["reason"]
    | Extract<VaultRepositoryInventoryPullRequestComparison, { state: "unavailable" }>["reason"],
): string {
  switch (reason) {
    case "default_branch_unavailable":
      return "Default branch unavailable";
    case "base_ref_unavailable":
      return "Base unavailable";
    case "head_ref_unavailable":
      return "Head unavailable";
    case "not_comparable":
      return "Comparison unavailable";
    default:
      return reason satisfies never;
  }
}

function formatRepositoryComparisonMetadata(args: {
  comparison:
    | VaultRepositoryInventoryBranchComparison
    | VaultRepositoryInventoryPullRequestComparison;
  baseRefName: string | null;
}): { visual: string; accessible: string } {
  if (args.comparison.state === "unavailable") {
    const unavailableReason = formatRepositoryComparisonUnavailableReason(args.comparison.reason);
    return { visual: unavailableReason, accessible: unavailableReason };
  }
  if (args.baseRefName === null) {
    return {
      visual: "Default branch unavailable",
      accessible: "Default branch unavailable",
    };
  }
  return {
    visual: `↑${formatRepositoryInventoryCount(args.comparison.aheadBy)} ↓${formatRepositoryInventoryCount(args.comparison.behindBy)} vs ${args.baseRefName}`,
    accessible: `${formatRepositoryInventoryCount(args.comparison.aheadBy)} commits ahead and ${formatRepositoryInventoryCount(args.comparison.behindBy)} commits behind ${args.baseRefName}`,
  };
}

function formatCommitChecksCompactLabel(
  summary: VaultRepositoryInventoryCommitChecksSummary,
): string {
  if (summary.totalCount === 0) {
    return "No checks";
  }

  switch (summary.state) {
    case "running":
      return `${summary.runningCount} pending`;
    case "failure":
      return `${summary.failureCount} failed`;
    case "success":
      return `${summary.successCount + summary.neutralCount} passed`;
    case "neutral":
      return `${summary.neutralCount} neutral`;
    case "unknown":
      return `${summary.totalCount} unknown`;
    default: {
      summary.state satisfies never;
      return `${summary.totalCount} unknown`;
    }
  }
}

function formatCommitChecksLabel(summary: VaultRepositoryInventoryCommitChecksSummary): string {
  if (summary.totalCount === 0) {
    return "No checks";
  }

  switch (summary.state) {
    case "running":
      return `${formatChecksCount(summary.runningCount)} pending`;
    case "failure":
      return `${formatChecksCount(summary.failureCount)} failed`;
    case "success":
      return `${formatChecksCount(summary.successCount + summary.neutralCount)} passed`;
    case "neutral":
      return `${formatChecksCount(summary.neutralCount)} neutral`;
    case "unknown":
      return `${formatChecksCount(summary.totalCount)} unknown`;
    default: {
      summary.state satisfies never;
      return "Checks";
    }
  }
}

function formatCommitChecksTitle(summary: VaultRepositoryInventoryCommitChecksSummary): string {
  const parts = [
    `${formatChecksCount(summary.totalCount)} total`,
    `${summary.successCount} passed`,
    `${summary.failureCount} failed`,
    `${summary.runningCount} pending`,
    `${summary.neutralCount} neutral`,
  ];
  if (summary.unknownCount > 0) {
    parts.push(`${summary.unknownCount} unknown`);
  }
  return parts.join(" • ");
}

function getCommitChecksStateClassName(
  summary: VaultRepositoryInventoryCommitChecksSummary,
): string {
  switch (summary.state) {
    case "success":
      return "text-emerald-600 hover:text-emerald-700";
    case "failure":
      return "text-destructive hover:text-destructive";
    case "running":
      return "text-amber-600 hover:text-amber-700";
    case "neutral":
    case "unknown":
      return "text-muted-foreground hover:text-foreground";
    default: {
      summary.state satisfies never;
      return "text-muted-foreground hover:text-foreground";
    }
  }
}

function CommitChecksIcon({ summary }: { summary: VaultRepositoryInventoryCommitChecksSummary }) {
  if (summary.totalCount === 0) {
    return <CircleDashed className="h-4 w-4" strokeWidth={2} />;
  }

  switch (summary.state) {
    case "success":
      return <CircleCheck className="h-4 w-4" strokeWidth={2} />;
    case "failure":
      return <CircleX className="h-4 w-4" strokeWidth={2} />;
    case "running":
      return <CircleDot className="h-4 w-4" strokeWidth={2} />;
    case "neutral":
      return <CircleDashed className="h-4 w-4" strokeWidth={2} />;
    case "unknown":
      return <CircleAlert className="h-4 w-4" strokeWidth={2} />;
    default: {
      summary.state satisfies never;
      return <CircleAlert className="h-4 w-4" strokeWidth={2} />;
    }
  }
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
  const canSelectAppMode = vault ? !vault.hasApps : false;
  const effectiveMode = canSelectAppMode ? mode : "monorepo";
  const isRepositoryAppMode = effectiveMode === "app";
  const showAppRootInput = !isRepositoryAppMode;
  const submitDisabled = isSubmitting || (showAppRootInput && !appRoot.trim());
  const submitLabel = isRepositoryAppMode ? "Use as app" : "Add app root";
  const title = vault ? `Add app root ${vault.repositoryFullName}` : "Add app root";
  const description = canSelectAppMode
    ? "Choose whether this repository is one app or a monorepo."
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

const NO_CONVEX_DEPLOYMENT_SELECT_VALUE = "no-convex-deployment";

export function VaultDashboardCloudflareBuildsDialog({
  isSubmitting,
  onConvexDeploymentChange,
  onOpenChange,
  onSubmit,
  open,
  selection,
  target,
}: {
  isSubmitting: boolean;
  onConvexDeploymentChange: (selection: VaultCloudflareBuildsDialogSelection) => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: () => void;
  open: boolean;
  selection: VaultCloudflareBuildsDialogSelection;
  target: VaultCloudflareBuildsDialogTarget | null;
}) {
  const selectedValue =
    selection.state === "unselected"
      ? ""
      : selection.state === "worker_only"
        ? NO_CONVEX_DEPLOYMENT_SELECT_VALUE
        : selection.convexDeploymentId;
  const selectedDeployment = target?.convexDeployments.find(
    (deployment) =>
      selection.state === "deploys_convex" &&
      deployment.convexDeploymentId === selection.convexDeploymentId,
  );
  const submitDisabled = isSubmitting || !target || selection.state === "unselected";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>
            {target?.mode === "deploy_convex" ? "Deploy Convex" : "Connect GitHub repo"}
          </DialogTitle>
          <DialogDescription>
            {target
              ? `Choose whether ${target.workerName} also deploys Convex.`
              : "Choose whether this Worker also deploys Convex."}
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <Select
            modal={false}
            value={selectedValue}
            onValueChange={(value) => {
              if (value === NO_CONVEX_DEPLOYMENT_SELECT_VALUE) {
                onConvexDeploymentChange({ state: "worker_only" });
                return;
              }
              const deployment = target.convexDeployments.find(
                (candidate) => candidate.convexDeploymentId === value,
              );
              if (!deployment) {
                throw new Error("Convex deployment selection is unavailable.");
              }
              onConvexDeploymentChange({
                state: "deploys_convex",
                convexDeploymentId: deployment.convexDeploymentId,
              });
            }}
            disabled={isSubmitting}
          >
            <SelectTrigger aria-label="Convex deployment" className="w-full">
              <SelectValue placeholder="Convex deployment">
                {selectedDeployment
                  ? `${selectedDeployment.rootDirectory} · ${selectedDeployment.teamSlug}/${selectedDeployment.projectSlug}`
                  : selection.state === "worker_only"
                    ? "No Convex deployment"
                    : undefined}
              </SelectValue>
            </SelectTrigger>
            <AppSelectContent>
              {target.mode === "connect_repository" ? (
                <AppSelectItem value={NO_CONVEX_DEPLOYMENT_SELECT_VALUE}>
                  No Convex deployment
                </AppSelectItem>
              ) : null}
              {target.convexDeployments.map((deployment) => (
                <AppSelectItem
                  key={deployment.convexDeploymentId}
                  value={deployment.convexDeploymentId}
                >
                  {deployment.rootDirectory} · {deployment.teamSlug}/{deployment.projectSlug}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </Select>
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
            {target?.mode === "deploy_convex" ? "Deploy Convex" : "Connect"}
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

interface StagedSummary {
  modified: number;
  deleted: number;
  new: number;
  renamed: number;
  renamedAndModified: number;
  total: number;
}

interface VaultBranchLinkRowProps {
  vaultId?: Id<"vaults">;
  snapshotId?: Id<"vaultRepositoryInventorySnapshots">;
  repositoryFullName: string;
  defaultBranchName: string | null;
  branch: VaultRepositoryInventoryRow;
  apps?: readonly VaultDashboardApp[];
  convexDeployments?: readonly VaultDashboardConvexDeployment[];
  productionApps?: readonly VaultBranchProductionApp[];
  schemaGraphAccessEnabled?: boolean;
  stagedSummary?: StagedSummary;
}

type VaultBranchConvexLink = {
  href: string;
  label: string;
  title: string;
};

const BRANCH_PRODUCTION_LINK_ICONS = {
  cloudflare: CloudflareProviderLogo,
  convex: ConvexProviderLogo,
} satisfies Record<VaultBranchProductionLinkProvider, VaultDashboardLogoComponent>;

const branchProductionAppRootClassName =
  "grid min-h-7 max-w-full grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2 text-sm leading-6 text-muted-foreground";
const branchProductionAppRootIconClassName = "h-3.5 w-3.5";
const branchProductionAppRootValueClassName = "min-w-0 max-w-full truncate font-mono";
const branchProductionProviderRowsIndentClassName = "pl-6";
const branchProductionLinkClassName =
  "group -mx-1.5 -my-1 grid min-h-8 max-w-full grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2 rounded-sm px-1.5 py-1 text-sm leading-6 text-foreground touch-manipulation underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current";
const branchProductionLinkLabelClassName = "min-w-0 break-all font-mono";

function buildVaultBranchProductionRootDirectoryLabel(rootDirectory: string): string {
  if (rootDirectory === VAULT_ROOT_DIRECTORY) {
    return "Repository root";
  }
  return rootDirectory;
}

function VaultBranchProductionApps({
  productionApps,
}: {
  productionApps: readonly VaultBranchProductionApp[];
}) {
  const showAppRootHeadings =
    productionApps.length > 1 ||
    productionApps.some((app) => app.rootDirectory !== VAULT_ROOT_DIRECTORY);

  return (
    <div className="grid min-w-0 gap-1">
      {productionApps.map((app) => (
        <div key={app.appId} className="grid min-w-0 gap-0.5">
          {showAppRootHeadings ? (
            <div className={branchProductionAppRootClassName}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <ChevronDownIcon className={branchProductionAppRootIconClassName} />
              </span>
              <span className={branchProductionAppRootValueClassName}>
                {buildVaultBranchProductionRootDirectoryLabel(app.rootDirectory)}
              </span>
            </div>
          ) : null}
          <div
            className={clsx(
              "grid min-w-0 gap-0.5",
              showAppRootHeadings && branchProductionProviderRowsIndentClassName,
            )}
          >
            {app.links.map((link) => {
              const Icon = BRANCH_PRODUCTION_LINK_ICONS[link.provider];
              return (
                <a
                  key={`${link.provider}\n${link.href}`}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx(branchProductionLinkClassName, linkStyle)}
                  title={link.title}
                >
                  <DashboardLinkIconSlot>
                    <Icon />
                  </DashboardLinkIconSlot>
                  <span className={branchProductionLinkLabelClassName}>{link.label}</span>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

type VaultDashboardRepositoryExternalLink = {
  href: string;
  key: "cloudflare" | "convexProjectSettings" | "github";
  label: string;
  title: string;
};

const REPOSITORY_EXTERNAL_LINK_ICONS: Record<
  VaultDashboardRepositoryExternalLink["key"],
  VaultDashboardLogoComponent
> = {
  cloudflare: CloudflareProviderLogo,
  convexProjectSettings: ConvexProviderLogo,
  github: GitHubProviderLogo,
};

function buildVaultDashboardBranchRoute(args: {
  repositoryFullName: string;
  branchName: string;
  openChangedFiles: boolean;
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

  if (!args.openChangedFiles) {
    return branchRoute;
  }

  return buildFileViewSearchHref({
    pathname: branchRoute,
    search: {},
    fileViewSearch: buildFileViewRouteSearch({ compare: true }),
  });
}

function buildVaultDashboardBranchConvexLinks(args: {
  repositoryFullName: string;
  branchName: string;
  apps: readonly VaultDashboardApp[];
  convexDeployments: readonly VaultDashboardConvexDeployment[];
  schemaGraphAccessEnabled: boolean;
}): VaultBranchConvexLink[] {
  const repository = tryParseRepositoryFullName(args.repositoryFullName);
  if (repository === null) {
    return [];
  }

  const appsById = new Map(args.apps.map((app) => [app.appId, app]));
  return [...args.convexDeployments]
    .sort(
      (left, right) =>
        left.appId.localeCompare(right.appId) ||
        left.deploymentName.localeCompare(right.deploymentName) ||
        left.convexDeploymentId.localeCompare(right.convexDeploymentId),
    )
    .flatMap((deployment) => {
      const app = appsById.get(deployment.appId);
      if (!app) {
        throw new Error("Convex deployment references an unknown app.");
      }
      const rootLabel = app.rootDirectory === VAULT_ROOT_DIRECTORY ? null : app.rootDirectory;
      const links = [
        {
          href: buildVaultDatabaseRoute({
            owner: repository.owner,
            repoName: repository.name,
            branch: args.branchName,
            deploymentId: deployment.convexDeploymentId,
          }),
          label: rootLabel ? `Data: ${rootLabel}` : "Data",
          title: rootLabel
            ? `Open production data for ${deployment.deploymentName} at ${rootLabel}`
            : `Open production data for ${deployment.deploymentName}`,
        },
      ];
      if (args.schemaGraphAccessEnabled) {
        links.push({
          href: buildVaultSchemaRoute({
            owner: repository.owner,
            repoName: repository.name,
            branch: args.branchName,
            deploymentId: deployment.convexDeploymentId,
          }),
          label: rootLabel ? `Schema: ${rootLabel}` : "Schema",
          title: rootLabel
            ? `Open Convex schema for ${deployment.deploymentName} at ${rootLabel}`
            : `Open Convex schema for ${deployment.deploymentName}`,
        });
      }
      return links;
    });
}

function CommitChecksSummaryButton({
  canOpen,
  commit,
  onClick,
  open,
}: {
  canOpen: boolean;
  commit: VaultBranchHeadCommitViewModel;
  onClick: () => void;
  open: boolean;
}) {
  const checks = commit.checks;
  if (!checks) {
    return null;
  }
  const title = [commit.shortSha, commit.title, formatCommitChecksTitle(checks)]
    .filter(Boolean)
    .join(" • ");
  const className = clsx(
    "inline-flex min-h-7 items-center gap-1 rounded-sm px-1.5 font-mono text-sm tabular-nums",
    getCommitChecksStateClassName(checks),
  );
  const content = (
    <>
      <CommitChecksIcon summary={checks} />
      <span>{formatCommitChecksCompactLabel(checks)}</span>
      {canOpen ? (
        <ChevronDownIcon aria-hidden="true" className={clsx("h-3.5 w-3.5", open && "rotate-180")} />
      ) : null}
    </>
  );

  if (!canOpen) {
    return (
      <span aria-label={formatCommitChecksLabel(checks)} className={className} title={title}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={formatCommitChecksLabel(checks)}
      className={clsx(className, "transition-colors hover:underline")}
      title={title}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function formatRepositoryInventoryCheckState(check: RepositoryInventoryCheck): string {
  switch (check.state) {
    case "success":
      return "Passed";
    case "failure":
      return "Failed";
    case "running":
      return "Running";
    case "neutral":
      return check.source === "check_run" && check.conclusion === "skipped" ? "Skipped" : "Neutral";
    case "unknown":
      return "Unknown";
    default: {
      check.state satisfies never;
      return "Unknown";
    }
  }
}

function RepositoryInventoryCheckIcon({ check }: { check: RepositoryInventoryCheck }) {
  switch (check.state) {
    case "success":
      return <CircleCheck aria-hidden="true" className="h-4 w-4 text-emerald-600" />;
    case "failure":
      return <CircleX aria-hidden="true" className="h-4 w-4 text-destructive" />;
    case "running":
      return <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />;
    case "neutral":
      return <CircleDashed aria-hidden="true" className="h-4 w-4" />;
    case "unknown":
      return <CircleAlert aria-hidden="true" className="h-4 w-4" />;
    default: {
      check.state satisfies never;
      return null;
    }
  }
}

function RepositoryInventoryCheckRow({ check }: { check: RepositoryInventoryCheck }) {
  const content = (
    <>
      <RepositoryInventoryCheckIcon check={check} />
      <span className="min-w-0 flex-1 break-words text-foreground">{check.name}</span>
      <span className="shrink-0">{formatRepositoryInventoryCheckState(check)}</span>
    </>
  );
  const className = "flex min-h-8 items-center gap-2 py-1 text-sm text-muted-foreground";
  if (!check.targetUrl) {
    return <li className={className}>{content}</li>;
  }
  return (
    <li>
      <a
        href={check.targetUrl}
        target="_blank"
        rel="noreferrer noopener"
        className={clsx(
          className,
          "-mx-1 rounded-sm px-1 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
          linkStyle,
        )}
      >
        {content}
      </a>
    </li>
  );
}

function CommitChecksDetails({
  rowKey,
  snapshotId,
  vaultId,
}: {
  rowKey: string;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  vaultId: Id<"vaults">;
}) {
  const checks = useRepositoryInventoryChecks({ rowKey, snapshotId, vaultId });
  if (checks.isLoading) {
    return (
      <div role="status" className="flex min-h-8 items-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="sr-only">Loading checks</span>
      </div>
    );
  }
  if (checks.error) {
    return <div className="text-sm text-destructive">Checks unavailable</div>;
  }
  return (
    <div className="border-l border-border pl-3">
      <ul>
        {checks.checks.map((check) => (
          <RepositoryInventoryCheckRow key={`${check.source}:${check.sourceKey}`} check={check} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {checks.githubChecksUrl ? (
          <a
            href={checks.githubChecksUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={clsx(
              "-mx-1 inline-flex min-h-8 items-center rounded-sm px-1 text-sm underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
              linkStyle,
            )}
          >
            Open in GitHub
          </a>
        ) : null}
        {checks.hasNextPage ? (
          <button
            type="button"
            className={clsx(
              "-mx-1 inline-flex min-h-8 items-center gap-1 rounded-sm px-1 text-sm underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current disabled:no-underline",
              linkStyle,
            )}
            disabled={checks.isFetchingNextPage}
            onClick={() => void checks.fetchNextPage()}
          >
            {checks.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Load more checks
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatCloudflareBuildState(build: RepositoryInventoryCloudflareBuild): string {
  switch (build.state) {
    case "queued":
      return "Queued";
    case "running":
      return "Building";
    case "success":
      return "Passed";
    case "failure":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "skipped":
      return "Skipped";
    case "provider_unknown":
      return "State unknown";
    default: {
      build satisfies never;
      return "State unknown";
    }
  }
}

function CloudflareBuildPreviewResult({ build }: { build: RepositoryInventoryCloudflareBuild }) {
  const preview = build.preview;
  const linkClassName = clsx(
    "-mx-1 inline-flex min-h-7 items-center rounded-sm px-1 font-mono text-sm underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
    linkStyle,
  );
  if (preview.state === "ready") {
    return (
      <>
        {preview.branchAlias.state === "ready" ? (
          <a
            href={preview.branchAlias.url}
            target="_blank"
            rel="noreferrer noopener"
            className={linkClassName}
            title={`Open ${preview.branchAlias.branchName} preview`}
          >
            Preview
          </a>
        ) : null}
        <a
          href={preview.versionUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={linkClassName}
          title="Open immutable Worker version"
        >
          Version
        </a>
        {preview.branchAlias.state === "provider_unknown" ? (
          <span
            title={
              preview.branchAlias.reason === "conflicting_branch_evidence"
                ? "GitHub and Cloudflare identified different branches for this preview alias"
                : "GitHub did not identify the branch for this preview alias"
            }
          >
            {preview.branchAlias.reason === "conflicting_branch_evidence"
              ? "Branch unresolved"
              : "Branch unknown"}
          </span>
        ) : null}
      </>
    );
  }
  switch (preview.state) {
    case "pending":
      return <span>Preview pending</span>;
    case "unavailable":
      return <span>No preview</span>;
    case "disabled":
      return <span>Preview disabled</span>;
    case "provider_unknown":
      return <span>Preview unknown</span>;
    default: {
      preview satisfies never;
      return null;
    }
  }
}

function CloudflareBuildRow({
  build,
  commitSha,
}: {
  build: RepositoryInventoryCloudflareBuild;
  commitSha: string | null;
}) {
  const providerLinkClassName = clsx(
    "-mx-1 inline-flex min-h-7 items-center rounded-sm px-1 font-mono text-sm underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
    linkStyle,
  );
  return (
    <li className="space-y-1 border-t border-border/40 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 break-all font-mono text-sm text-foreground">
          {build.workerName}
        </span>
        <span>{formatCloudflareBuildState(build)}</span>
        <span className="font-mono text-xs">
          {build.rootDirectory.state === "known" ? build.rootDirectory.value : "Root unknown"}
        </span>
        {commitSha ? (
          <span className="font-mono text-xs" title={commitSha}>
            Commit {commitSha.slice(0, 7)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <CloudflareBuildPreviewResult build={build} />
        {build.detailsUrl ? (
          <a
            href={build.detailsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={providerLinkClassName}
          >
            Build
          </a>
        ) : null}
        {build.githubUrl ? (
          <a
            href={build.githubUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={providerLinkClassName}
          >
            GitHub
          </a>
        ) : null}
      </div>
    </li>
  );
}

function CloudflareBuildDetails({
  rowKey,
  snapshotId,
  vaultId,
}: {
  rowKey: string;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  vaultId: Id<"vaults">;
}) {
  const builds = useRepositoryInventoryCloudflareBuilds({ rowKey, snapshotId, vaultId });
  if (builds.isLoading) {
    return (
      <div role="status" className="flex min-h-8 items-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="sr-only">Loading Cloudflare builds</span>
      </div>
    );
  }
  if (builds.error) {
    return <div className="text-sm text-destructive">Builds unavailable</div>;
  }
  return (
    <div className="border-l border-border pl-3 text-muted-foreground">
      <ul>
        {builds.builds.map((build) => (
          <CloudflareBuildRow key={build.sourceKey} build={build} commitSha={null} />
        ))}
      </ul>
      {builds.hasNextPage ? (
        <button
          type="button"
          className={clsx(
            "-mx-1 mt-1 inline-flex min-h-8 items-center gap-1 rounded-sm px-1 text-sm underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current disabled:no-underline",
            linkStyle,
          )}
          disabled={builds.isFetchingNextPage}
          onClick={() => void builds.fetchNextPage()}
        >
          {builds.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Load more builds
        </button>
      ) : null}
    </div>
  );
}

function UnattributedCloudflareBuildDetails({
  snapshotId,
  vaultId,
}: {
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  vaultId: Id<"vaults">;
}) {
  const builds = useRepositoryInventoryUnattributedCloudflareBuilds({ snapshotId, vaultId });
  if (builds.isLoading) {
    return (
      <div role="status" className="flex min-h-8 items-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="sr-only">Loading builds with unresolved branches</span>
      </div>
    );
  }
  if (builds.error) {
    return <div className="text-sm text-destructive">Builds unavailable</div>;
  }
  return (
    <div className="border-l border-border pl-3 text-muted-foreground">
      <ul>
        {builds.builds.map(({ build, commitSha }) => (
          <CloudflareBuildRow key={build.sourceKey} build={build} commitSha={commitSha} />
        ))}
      </ul>
      {builds.hasNextPage ? (
        <button
          type="button"
          className={clsx(
            "-mx-1 mt-1 inline-flex min-h-8 items-center gap-1 rounded-sm px-1 text-sm underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current disabled:no-underline",
            linkStyle,
          )}
          disabled={builds.isFetchingNextPage}
          onClick={() => void builds.fetchNextPage()}
        >
          {builds.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Load more builds
        </button>
      ) : null}
    </div>
  );
}

function UnattributedCloudflareBuildDisclosure({
  buildCount,
  hasFollowingRows,
  snapshotId,
  vaultId,
}: {
  buildCount: number;
  hasFollowingRows: boolean;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  vaultId: Id<"vaults">;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const label =
    buildCount === 1
      ? "1 build with unresolved branch"
      : `${buildCount} builds with unresolved branches`;

  return (
    <div
      className={clsx(
        "-mx-4 space-y-1 border bg-muted px-4 py-2",
        hasFollowingRows && "border-b-0",
      )}
    >
      <button
        type="button"
        aria-controls={open ? detailsId : undefined}
        aria-expanded={open}
        className={clsx(
          "-mx-1.5 inline-flex min-h-7 items-center gap-1.5 rounded-sm px-1.5 font-mono text-sm transition-colors hover:underline",
          linkStyle,
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <CloudflareProviderLogo />
        <span>{label}</span>
        <ChevronDownIcon aria-hidden="true" className={clsx("h-3.5 w-3.5", open && "rotate-180")} />
      </button>
      {open ? (
        <div id={detailsId}>
          <UnattributedCloudflareBuildDetails snapshotId={snapshotId} vaultId={vaultId} />
        </div>
      ) : null}
    </div>
  );
}

function CloudflareBuildDisclosure({
  buildCount,
  rowKey,
  snapshotId,
  vaultId,
}: {
  buildCount: number;
  rowKey: string;
  snapshotId: Id<"vaultRepositoryInventorySnapshots"> | undefined;
  vaultId: Id<"vaults"> | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (buildCount === 0) {
    return null;
  }
  const label = `${buildCount} ${buildCount === 1 ? "build" : "builds"}`;
  const canOpen = snapshotId !== undefined && vaultId !== undefined;
  return (
    <div className="space-y-1">
      <button
        type="button"
        aria-expanded={canOpen ? open : undefined}
        className={clsx(
          "-mx-1.5 inline-flex min-h-7 items-center gap-1.5 rounded-sm px-1.5 font-mono text-sm transition-colors",
          canOpen && "hover:underline",
          linkStyle,
        )}
        disabled={!canOpen}
        onClick={() => setOpen((current) => !current)}
      >
        <CloudflareProviderLogo />
        <span>{label}</span>
        {canOpen ? (
          <ChevronDownIcon
            aria-hidden="true"
            className={clsx("h-3.5 w-3.5", open && "rotate-180")}
          />
        ) : null}
      </button>
      {open && snapshotId && vaultId ? (
        <CloudflareBuildDetails rowKey={rowKey} snapshotId={snapshotId} vaultId={vaultId} />
      ) : null}
    </div>
  );
}

function VaultBranchCommitLink({ commit }: { commit: VaultBranchHeadCommitViewModel }) {
  const className = clsx(
    "-mx-1 -my-0.5 inline-flex min-h-7 items-center rounded-sm px-1 py-0.5 font-mono text-sm tabular-nums",
    commit.url &&
      "underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
    commit.url && linkStyle,
  );
  const label = <span>Head {commit.shortSha}</span>;

  if (!commit.url) {
    return <span className={className}>{label}</span>;
  }

  return (
    <a
      href={commit.url}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
      title={commit.title ? `Open commit: ${commit.title}` : "Open commit"}
    >
      {label}
    </a>
  );
}

function VaultBranchHeadCommit({
  buildCount,
  commit,
  rowKey,
  snapshotId,
  vaultId,
}: {
  buildCount: number;
  commit: VaultBranchHeadCommitViewModel;
  rowKey: string;
  snapshotId: Id<"vaultRepositoryInventorySnapshots"> | undefined;
  vaultId: Id<"vaults"> | undefined;
}) {
  const [checksOpen, setChecksOpen] = useState(false);
  const canOpenChecks =
    commit.checks !== undefined &&
    commit.checks.totalCount > 0 &&
    snapshotId !== undefined &&
    vaultId !== undefined;
  return (
    <div className="space-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <VaultBranchCommitLink commit={commit} />
        <CommitChecksSummaryButton
          canOpen={canOpenChecks}
          commit={commit}
          open={checksOpen}
          onClick={() => setChecksOpen((current) => !current)}
        />
      </div>
      {checksOpen && snapshotId && vaultId ? (
        <CommitChecksDetails rowKey={rowKey} snapshotId={snapshotId} vaultId={vaultId} />
      ) : null}
      <CloudflareBuildDisclosure
        buildCount={buildCount}
        rowKey={rowKey}
        snapshotId={snapshotId}
        vaultId={vaultId}
      />
    </div>
  );
}
export function VaultDashboardRepositoryExternalLinks({
  links,
  repositoryFullName,
}: {
  links: VaultDashboardRepositoryExternalLink[];
  repositoryFullName: string;
}) {
  if (links.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label={`Repository links for ${repositoryFullName}`}
      className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-base leading-6 text-muted-foreground"
    >
      {links.map((link) => {
        const Icon = REPOSITORY_EXTERNAL_LINK_ICONS[link.key];

        return (
          <a
            key={link.key}
            href={link.href}
            target="_blank"
            rel="noreferrer noopener"
            className={clsx(
              "-mx-1.5 -my-1 inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 py-1 touch-manipulation underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
              linkStyle,
            )}
            title={link.title}
          >
            <DashboardLinkIconSlot>
              <Icon />
            </DashboardLinkIconSlot>
            <span>{link.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

export function VaultBranchLinkContent({
  vaultId,
  snapshotId,
  repositoryFullName,
  defaultBranchName,
  branch,
  apps = [],
  convexDeployments = [],
  productionApps = [],
  schemaGraphAccessEnabled = false,
}: {
  vaultId?: Id<"vaults">;
  snapshotId?: Id<"vaultRepositoryInventorySnapshots">;
  repositoryFullName: string;
  defaultBranchName: string | null;
  branch: VaultRepositoryInventoryRow;
  apps?: readonly VaultDashboardApp[];
  convexDeployments?: readonly VaultDashboardConvexDeployment[];
  productionApps?: readonly VaultBranchProductionApp[];
  schemaGraphAccessEnabled?: boolean;
}) {
  const branchRow = buildVaultBranchRowViewModel({
    branch,
  });
  const pullRequest = branchRow.kind === "pull_request" ? branchRow.pullRequest : null;
  const normalizedPullRequestLabels = pullRequest?.labels ?? [];
  const pullRequestLabel = pullRequest ? `PR #${pullRequest.number}` : "Pull request";
  const hasPullRequestMetadata =
    pullRequest?.isDraft === true ||
    pullRequest?.isCrossRepository === true ||
    normalizedPullRequestLabels.length > 0;
  const comparisonMetadata = branchRow.isDefault
    ? null
    : formatRepositoryComparisonMetadata({
        comparison: branchRow.comparison,
        baseRefName: pullRequest ? pullRequest.baseRefName : defaultBranchName,
      });
  const rowMetadata = pullRequest
    ? {
        visual: `${comparisonMetadata?.visual ?? "Comparison unavailable"} · +${formatRepositoryInventoryCount(pullRequest.additions)} −${formatRepositoryInventoryCount(pullRequest.deletions)} · ${formatRepositoryInventoryCount(pullRequest.changedFiles)} ${pullRequest.changedFiles === 1 ? "file" : "files"}`,
        accessible: `${comparisonMetadata?.accessible ?? "Comparison unavailable"}. ${formatRepositoryInventoryCount(pullRequest.additions)} lines added, ${formatRepositoryInventoryCount(pullRequest.deletions)} lines removed, ${formatRepositoryInventoryCount(pullRequest.changedFiles)} ${pullRequest.changedFiles === 1 ? "file" : "files"} changed`,
      }
    : comparisonMetadata;
  const metadataLinkClassName = clsx(
    "-mx-2 -my-1 inline-flex min-h-9 items-center rounded-sm px-2 py-1 text-base leading-6 touch-manipulation underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
    "font-mono",
    linkStyle,
  );
  const branchLabelClassName = clsx(
    "-mx-1.5 -my-1 flex min-h-9 max-w-full items-start gap-1.5 rounded-sm px-1.5 py-1 text-base leading-6",
    pullRequest ? "font-mono text-muted-foreground" : "text-muted-foreground",
    !pullRequest && branchRow.isDefault && "font-medium text-foreground",
  );
  const branchRoute = branchRow.canOpenInSamebase
    ? buildVaultDashboardBranchRoute({
        repositoryFullName,
        branchName: branchRow.name,
        openChangedFiles: !branchRow.isDefault,
      })
    : null;
  const branchSamebaseLinkLabel = branchRow.isDefault ? "Edit" : "View changes";
  const branchSamebaseLinkTitle = branchRow.isDefault
    ? "Open branch in Samebase"
    : "View changes in Samebase";
  const activeProductionApps = branchRow.isDefault ? productionApps : [];
  const activeConvexLinks = branchRow.isDefault
    ? buildVaultDashboardBranchConvexLinks({
        repositoryFullName,
        branchName: branchRow.name,
        apps,
        convexDeployments,
        schemaGraphAccessEnabled,
      })
    : [];

  return (
    <>
      <div className="min-w-0 flex-1 space-y-1.5">
        {pullRequest ? (
          <a
            href={pullRequest.url}
            target="_blank"
            rel="noreferrer noopener"
            className={clsx(
              "-mx-1.5 -my-1 flex min-h-9 max-w-full items-start gap-1.5 rounded-sm px-1.5 py-1 text-base font-medium leading-6 text-foreground touch-manipulation underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
              linkStyle,
            )}
            title="Open pull request"
          >
            <DashboardLinkIconSlot className="mt-1">
              <PullRequestStateLogo isDraft={pullRequest.isDraft} />
            </DashboardLinkIconSlot>
            <span className="min-w-0 break-words">
              {pullRequestLabel} {pullRequest.title}
            </span>
          </a>
        ) : null}
        {activeProductionApps.length > 0 ? (
          <VaultBranchProductionApps productionApps={activeProductionApps} />
        ) : null}
        {branchRow.githubUrl ? (
          <a
            href={branchRow.githubUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={clsx(
              branchLabelClassName,
              "underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
              linkStyle,
            )}
            title="Open branch on GitHub"
            aria-label={`Open ${branchRow.name} branch on GitHub`}
          >
            <DashboardLinkIconSlot className="mt-1">
              <GitBranch aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </DashboardLinkIconSlot>
            <span className="min-w-0 break-words">{branchRow.name}</span>
          </a>
        ) : (
          <div className={branchLabelClassName}>
            <DashboardLinkIconSlot className="mt-1">
              <GitBranch aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </DashboardLinkIconSlot>
            <span className="min-w-0 break-words">{branchRow.name}</span>
          </div>
        )}
        <div className="space-y-1 text-base leading-6 text-muted-foreground/80">
          <VaultBranchHeadCommit
            buildCount={branch.buildCount}
            commit={branchRow.headCommit}
            rowKey={branch.rowKey}
            snapshotId={snapshotId}
            vaultId={vaultId}
          />
          {rowMetadata ? (
            <div className="font-mono text-sm">
              <span aria-hidden="true">{rowMetadata.visual}</span>
              <span className="sr-only">{rowMetadata.accessible}</span>
            </div>
          ) : null}
          {hasPullRequestMetadata ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {pullRequest?.isDraft ? (
                <Badge
                  variant="outline"
                  className="h-6 px-1.5 py-0 text-xs font-medium uppercase tracking-wide"
                >
                  draft
                </Badge>
              ) : null}
              {pullRequest?.isCrossRepository ? (
                <Badge
                  variant="outline"
                  className="h-6 px-1.5 py-0 text-xs font-medium uppercase tracking-wide"
                >
                  fork
                </Badge>
              ) : null}
              {normalizedPullRequestLabels.length > 0
                ? normalizedPullRequestLabels.map((label) => (
                    <Badge
                      key={label.name}
                      variant="outline"
                      className="h-6 max-w-48 px-1.5 py-0 text-xs font-medium"
                      style={buildPullRequestLabelStyle(label.color)}
                      title={label.name}
                    >
                      <span className="truncate">{label.name}</span>
                    </Badge>
                  ))
                : null}
            </div>
          ) : null}
          {branchRoute ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <Link
                to={branchRoute}
                className={clsx(metadataLinkClassName, "gap-1.5")}
                title={branchSamebaseLinkTitle}
              >
                <DashboardLinkIconSlot>
                  <SamebaseLogoMark />
                </DashboardLinkIconSlot>
                <span>{branchSamebaseLinkLabel}</span>
              </Link>
              {activeConvexLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={clsx(metadataLinkClassName, "gap-1.5")}
                  title={link.title}
                >
                  <DashboardLinkIconSlot>
                    <ConvexProviderLogo />
                  </DashboardLinkIconSlot>
                  <span>{link.label}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export function VaultBranchLinkRow({
  vaultId,
  snapshotId,
  repositoryFullName,
  defaultBranchName,
  branch,
  apps,
  convexDeployments,
  productionApps,
  schemaGraphAccessEnabled,
  stagedSummary,
}: VaultBranchLinkRowProps) {
  const hasStagedChanges = (stagedSummary?.total ?? 0) > 0;
  // Preserve space for links by rendering actions only when staged files give
  // the row a real control.
  const showRowActions = Boolean(hasStagedChanges && vaultId);

  return (
    <div
      data-vault-dashboard-branch-row=""
      className="flex items-start gap-2 border-b border-border/40 px-2 py-3.5 last:border-b-0"
    >
      <VaultBranchLinkContent
        vaultId={vaultId}
        snapshotId={snapshotId}
        repositoryFullName={repositoryFullName}
        defaultBranchName={defaultBranchName}
        branch={branch}
        apps={apps}
        convexDeployments={convexDeployments}
        productionApps={productionApps}
        schemaGraphAccessEnabled={schemaGraphAccessEnabled}
      />
      {showRowActions ? (
        <div className="flex shrink-0 items-start gap-2">
          {hasStagedChanges && vaultId ? (
            <div className="pt-0.5">
              <EditedFilesCategoriesPopover
                vaultId={vaultId}
                repositoryFullName={repositoryFullName}
                branch={branch.name}
                summaryCounts={stagedSummary}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface VaultBranchListProps {
  vaultId: Id<"vaults">;
  snapshotId?: Id<"vaultRepositoryInventorySnapshots">;
  repositoryFullName: string;
  defaultBranchName: string | null;
  apps?: readonly VaultDashboardApp[];
  convexDeployments?: readonly VaultDashboardConvexDeployment[];
  loadMore: (numItems: number) => void;
  paginationStatus: PaginationStatus;
  remoteBranches: readonly VaultRepositoryInventoryRow[];
  productionApps?: readonly VaultBranchProductionApp[];
  schemaGraphAccessEnabled?: boolean;
  stagedSummaries: readonly VaultDashboardStagedBranchSummary[];
}

function VaultBranchList({
  vaultId,
  snapshotId,
  repositoryFullName,
  defaultBranchName,
  apps,
  convexDeployments,
  loadMore,
  paginationStatus,
  remoteBranches,
  productionApps,
  schemaGraphAccessEnabled,
  stagedSummaries,
}: VaultBranchListProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const summaryByBranch = useMemo(
    () => new Map(stagedSummaries.map((summary) => [summary.branch, summary.counts])),
    [stagedSummaries],
  );
  const hasLoaderRow =
    paginationStatus === "LoadingFirstPage" ||
    paginationStatus === "CanLoadMore" ||
    paginationStatus === "LoadingMore";
  const itemCount = remoteBranches.length + (hasLoaderRow ? 1 : 0);
  const branchVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: itemCount,
    estimateSize: () => VAULT_BRANCH_ROW_ESTIMATE_PX,
    getScrollElement: () => scrollElement,
    getItemKey: (index) => remoteBranches[index]?.rowKey ?? VAULT_BRANCH_LOADER_ROW_KEY,
    overscan: 6,
    scrollMargin,
    useFlushSync: false,
  });
  const virtualItems = branchVirtualizer.getVirtualItems();
  const lastVirtualItemIndex = virtualItems[virtualItems.length - 1]?.index;
  const branchListEndIndex =
    remoteBranches.length > 0 ? remoteBranches.length - 1 : hasLoaderRow ? 0 : null;
  const branchListEndOffset =
    branchListEndIndex === null
      ? 0
      : (branchVirtualizer.getOffsetForIndex(branchListEndIndex, "start")?.[0] ?? 0);

  useLayoutEffect(() => {
    const updateScrollMargin = () => {
      const list = listRef.current;
      if (!list) {
        return;
      }
      const nextScrollElement = findVaultDashboardVerticalScrollport(list);
      setScrollElement((currentScrollElement) =>
        currentScrollElement === nextScrollElement ? currentScrollElement : nextScrollElement,
      );
      if (!nextScrollElement) {
        return;
      }
      const listRect = list.getBoundingClientRect();
      const scrollportRect = nextScrollElement.getBoundingClientRect();
      setScrollMargin(listRect.top - scrollportRect.top + nextScrollElement.scrollTop);
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollMargin);

    const observeScrollMarginLayout = () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      const list = listRef.current;
      if (list && resizeObserver) {
        const observedElements = new Set<Element>();
        const observeElement = (element: Element) => {
          if (!observedElements.has(element)) {
            observedElements.add(element);
            resizeObserver.observe(element);
          }
        };
        const nextScrollElement = findVaultDashboardVerticalScrollport(list);
        observeElement(document.body);
        for (
          let currentElement: HTMLElement | null = list;
          currentElement;
          currentElement = currentElement.parentElement
        ) {
          observeElement(currentElement);
          const repositoryHeader = currentElement.querySelector(
            VAULT_DASHBOARD_REPOSITORY_HEADER_SELECTOR,
          );
          if (repositoryHeader) {
            observeElement(repositoryHeader);
          }
          if (currentElement === nextScrollElement) {
            break;
          }
        }
      }

      updateScrollMargin();
    };

    observeScrollMarginLayout();
    window.addEventListener("resize", observeScrollMarginLayout);

    return () => {
      window.removeEventListener("resize", observeScrollMarginLayout);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [remoteBranches.length]);

  useEffect(() => {
    if (paginationStatus !== "CanLoadMore") {
      return;
    }
    if (lastVirtualItemIndex !== itemCount - 1) {
      return;
    }
    loadMore(VAULT_BRANCH_LOAD_MORE_PAGE_SIZE);
  }, [itemCount, lastVirtualItemIndex, loadMore, paginationStatus]);

  return (
    // Let branch rows align with the vault card edge instead of nesting a
    // second inset panel inside the already padded card.
    <div
      ref={listRef}
      data-vault-dashboard-branch-list=""
      data-scroll-margin={Math.round(scrollMargin)}
      className="-mx-4 overflow-hidden border bg-muted"
    >
      <div className="relative" style={{ height: `${branchVirtualizer.getTotalSize()}px` }}>
        {branchListEndIndex !== null ? (
          <div
            aria-hidden="true"
            data-vault-dashboard-branch-list-end=""
            className="absolute left-0 top-0 h-px w-px"
            style={{
              transform: `translateY(${branchListEndOffset - scrollMargin}px)`,
            }}
          />
        ) : null}
        {virtualItems.map((virtualItem) => {
          const branch =
            virtualItem.index < remoteBranches.length ? remoteBranches[virtualItem.index] : null;
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={branchVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualItem.start - scrollMargin}px)`,
              }}
            >
              {branch !== null ? (
                <VaultBranchLinkRow
                  branch={branch}
                  vaultId={vaultId}
                  snapshotId={snapshotId}
                  repositoryFullName={repositoryFullName}
                  defaultBranchName={defaultBranchName}
                  apps={branch.isDefault ? apps : undefined}
                  stagedSummary={
                    branch.canOpenInSamebase ? summaryByBranch.get(branch.name) : undefined
                  }
                  convexDeployments={branch.isDefault ? convexDeployments : undefined}
                  productionApps={branch.isDefault ? productionApps : undefined}
                  schemaGraphAccessEnabled={schemaGraphAccessEnabled}
                />
              ) : (
                <VaultBranchListLoaderRow status={paginationStatus} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VaultBranchListLoaderRow({ status }: { status: PaginationStatus }) {
  const isLoading = status === "LoadingFirstPage" || status === "LoadingMore";

  return (
    <div
      aria-busy={isLoading}
      aria-hidden={isLoading ? undefined : true}
      className="flex min-h-14 items-center justify-center border-t px-4 py-3 text-muted-foreground"
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
    </div>
  );
}

export function VaultPullRequestHeaderControls({
  filters,
  onChangeFilters,
  options,
  totalPullRequestCount,
  visiblePullRequestCount,
  isApplying,
}: {
  filters: RepositoryInventoryFilters;
  onChangeFilters: (nextFilters: RepositoryInventoryFilters) => void;
  options: readonly PullRequestFilterOption[];
  totalPullRequestCount: number;
  visiblePullRequestCount: number;
  isApplying: boolean;
}) {
  const pullRequestCountLabel = `${
    visiblePullRequestCount < totalPullRequestCount
      ? `${visiblePullRequestCount} of ${totalPullRequestCount}`
      : totalPullRequestCount
  } ${totalPullRequestCount === 1 ? "PR" : "PRs"}`;

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground/80">{pullRequestCountLabel}</span>
        {isApplying ? (
          <span role="status" className="text-xs text-muted-foreground/80">
            Applying filters
          </span>
        ) : null}
        <VaultPullRequestFiltersControl
          value={filters}
          options={options}
          onChange={onChangeFilters}
        />
      </div>
    </div>
  );
}

export function VaultBranchSection({
  apps,
  convexDeployments,
  defaultBranchName,
  loadMore,
  paginationStatus,
  productionApps,
  repositoryFullName,
  schemaGraphAccessEnabled,
  stagedSummaries,
  snapshotId,
  unattributedBuildCount,
  vaultId,
  remoteBranches,
}: {
  apps?: readonly VaultDashboardApp[];
  convexDeployments?: readonly VaultDashboardConvexDeployment[];
  defaultBranchName: string | null;
  loadMore: (numItems: number) => void;
  paginationStatus: PaginationStatus;
  productionApps?: readonly VaultBranchProductionApp[];
  repositoryFullName: string;
  schemaGraphAccessEnabled: boolean;
  stagedSummaries: readonly VaultDashboardStagedBranchSummary[];
  snapshotId?: Id<"vaultRepositoryInventorySnapshots">;
  unattributedBuildCount: number;
  vaultId: Id<"vaults">;
  remoteBranches: readonly VaultRepositoryInventoryRow[];
}) {
  const hasBranchList = remoteBranches.length > 0 || paginationStatus === "LoadingFirstPage";
  return (
    <div>
      {unattributedBuildCount > 0 && snapshotId ? (
        <UnattributedCloudflareBuildDisclosure
          key={snapshotId}
          buildCount={unattributedBuildCount}
          hasFollowingRows={hasBranchList}
          snapshotId={snapshotId}
          vaultId={vaultId}
        />
      ) : null}
      {hasBranchList ? (
        <VaultBranchList
          vaultId={vaultId}
          snapshotId={snapshotId}
          repositoryFullName={repositoryFullName}
          defaultBranchName={defaultBranchName}
          apps={apps}
          remoteBranches={remoteBranches}
          loadMore={loadMore}
          paginationStatus={paginationStatus}
          convexDeployments={convexDeployments}
          productionApps={productionApps}
          schemaGraphAccessEnabled={schemaGraphAccessEnabled}
          stagedSummaries={stagedSummaries}
        />
      ) : null}
    </div>
  );
}

function renderVaultDashboardRepositoryStatus({
  isReady,
  inventoryState,
  now,
}: {
  isReady: boolean;
  inventoryState: VaultDashboardRepositoryInventoryState | undefined;
  now: number;
}) {
  if (!isReady) {
    return undefined;
  }

  if (!inventoryState || inventoryState.state === "empty") {
    return (
      <>
        <UpdateIcon className="h-3 w-3 animate-spin" />
        <span>Loading repository...</span>
      </>
    );
  }

  const lastComplete =
    typeof inventoryState.checkedAt === "number" ? (
      <>
        <span>·</span>
        <span>Last complete {formatRelativeTimeAgoWithSeconds(inventoryState.checkedAt, now)}</span>
      </>
    ) : null;

  if (inventoryState.state === "failed") {
    return (
      <>
        <span className="text-amber-700" title={inventoryState.message}>
          Update failed
        </span>
        {lastComplete}
      </>
    );
  }

  if (inventoryState.state === "refreshing") {
    return (
      <>
        <UpdateIcon className="h-3 w-3 animate-spin" />
        <span>Updating...</span>
        {lastComplete}
      </>
    );
  }

  if (inventoryState.state === "waiting") {
    return (
      <>
        <span>
          {inventoryState.reason === "queue"
            ? "Update queued"
            : `GitHub paused updates until ${new Date(inventoryState.retryAt).toLocaleTimeString()}`}
        </span>
        {lastComplete}
      </>
    );
  }

  return <span>Updated {formatRelativeTimeAgoWithSeconds(inventoryState.checkedAt, now)}</span>;
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
  providerSetup,
  repositoryFullName,
}: {
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

  return (
    <VaultSetupProgressSection
      status={setupStatus.status}
      label={setupStatus.label}
      message={failureMessage}
    />
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
  onRetry: (runId: Id<"vaultDeletionRuns">) => void;
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
  cloudflareWorkerRepairActionInFlight: CloudflareWorkerRepairActionInFlight | null;
  isRemovingVault: boolean;
  retryingDeletionRunId: Id<"vaultDeletionRuns"> | null;
  retryingInfrastructureVaultId: Id<"vaults"> | null;
  now: number;
  viewModel: VaultDashboardViewModel;
  logoRouteSearch: LogoRouteSearch;
  replaceLogoRouteSearch: (nextSearch: LogoRouteSearch) => void;
  openDeveloperToolsByVaultId: Partial<Record<Id<"vaults">, boolean>>;
  persistedVaultResourceLinksOpenByVaultId: Map<string, boolean>;
  schemaGraphAccessEnabled: boolean;
  rootRouteSearch: RootRouteSearch;
  onConnectCloudflareGithubRepository: (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
  ) => void;
  onDeployCloudflareConvex: (vaultId: Id<"vaults">, workerId: Id<"vaultCloudflareWorkers">) => void;
  onOpenDeveloperToolsChange: (vaultId: Id<"vaults">, isOpen: boolean) => void;
  onRepositoryInventoryFilterChange: (
    vaultId: Id<"vaults">,
    filters: RepositoryInventoryFilters,
  ) => void;
  onRetryInfrastructureProvisioning: (vaultId: Id<"vaults">) => void;
  onRetryVaultDeletion: (runId: Id<"vaultDeletionRuns">) => void;
  onResourceLinksOpenChange: (vaultId: Id<"vaults">, resourceLinksOpen: boolean) => void;
  onSetCloudflareConvexDeployKeys: (
    vaultId: Id<"vaults">,
    args: {
      workerId: Id<"vaultCloudflareWorkers">;
      convexDeploymentId: Id<"vaultConvexDeployments">;
    },
  ) => void;
  onVerifyCloudflareInfrastructure: (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
  ) => void;
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

export function VaultDashboardPaneMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-start p-4 text-sm text-muted-foreground">{children}</div>
  );
}

export function VaultDashboardView({
  deleteModeActive,
  developerToolsVisible,
  cloudflareWorkerRepairActionInFlight,
  isRemovingVault,
  retryingDeletionRunId,
  retryingInfrastructureVaultId,
  now,
  viewModel,
  logoRouteSearch,
  replaceLogoRouteSearch,
  openDeveloperToolsByVaultId,
  persistedVaultResourceLinksOpenByVaultId,
  schemaGraphAccessEnabled,
  rootRouteSearch,
  onConnectCloudflareGithubRepository,
  onDeployCloudflareConvex,
  onOpenDeveloperToolsChange,
  onRepositoryInventoryFilterChange,
  onRetryInfrastructureProvisioning,
  onRetryVaultDeletion,
  onResourceLinksOpenChange,
  onSetCloudflareConvexDeployKeys,
  onVerifyCloudflareInfrastructure,
}: VaultDashboardViewProps) {
  const navigate = useNavigate();
  const dashboardRoutePathname = useLocation({
    select: (location) => location.pathname,
  });
  const {
    repositoryInventoryStatesByVaultId,
    remoteBranchPagesByVaultId,
    stagedBranchSummariesByVaultId,
    vaults,
  } = viewModel;
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

  const isInfrastructureRetryInFlight = retryingInfrastructureVaultId !== null;

  return (
    <VaultDashboardRepositoryList>
      {vaults.map((vault) => {
        const deletion = vault.deletion;
        const isDeletingVault = deletion.state !== "not_deleting";
        const isReady = vault.state === "ready" && !isDeletingVault;
        const remoteBranchPage = remoteBranchPagesByVaultId.get(vault._id);
        const paginatedRemoteBranches = remoteBranchPage?.remoteBranches ?? [];
        const pullRequestFilter = remoteBranchPage?.pullRequestFilter ?? null;
        const inventoryState = repositoryInventoryStatesByVaultId.get(vault._id);
        const unattributedBuildCount =
          inventoryState !== undefined && inventoryState.state !== "empty"
            ? (inventoryState.unattributedBuildCount ?? 0)
            : 0;
        const vaultResourceLinksOpen =
          persistedVaultResourceLinksOpenByVaultId.get(vault._id) ?? false;
        const snapshotDefaultBranch =
          inventoryState !== undefined && inventoryState.state !== "empty"
            ? (inventoryState.defaultBranch ?? null)
            : null;
        const primaryBranch =
          snapshotDefaultBranch ??
          paginatedRemoteBranches.find((branch) => branch.isDefault)?.name ??
          paginatedRemoteBranches[0]?.name;
        const chatRoute =
          primaryBranch && !isDeletingVault
            ? buildVaultCodespaceChatRoute({
                repositoryFullName: vault.routeRepositoryFullName,
                branch: primaryBranch,
              })
            : null;
        const githubRepositoryFullName =
          inventoryState !== undefined && "repositoryFullName" in inventoryState
            ? (inventoryState.repositoryFullName ?? vault.githubRepositoryFullName)
            : vault.githubRepositoryFullName;
        const githubRepositoryName = githubRepositoryFullName.split("/").at(-1) ?? vault.githubName;
        const githubRepositoryUrl = `https://github.com/${githubRepositoryFullName}`;
        const developerToolsOpen =
          developerToolsVisible && (openDeveloperToolsByVaultId[vault._id] ?? false);
        const isCloudflareWorkerRepairActionInFlight =
          cloudflareWorkerRepairActionInFlight !== null;
        const resourceRailState = buildVaultDashboardResourceRailState({
          buildAddAppRootHref: () =>
            buildVaultDashboardAddAppRootHref({
              dashboardRoutePathname,
              rootRouteSearch,
            }),
          addAppRootOnClick: () => {
            openAppRootAddDialog();
          },
          buildAddCloudflareWorkerHref: (app) =>
            buildVaultDashboardProviderAddHref({
              appRoot: app.rootDirectory,
              dashboardRoutePathname,
              provider: "cloudflare",
              rootRouteSearch,
            }),
          addCloudflareWorkerOnClick: (app) => {
            openProviderAddDialog({ appRoot: app.rootDirectory, provider: "cloudflare" });
          },
          buildAddConvexHref: (app) =>
            buildVaultDashboardProviderAddHref({
              appRoot: app.rootDirectory,
              dashboardRoutePathname,
              provider: "convex",
              rootRouteSearch,
            }),
          addConvexOnClick: (app) => {
            openProviderAddDialog({ appRoot: app.rootDirectory, provider: "convex" });
          },
          connectCloudflareGithubRepoOnClick: isCloudflareWorkerRepairActionInFlight
            ? undefined
            : (workerId) => {
                onConnectCloudflareGithubRepository(vault._id, workerId);
              },
          deployCloudflareConvexOnClick: isCloudflareWorkerRepairActionInFlight
            ? undefined
            : (workerId) => {
                onDeployCloudflareConvex(vault._id, workerId);
              },
          githubRepositoryUrl,
          isConnectingCloudflareGithubRepo: (workerId) =>
            cloudflareWorkerRepairActionInFlight?.kind === "connect_github_repo" &&
            cloudflareWorkerRepairActionInFlight.vaultId === vault._id &&
            cloudflareWorkerRepairActionInFlight.workerId === workerId,
          isRetryingInfrastructure: retryingInfrastructureVaultId === vault._id,
          isSettingCloudflareConvexDeployKeys: ({ workerId, convexDeploymentId }) =>
            cloudflareWorkerRepairActionInFlight?.kind === "set_convex_deploy_keys" &&
            cloudflareWorkerRepairActionInFlight.vaultId === vault._id &&
            cloudflareWorkerRepairActionInFlight.workerId === workerId &&
            cloudflareWorkerRepairActionInFlight.convexDeploymentId === convexDeploymentId,
          isVerifyingCloudflareInfrastructure: (workerId) =>
            cloudflareWorkerRepairActionInFlight?.kind === "verify_infrastructure" &&
            cloudflareWorkerRepairActionInFlight.vaultId === vault._id &&
            cloudflareWorkerRepairActionInFlight.workerId === workerId,
          retryInfrastructureOnClick: isInfrastructureRetryInFlight
            ? undefined
            : () => {
                onRetryInfrastructureProvisioning(vault._id);
              },
          setCloudflareConvexDeployKeysOnClick: isCloudflareWorkerRepairActionInFlight
            ? undefined
            : (args) => {
                onSetCloudflareConvexDeployKeys(vault._id, args);
              },
          verifyCloudflareInfrastructureOnClick: isCloudflareWorkerRepairActionInFlight
            ? undefined
            : (workerId) => {
                onVerifyCloudflareInfrastructure(vault._id, workerId);
              },
          vault,
        });
        const productionApps = buildVaultProductionApps(vault);
        const stagedBranchSummaries = stagedBranchSummariesByVaultId.get(vault._id) ?? [];
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
              providerSetup={activeProviderSetup}
              repositoryFullName={vault.routeRepositoryFullName}
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
        const branchSection =
          isReady &&
          (paginatedRemoteBranches.length > 0 ||
            remoteBranchPage?.status === "LoadingFirstPage" ||
            unattributedBuildCount > 0) ? (
            <VaultBranchSection
              apps={vault.apps}
              convexDeployments={vault.convexDeployments}
              defaultBranchName={snapshotDefaultBranch}
              loadMore={remoteBranchPage?.loadMore ?? ignoreVaultBranchLoadMore}
              paginationStatus={remoteBranchPage?.status ?? "LoadingFirstPage"}
              schemaGraphAccessEnabled={schemaGraphAccessEnabled}
              snapshotId={
                inventoryState !== undefined && inventoryState.state !== "empty"
                  ? inventoryState.activeSnapshotId
                  : undefined
              }
              unattributedBuildCount={unattributedBuildCount}
              vaultId={vault._id}
              repositoryFullName={vault.routeRepositoryFullName}
              remoteBranches={paginatedRemoteBranches}
              productionApps={productionApps}
              stagedSummaries={stagedBranchSummaries}
            />
          ) : undefined;
        return (
          <div key={vault._id} data-vault-dashboard-repository-card="">
            <VaultDashboardRepositoryCard
              isReady={isReady}
              repositoryName={githubRepositoryName}
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
                    repositoryFullName={vault.routeRepositoryFullName}
                    deleteAction={deletion.deleteAction}
                    isRemovingVault={isRemovingVault}
                  />
                ) : undefined
              }
              repositoryStatus={renderVaultDashboardRepositoryStatus({
                isReady,
                inventoryState,
                now,
              })}
              headerControls={
                isReady &&
                pullRequestFilter &&
                (pullRequestFilter.totalPullRequestCount > 0 ||
                  pullRequestFilter.value.hiddenLabels.length > 0 ||
                  pullRequestFilter.value.includeDrafts ||
                  !pullRequestFilter.value.includeNoLabel) ? (
                  <VaultPullRequestHeaderControls
                    filters={pullRequestFilter.value}
                    onChangeFilters={(filters) => {
                      onRepositoryInventoryFilterChange(vault._id, filters);
                    }}
                    options={pullRequestFilter.options}
                    totalPullRequestCount={pullRequestFilter.totalPullRequestCount}
                    visiblePullRequestCount={pullRequestFilter.visiblePullRequestCount}
                    isApplying={pullRequestFilter.isApplying}
                  />
                ) : undefined
              }
              branchSection={branchSection}
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
                              repositoryFullName={vault.routeRepositoryFullName}
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
                                repositoryFullName={vault.routeRepositoryFullName}
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
  const repositoryDirectory = useRepositorySummaryDirectory();
  const selectedVaultResult = useQuery(
    api.vault.dashboard.getUserVaultByRepository,
    selectedRepositoryFullName ? { repositoryFullName: selectedRepositoryFullName } : "skip",
  );
  const selectedObservationTargetResult = useQuery(
    api.vault.dashboard.getRepositoryObservationTargetByRepository,
    selectedRepositoryFullName ? { repositoryFullName: selectedRepositoryFullName } : "skip",
  );
  const selectedVault = selectedVaultResult ?? null;
  const selectedVaultLoaded =
    selectedRepositoryFullName === undefined || selectedVaultResult !== undefined;
  const selectedObservationTargetLoaded =
    selectedRepositoryFullName === undefined || selectedObservationTargetResult !== undefined;
  const selectedInventoryVaultId = selectedObservationTargetResult?.vaultId ?? null;
  const visibleSummaryVaultIds = useMemo(
    () => repositoryDirectory.entries.slice(0, 25).map((entry) => entry.vaultId),
    [repositoryDirectory.entries],
  );
  useRepositoryObservationDemand({
    enabled: selectedObservationTargetLoaded,
    selectedInventoryVaultId,
    selectedSummaryVaultId: selectedObservationTargetResult?.vaultId ?? null,
    visibleSummaryVaultIds,
  });
  const selectedVaultRepositoryInventoryState = useConvexQuery(
    api.repositoryInventory.getRepositoryInventoryState,
    selectedInventoryVaultId ? { vaultId: selectedInventoryVaultId } : "skip",
  );
  const selectedVaultRepositoryInventoryFilter =
    useRepositoryInventoryFilter(selectedInventoryVaultId);
  const selectedVaultRepositoryInventorySnapshotId =
    selectedVaultRepositoryInventoryState?.state !== "empty"
      ? selectedVaultRepositoryInventoryState?.activeSnapshotId
      : undefined;
  const selectedVaultRepositoryInventoryFilterViewId =
    selectedVaultRepositoryInventoryState?.state !== "empty"
      ? selectedVaultRepositoryInventoryState?.activeFilterViewId
      : undefined;
  const selectedVaultRepositoryInventoryPage = useRepositoryInventorySnapshot({
    vaultId: selectedInventoryVaultId,
    snapshotId: selectedVaultRepositoryInventorySnapshotId,
    viewId: selectedVaultRepositoryInventoryFilterViewId,
    inventoryState: selectedVaultRepositoryInventoryState,
  });
  const selectedVaultRepositoryInventoryRows = useMemo(() => {
    const inventoryState = selectedVaultRepositoryInventoryPage.inventoryState;
    const repositoryFullName =
      inventoryState?.state === "empty" ? undefined : inventoryState?.repositoryFullName;
    if (selectedVaultRepositoryInventoryPage.items.length > 0 && repositoryFullName === undefined) {
      throw new Error("Loaded repository inventory is missing its repository identity.");
    }
    if (repositoryFullName === undefined) {
      return [];
    }
    return selectedVaultRepositoryInventoryPage.items.map((item) =>
      mapRepositoryInventoryItemToDashboardRow({ item, repositoryFullName }),
    );
  }, [
    selectedVaultRepositoryInventoryPage.inventoryState,
    selectedVaultRepositoryInventoryPage.items,
  ]);
  const selectedVaultPullRequestFilter = useMemo(() => {
    const summary = selectedVaultRepositoryInventoryPage.filterSummary;
    const inventoryState = selectedVaultRepositoryInventoryPage.inventoryState;
    if (
      !selectedVaultRepositoryInventoryFilter ||
      !summary ||
      !inventoryState ||
      inventoryState.state === "empty"
    ) {
      return null;
    }
    const value = normalizeRepositoryInventoryFilters(selectedVaultRepositoryInventoryFilter);
    return {
      value,
      options: buildPullRequestFilterOptions({
        labelFacets: summary.labelFacets,
        hiddenLabels: value.hiddenLabels,
        includeNoLabel: value.includeNoLabel,
        noLabelPullRequestCount: summary.noLabelPullRequestCount,
      }),
      totalPullRequestCount: summary.totalPullRequestCount,
      visiblePullRequestCount: summary.visiblePullRequestCount,
      isApplying:
        selectedVaultRepositoryInventoryFilter.revision !== inventoryState.activeFilterRevision,
    };
  }, [
    selectedVaultRepositoryInventoryFilter,
    selectedVaultRepositoryInventoryPage.filterSummary,
    selectedVaultRepositoryInventoryPage.inventoryState,
  ]);
  const vaultIds = useMemo(() => (selectedVault ? [selectedVault._id] : null), [selectedVault]);
  const stagedBranchSummariesByVault = useQuery(
    api.fileStaging.listStagedFilesBranchSummariesByVault,
    vaultIds ? { vaultIds } : "skip",
  );
  const stagedBranchSummariesByVaultId = useMemo(
    () =>
      new Map<string, readonly VaultDashboardStagedBranchSummary[]>(
        (stagedBranchSummariesByVault ?? []).map((summary) => [
          summary.vaultId,
          summary.branchSummaries,
        ]),
      ),
    [stagedBranchSummariesByVault],
  );
  const dashboardData = useMemo(
    () =>
      selectedVaultLoaded
        ? {
            viewModel: {
              vaults: selectedVault ? [selectedVault] : [],
              repositoryInventoryStatesByVaultId:
                selectedVault && selectedVaultRepositoryInventoryPage.inventoryState
                  ? new Map([
                      [selectedVault._id, selectedVaultRepositoryInventoryPage.inventoryState],
                    ])
                  : new Map(),
              remoteBranchPagesByVaultId: selectedVault
                ? new Map([
                    [
                      selectedVault._id,
                      {
                        remoteBranches: selectedVaultRepositoryInventoryRows,
                        status: selectedVaultRepositoryInventoryPage.status,
                        loadMore: selectedVaultRepositoryInventoryPage.loadMore,
                        pullRequestFilter: selectedVaultPullRequestFilter,
                      },
                    ],
                  ])
                : new Map(),
              stagedBranchSummariesByVaultId,
            },
          }
        : null,
    [
      selectedVault,
      selectedVaultRepositoryInventoryPage.loadMore,
      selectedVaultRepositoryInventoryPage.status,
      selectedVaultRepositoryInventoryPage.inventoryState,
      selectedVaultRepositoryInventoryRows,
      selectedVaultPullRequestFilter,
      stagedBranchSummariesByVaultId,
      selectedVaultLoaded,
    ],
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
  const wireCloudflareBuilds = useAction(api.vault.cloudflare.wireBuilds);
  const wireCloudflareConvexBuildAccess = useAction(api.vault.cloudflare.wireConvexBuildAccess);
  const verifyCloudflareInfrastructure = useAction(api.vault.cloudflare.verifyInfrastructure);
  const [cloudflareWorkerRepairActionInFlight, setCloudflareWorkerRepairActionInFlight] =
    useState<CloudflareWorkerRepairActionInFlight | null>(null);
  const [cloudflareBuildsDialogState, setCloudflareBuildsDialogState] =
    useState<VaultCloudflareBuildsDialogState | null>(null);
  const [retryingInfrastructureVaultId, setRetryingInfrastructureVaultId] =
    useState<Id<"vaults"> | null>(null);
  const cloudflareBuildsDialogTarget = useMemo(() => {
    if (
      !cloudflareBuildsDialogState ||
      selectedVault?._id !== cloudflareBuildsDialogState.vaultId
    ) {
      return null;
    }
    const worker = selectedVault.cloudflareWorkers.find(
      (candidate) => candidate.workerId === cloudflareBuildsDialogState.workerId,
    );
    if (!worker) {
      return null;
    }
    const appsById = new Map(selectedVault.apps.map((app) => [app.appId, app]));
    const convexDeployments: VaultCloudflareBuildsDialogTarget["convexDeployments"] = [];
    for (const deployment of selectedVault.convexDeployments) {
      if (deployment.upstream.state !== "present") {
        continue;
      }
      const app = appsById.get(deployment.appId);
      if (!app) {
        throw new Error("Convex deployment references an unknown app.");
      }
      convexDeployments.push({
        convexDeploymentId: deployment.convexDeploymentId,
        projectSlug: deployment.projectSlug,
        rootDirectory: app.rootDirectory,
        teamSlug: deployment.teamSlug,
      });
    }
    convexDeployments.sort(
      (left, right) =>
        left.rootDirectory.localeCompare(right.rootDirectory) ||
        left.convexDeploymentId.localeCompare(right.convexDeploymentId),
    );

    return {
      convexDeployments,
      mode: cloudflareBuildsDialogState.mode,
      workerName: worker.workerName,
    } satisfies VaultCloudflareBuildsDialogTarget;
  }, [cloudflareBuildsDialogState, selectedVault]);
  const createVaultApp = useMutation(api.vault.dashboard.createVaultApp);
  const setRepositoryInventoryFilter = useMutation(
    api.repositoryInventory.setRepositoryInventoryFilter,
  );
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
  const userVaultResourceLinksState = useConvexQuery(
    api.vault.dashboard.getUserVaultResourceLinksState,
    selectedVault ? { vaultId: selectedVault._id } : "skip",
  );
  const viewerAccess = useConvexQuery(api.users.currentViewerAccess);
  const schemaGraphAccessEnabled =
    viewerAccess?.accessKeys.includes("access_schema_graph") === true;
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
  const setVaultResourceLinksOpen = useMutation(
    api.vault.dashboard.setVaultResourceLinksOpen,
  ).withOptimisticUpdate((localStore, args) => {
    const queryArgs = { vaultId: args.vaultId };
    const currentState = localStore.getQuery(
      api.vault.dashboard.getUserVaultResourceLinksState,
      queryArgs,
    );
    if (!currentState) {
      return;
    }

    const nextState = currentState.filter((state) => state.vaultId !== args.vaultId);
    nextState.push({
      resourceLinksOpen: args.resourceLinksOpen,
      vaultId: args.vaultId,
    });

    localStore.setQuery(api.vault.dashboard.getUserVaultResourceLinksState, queryArgs, nextState);
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
            hasApps: addAppRootDialogVault.apps.length > 0,
            id: addAppRootDialogVault._id,
            repositoryFullName: addAppRootDialogVault.routeRepositoryFullName,
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
      repositoryFullName: addConvexDialogVault.routeRepositoryFullName,
      repositoryName: addConvexDialogVault.githubName,
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
      repositoryFullName: addCloudflareWorkerDialogVault.routeRepositoryFullName,
      repositoryName: addCloudflareWorkerDialogVault.githubName,
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
      if (addAppRootModeActive && selectedVaultLoaded) {
        replaceVaultDashboardDialogRoute("add-app-root");
      }
      return;
    }

    if (preparedAddAppRootRepositoryRef.current === vaultToAddAppRoot.repositoryFullName) {
      return;
    }

    preparedAddAppRootRepositoryRef.current = vaultToAddAppRoot.repositoryFullName;
    prepareAddAppRootDialog({ hasAppRoots: vaultToAddAppRoot.hasApps });
  }, [
    addAppRootModeActive,
    prepareAddAppRootDialog,
    replaceVaultDashboardDialogRoute,
    resetAddAppRootDialogState,
    vaultToAddAppRoot,
    selectedVaultLoaded,
  ]);

  useEffect(() => {
    if (!vaultToDelete) {
      if (preparedDeleteRepositoryRef.current) {
        preparedDeleteRepositoryRef.current = null;
        resetDeleteDialogState();
      }
      if (deleteModeActive && selectedVaultLoaded && !deleteDialogVault) {
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
    selectedVaultLoaded,
  ]);

  useEffect(() => {
    if (!vaultToConnectConvex) {
      if (preparedAddConvexRepositoryRef.current) {
        preparedAddConvexRepositoryRef.current = null;
        resetConvexDialogState();
      }
      if (addConvexModeActive && selectedVaultLoaded) {
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
    selectedVaultLoaded,
  ]);

  useEffect(() => {
    if (!vaultToConnectCloudflare) {
      if (preparedAddCloudflareWorkerRepositoryRef.current) {
        preparedAddCloudflareWorkerRepositoryRef.current = null;
        resetCloudflareDialogState();
      }
      if (addCloudflareWorkerModeActive && selectedVaultLoaded) {
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
    selectedVaultLoaded,
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
        !vaultToAddAppRoot.hasApps && addAppRootMode === "app"
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

  const handleRetryVaultDeletion = async (runId: Id<"vaultDeletionRuns">) => {
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

  const handleRepositoryInventoryFilterChange = async (
    vaultId: Id<"vaults">,
    filters: RepositoryInventoryFilters,
  ) => {
    try {
      const currentFilters = selectedVaultPullRequestFilter?.value;
      if (!currentFilters || selectedVault?._id !== vaultId) {
        throw new Error("Pull request filters are not ready.");
      }
      const change = buildRepositoryInventoryFilterChange({
        current: currentFilters,
        next: filters,
      });
      if (change === null) {
        return;
      }
      await setRepositoryInventoryFilter({
        vaultId,
        change,
      });
    } catch (error) {
      toast({
        title: "Could not save pull request filters",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const runCloudflareBuildsConfiguration = async (
    args:
      | {
          kind: "connect_github_repo";
          vaultId: Id<"vaults">;
          workerId: Id<"vaultCloudflareWorkers">;
          convexDeploymentId: Id<"vaultConvexDeployments"> | null;
        }
      | {
          kind: "set_convex_deploy_keys";
          vaultId: Id<"vaults">;
          workerId: Id<"vaultCloudflareWorkers">;
          convexDeploymentId: Id<"vaultConvexDeployments">;
        },
  ): Promise<boolean> => {
    if (cloudflareWorkerRepairActionInFlight) {
      return false;
    }

    setCloudflareWorkerRepairActionInFlight(
      args.kind === "connect_github_repo"
        ? {
            kind: "connect_github_repo",
            vaultId: args.vaultId,
            workerId: args.workerId,
          }
        : {
            kind: "set_convex_deploy_keys",
            vaultId: args.vaultId,
            workerId: args.workerId,
            convexDeploymentId: args.convexDeploymentId,
          },
    );
    try {
      if (args.convexDeploymentId) {
        await wireCloudflareConvexBuildAccess({
          vaultId: args.vaultId,
          workerId: args.workerId,
          convexDeploymentId: args.convexDeploymentId,
        });
      } else {
        await wireCloudflareBuilds({ vaultId: args.vaultId, workerId: args.workerId });
      }
      return true;
    } catch (error) {
      toast({
        title:
          args.kind === "connect_github_repo"
            ? "Could not connect Cloudflare to GitHub"
            : "Could not configure Convex deployment",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setCloudflareWorkerRepairActionInFlight(null);
    }
  };

  const handleConnectCloudflareGithubRepository = (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
  ) => {
    if (selectedVault?._id !== vaultId) {
      return;
    }
    const existingDependency = selectedVault.workerDeploymentDependencies.find(
      (dependency) => dependency.workerId === workerId,
    );
    if (existingDependency) {
      void runCloudflareBuildsConfiguration({
        kind: "connect_github_repo",
        vaultId,
        workerId,
        convexDeploymentId: existingDependency.convexDeploymentId,
      });
      return;
    }
    const hasConvexDeployment = selectedVault.convexDeployments.some(
      (deployment) => deployment.upstream.state === "present",
    );
    if (!hasConvexDeployment) {
      void runCloudflareBuildsConfiguration({
        kind: "connect_github_repo",
        vaultId,
        workerId,
        convexDeploymentId: null,
      });
      return;
    }

    setCloudflareBuildsDialogState({
      mode: "connect_repository",
      selection: { state: "unselected" },
      vaultId,
      workerId,
    });
  };

  const handleDeployCloudflareConvex = (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
  ) => {
    if (
      selectedVault?._id !== vaultId ||
      selectedVault.workerDeploymentDependencies.some(
        (dependency) => dependency.workerId === workerId,
      ) ||
      !selectedVault.convexDeployments.some((deployment) => deployment.upstream.state === "present")
    ) {
      return;
    }

    setCloudflareBuildsDialogState({
      mode: "deploy_convex",
      selection: { state: "unselected" },
      vaultId,
      workerId,
    });
  };

  const handleSubmitCloudflareBuildsDialog = async () => {
    const state = cloudflareBuildsDialogState;
    if (!state || state.selection.state === "unselected" || !cloudflareBuildsDialogTarget) {
      return;
    }
    const completed =
      state.mode === "connect_repository"
        ? await runCloudflareBuildsConfiguration({
            kind: "connect_github_repo",
            vaultId: state.vaultId,
            workerId: state.workerId,
            convexDeploymentId:
              state.selection.state === "deploys_convex"
                ? state.selection.convexDeploymentId
                : null,
          })
        : state.selection.state === "deploys_convex"
          ? await runCloudflareBuildsConfiguration({
              kind: "set_convex_deploy_keys",
              vaultId: state.vaultId,
              workerId: state.workerId,
              convexDeploymentId: state.selection.convexDeploymentId,
            })
          : false;
    if (completed) {
      setCloudflareBuildsDialogState(null);
    }
  };

  const handleSetCloudflareConvexDeployKeys = async (
    vaultId: Id<"vaults">,
    args: {
      workerId: Id<"vaultCloudflareWorkers">;
      convexDeploymentId: Id<"vaultConvexDeployments">;
    },
  ) => {
    await runCloudflareBuildsConfiguration({
      kind: "set_convex_deploy_keys",
      vaultId,
      workerId: args.workerId,
      convexDeploymentId: args.convexDeploymentId,
    });
  };

  const handleVerifyCloudflareInfrastructure = async (
    vaultId: Id<"vaults">,
    workerId: Id<"vaultCloudflareWorkers">,
  ) => {
    if (cloudflareWorkerRepairActionInFlight) {
      return;
    }

    setCloudflareWorkerRepairActionInFlight({
      kind: "verify_infrastructure",
      vaultId,
      workerId,
    });
    try {
      await verifyCloudflareInfrastructure({ vaultId, workerId });
    } catch (error) {
      toast({
        title: "Could not verify Cloudflare infrastructure",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCloudflareWorkerRepairActionInFlight(null);
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

  const { viewModel: dashboardViewModel } = dashboardData;

  const persistedVaultResourceLinksOpenByVaultId = new Map<string, boolean>(
    (userVaultResourceLinksState ?? []).map((state) => [state.vaultId, state.resourceLinksOpen]),
  );

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
  const repositoryDirectoryProps = {
    entries: repositoryDirectory.entries,
    error: repositoryDirectory.error,
    loadMore: repositoryDirectory.loadMore,
    now,
    selectedVaultId: selectedVault?._id ?? null,
    status: repositoryDirectory.status,
  };
  const leftPane = {
    header: <RepositorySummaryDirectoryHeader />,
    content: <RepositorySummaryDirectoryList {...repositoryDirectoryProps} />,
  };
  const dashboardBody =
    selectedVaultMissing && selectedRepositoryFullName ? (
      <VaultDashboardPaneMessage>
        Vault not found: {selectedRepositoryFullName}
      </VaultDashboardPaneMessage>
    ) : isVaultRootRoute ? (
      repositoryDirectory.entries.length === 0 && repositoryDirectory.status === "Exhausted" ? (
        <VaultDashboardEmptyState
          logoRouteSearch={rootRouteSearch}
          replaceRouteSearch={(nextSearch) => {
            void navigate({
              replace: true,
              resetScroll: false,
              search: (currentSearch) => replaceRootLogoRouteSearch(currentSearch, nextSearch),
              state: true,
              to: ".",
            });
          }}
        />
      ) : (
        <RepositorySummaryDirectoryPane {...repositoryDirectoryProps} />
      )
    ) : selectedVault === null ? (
      <VaultDashboardPaneMessage>
        Select a vault from the left sidebar or add one from the right sidebar.
      </VaultDashboardPaneMessage>
    ) : (
      <VaultDashboardView
        deleteModeActive={deleteModeActive}
        developerToolsVisible={developerToolsVisible}
        cloudflareWorkerRepairActionInFlight={cloudflareWorkerRepairActionInFlight}
        isRemovingVault={isDeleting || isCommitting}
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
        persistedVaultResourceLinksOpenByVaultId={persistedVaultResourceLinksOpenByVaultId}
        schemaGraphAccessEnabled={schemaGraphAccessEnabled}
        rootRouteSearch={rootRouteSearch}
        onConnectCloudflareGithubRepository={(vaultId, workerId) => {
          handleConnectCloudflareGithubRepository(vaultId, workerId);
        }}
        onDeployCloudflareConvex={(vaultId, workerId) => {
          handleDeployCloudflareConvex(vaultId, workerId);
        }}
        onOpenDeveloperToolsChange={handleVaultDeveloperToolsOpenChange}
        onRepositoryInventoryFilterChange={(vaultId, filters) => {
          void handleRepositoryInventoryFilterChange(vaultId, filters);
        }}
        onRetryInfrastructureProvisioning={(vaultId) => {
          void handleRetryInfrastructureProvisioning(vaultId);
        }}
        onRetryVaultDeletion={(runId) => {
          void handleRetryVaultDeletion(runId);
        }}
        onResourceLinksOpenChange={handleVaultResourceLinksOpenChange}
        onSetCloudflareConvexDeployKeys={(vaultId, args) => {
          void handleSetCloudflareConvexDeployKeys(vaultId, args);
        }}
        onVerifyCloudflareInfrastructure={(vaultId, workerId) => {
          void handleVerifyCloudflareInfrastructure(vaultId, workerId);
        }}
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

      <VaultDashboardCloudflareBuildsDialog
        isSubmitting={cloudflareWorkerRepairActionInFlight !== null}
        onConvexDeploymentChange={(selection) => {
          setCloudflareBuildsDialogState((current) =>
            current ? { ...current, selection } : current,
          );
        }}
        onOpenChange={(isOpen) => {
          if (!isOpen && cloudflareWorkerRepairActionInFlight === null) {
            setCloudflareBuildsDialogState(null);
          }
        }}
        onSubmit={() => {
          void handleSubmitCloudflareBuildsDialog();
        }}
        open={cloudflareBuildsDialogTarget !== null}
        selection={
          cloudflareBuildsDialogState?.selection ?? {
            state: "unselected",
          }
        }
        target={cloudflareBuildsDialogTarget}
      />

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
