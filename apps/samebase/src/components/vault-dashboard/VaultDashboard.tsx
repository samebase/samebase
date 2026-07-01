import { api } from "../../../convex/_generated/api";
import { AppDialogContent } from "@/components/AppDialogContent";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { VaultLastUpdatedStatus } from "@/components/vault-dashboard/VaultLastUpdatedStatus";
import { VaultProvisioningLog } from "@/components/vault-dashboard/VaultProvisioningLogViewer";
import { VaultResourceRail } from "@/components/vault-dashboard/VaultResourceRail";
import { buildVaultDashboardResourceRailState } from "@/components/vault-dashboard/vaultResourceRailState";
import { ChevronDownIcon, TrashIcon, UpdateIcon } from "@/lib/radixIcons";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  ExternalLink,
  GitBranch,
  Loader2,
} from "lucide-react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { linkStyle } from "../styles";
import { clsx } from "clsx";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { formatRelativeTimeUntil } from "@/lib/formatRelativeTime";
import { getTreeRefreshUiState } from "@/lib/treeRefreshStatus";
import { useNow } from "@/hooks/useNow";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";
import {
  useCallback,
  useEffect,
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
import { VaultBranchFiltersControl } from "@/components/vault-dashboard/VaultBranchFilters";
import { EditedFilesCategoriesPopover } from "@/components/EditedFilesCategories";
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
  replaceRootLogoRouteSearch,
  type RootRouteSearch,
  useRootRouteSearch,
} from "@/routeSearch/root";
import { buildPullRequestLabelStyle } from "@/lib/pullRequestLabels";
import { applySearchPatch } from "@/routing/searchFlags";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  getDefaultVaultBranchFilters,
  normalizeVaultBranchFilters,
  type VaultBranchFilterOption,
  type VaultBranchFilters as VaultBranchFiltersState,
} from "@/components/vault-dashboard/vaultDashboardBranchFilters";
import {
  buildVaultBranchSectionState,
  type VaultBranchCommitChecksSummary,
  type VaultRemoteBranchListItem,
} from "@/components/vault-dashboard/VaultDashboardBranchSectionState";
import {
  buildVaultBranchRowViewModel,
  type VaultBranchCommitViewModel,
} from "@/components/vault-dashboard/vaultDashboardBranchRowViewModel";
import { toast } from "@/components/ui/use-toast";
import { CHAT_ENABLED, CODESPACES_ENABLED } from "../../../shared/featureFlags";
import { buildDefaultAppResourceName } from "../../../shared/appResourceNames";
import { ROOT_VAULT_APP_ROOT } from "../../../shared/vaultAppRoot";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
  SamebaseLogoMark,
  PullRequestStateLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { useDashboardRepositoryRefreshDemand } from "@/components/vault-dashboard/VaultDashboardRepositoryRefreshDemand";

const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";

export type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];
type VaultDashboardStagedBranchSummary = NonNullable<
  (typeof api.fileStaging.listStagedFilesBranchSummaries)["_returnType"]
>[number];
type VaultDashboardConvexDeployment = VaultDashboardVault["convexDeployments"][number];
type VaultDashboardStagedBranchSummariesByVaultId = Map<
  string,
  readonly VaultDashboardStagedBranchSummary[]
>;
export type VaultDashboardViewModel = {
  vaults: VaultDashboardVault[];
  stagedBranchSummariesByVaultId: VaultDashboardStagedBranchSummariesByVaultId;
};
export type VaultDashboardProps = {
  selectedRepositoryFullName?: string;
};

type VaultDashboardLogoComponent = () => ReactNode;

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
type VaultCloudflareDialogTarget = {
  fixedAppRoot: string;
  id: Id<"vaults">;
  repositoryFullName: string;
  repositoryName: string;
};
type VaultConvexDialogTarget = {
  fixedAppRoot: string;
  id: Id<"vaults">;
  repositoryFullName: string;
  repositoryName: string;
};
type CloudflareWorkerOption = {
  workerName: string;
  workerTag: string;
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
    left.workerName.localeCompare(right.workerName) || left.workerTag.localeCompare(right.workerTag)
  );
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
    appRoot: ROOT_VAULT_APP_ROOT,
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
      appRoot: ROOT_VAULT_APP_ROOT,
      error: null,
      isSubmitting: false,
      mode: "app",
    },
    cloudflareConnectDialog: {
      accounts: [],
      appRoot: ROOT_VAULT_APP_ROOT,
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
          appRoot: ROOT_VAULT_APP_ROOT,
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
          appRoot: hasAppRoots ? "" : ROOT_VAULT_APP_ROOT,
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
              ? ROOT_VAULT_APP_ROOT
              : state.addAppRootDialog.appRoot === ROOT_VAULT_APP_ROOT
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
          appRoot: ROOT_VAULT_APP_ROOT,
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
          selectedWorkerName: workers[0]?.workerName ?? "",
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
    repositoryFullName: vault.repositoryFullName,
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

function formatCommitChecksCompactLabel(summary: VaultBranchCommitChecksSummary): string {
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

function formatCommitChecksLabel(summary: VaultBranchCommitChecksSummary): string {
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

function formatCommitChecksTitle(summary: VaultBranchCommitChecksSummary): string {
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

function getCommitChecksStateClassName(summary: VaultBranchCommitChecksSummary): string {
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

function CommitChecksIcon({ summary }: { summary: VaultBranchCommitChecksSummary }) {
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
  const navigate = useNavigate();
  const deleteTriggerDisabled = isRemovingVault || deleteAction.state === "disabled";
  const title = deleteAction.state === "disabled" ? deleteAction.reason : "Remove vault";

  return (
    <span className="absolute right-4 top-4">
      <Link
        to="."
        search={(currentSearch) => ({
          ...currentSearch,
          delete: true,
        })}
        aria-label={`Remove vault ${repositoryFullName}`}
        title={title}
        aria-disabled={deleteTriggerDisabled ? true : undefined}
        tabIndex={deleteTriggerDisabled ? -1 : undefined}
        onClick={(event) => {
          if (deleteTriggerDisabled) {
            event.preventDefault();
            return;
          }
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.altKey ||
            event.ctrlKey ||
            event.shiftKey
          ) {
            return;
          }
          event.preventDefault();
          void navigate({
            search: (currentSearch) => applySearchPatch(currentSearch, { delete: true }),
            to: ".",
          });
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
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitDisabled) {
      return;
    }
    onSubmit();
  };
  const handleAppRootInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (submitDisabled) {
      return;
    }
    onSubmit();
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
                <Input
                  aria-label="App root"
                  value={appRoot}
                  onChange={(event) => onAppRootChange(event.target.value)}
                  onKeyDown={handleAppRootInputKeyDown}
                  disabled={isSubmitting}
                  placeholder="apps/samebase"
                />
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
  const showAppRootInput = appRoot !== ROOT_VAULT_APP_ROOT;
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
  const showAppRootInput = appRoot !== ROOT_VAULT_APP_ROOT;
  const submitDisabled =
    isLoading ||
    isSubmitting ||
    !appRoot.trim() ||
    !selectedAccountId ||
    (mode === "existing" ? !selectedWorkerName : !createWorkerName.trim());

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
                    <AppSelectItem key={worker.workerTag} value={worker.workerName}>
                      {worker.workerName}
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
  repositoryFullName: string;
  branch: VaultRemoteBranchListItem;
  convexDeployments?: readonly VaultDashboardConvexDeployment[];
  productionApps?: readonly VaultBranchProductionApp[];
  schemaGraphAccessEnabled?: boolean;
  stagedSummary?: StagedSummary;
}

type VaultBranchProductionLinkProvider = "cloudflare" | "convex";

type VaultBranchProductionLink = {
  href: string;
  label: string;
  provider: VaultBranchProductionLinkProvider;
  title: string;
};

type VaultBranchProductionApp = {
  appRoot: string;
  links: readonly VaultBranchProductionLink[];
};

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

type VaultBranchProductionLinkInput = {
  appRoot: string;
  href: string;
  label: string;
  provider: VaultBranchProductionLinkProvider;
  sortKey: string;
  title: string;
};

function buildVaultBranchProductionApps(
  links: VaultBranchProductionLinkInput[],
): VaultBranchProductionApp[] {
  const linksByAppRoot = new Map<string, VaultBranchProductionLinkInput[]>();

  for (const link of links) {
    linksByAppRoot.set(link.appRoot, [...(linksByAppRoot.get(link.appRoot) ?? []), link]);
  }

  return [...linksByAppRoot.entries()]
    .sort(([leftAppRoot], [rightAppRoot]) => leftAppRoot.localeCompare(rightAppRoot))
    .map(([appRoot, appLinks]) => ({
      appRoot,
      links: [...appLinks]
        .sort(
          (left, right) =>
            left.provider.localeCompare(right.provider) ||
            left.sortKey.localeCompare(right.sortKey) ||
            left.href.localeCompare(right.href),
        )
        .map((link) => ({
          href: link.href,
          label: link.label,
          provider: link.provider,
          title: link.title,
        })),
    }));
}

function buildVaultBranchProductionAppRootLabel(appRoot: string): string {
  if (appRoot === ".") {
    return "Repository root";
  }
  return appRoot;
}

function buildVaultBranchProductionUrlLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}

function VaultBranchProductionApps({
  productionApps,
}: {
  productionApps: readonly VaultBranchProductionApp[];
}) {
  const showAppRootHeadings =
    productionApps.length > 1 || productionApps.some((app) => app.appRoot !== ".");

  return (
    <div className="grid min-w-0 gap-1">
      {productionApps.map((app) => (
        <div key={app.appRoot} className="grid min-w-0 gap-0.5">
          {showAppRootHeadings ? (
            <div className={branchProductionAppRootClassName}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <ChevronDownIcon className={branchProductionAppRootIconClassName} />
              </span>
              <span className={branchProductionAppRootValueClassName}>
                {buildVaultBranchProductionAppRootLabel(app.appRoot)}
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

function formatAheadBehindCounts(
  aheadBy: number | undefined,
  behindBy: number | undefined,
): string | null {
  if (typeof aheadBy !== "number" || typeof behindBy !== "number") {
    return null;
  }
  if (aheadBy === 0 && behindBy === 0) {
    return null;
  }
  return `↑${aheadBy} ↓${behindBy}`;
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
  const [owner, repoName, extraSegment] = args.repositoryFullName.split("/");

  if (
    !owner ||
    !repoName ||
    typeof extraSegment === "string" ||
    owner.length === 0 ||
    repoName.length === 0
  ) {
    return null;
  }

  const branchRoute = buildVaultFileRoute({
    owner,
    repoName,
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
  convexDeployments: readonly VaultDashboardConvexDeployment[];
  schemaGraphAccessEnabled: boolean;
}): VaultBranchConvexLink[] {
  const [owner, repoName, extraSegment] = args.repositoryFullName.split("/");

  if (
    !owner ||
    !repoName ||
    typeof extraSegment === "string" ||
    owner.length === 0 ||
    repoName.length === 0
  ) {
    return [];
  }

  return [...args.convexDeployments]
    .sort(
      (left, right) =>
        left.appRoot.localeCompare(right.appRoot) ||
        left.deploymentName.localeCompare(right.deploymentName),
    )
    .flatMap((deployment) => {
      const links = [
        {
          href: buildVaultDatabaseRoute({
            owner,
            repoName,
            branch: args.branchName,
            appRoot: deployment.appRoot,
          }),
          label: deployment.appRoot === "." ? "Data" : `Data: ${deployment.appRoot}`,
          title:
            deployment.appRoot === "."
              ? `Open production data for ${deployment.deploymentName}`
              : `Open production data for ${deployment.deploymentName} at ${deployment.appRoot}`,
        },
      ];
      if (args.schemaGraphAccessEnabled) {
        links.push({
          href: buildVaultSchemaRoute({
            owner,
            repoName,
            branch: args.branchName,
            appRoot: deployment.appRoot,
          }),
          label: deployment.appRoot === "." ? "Schema" : `Schema: ${deployment.appRoot}`,
          title:
            deployment.appRoot === "."
              ? `Open Convex schema for ${deployment.deploymentName}`
              : `Open Convex schema for ${deployment.deploymentName} at ${deployment.appRoot}`,
        });
      }
      return links;
    });
}

function CommitChecksSummaryLink({ commit }: { commit: VaultBranchCommitViewModel }) {
  const checks = commit.checks;
  if (!checks) {
    return null;
  }
  const title = [commit.shortSha, commit.title, formatCommitChecksTitle(checks)]
    .filter(Boolean)
    .join(" • ");
  return (
    <a
      href={checks.primaryTargetUrl ?? `${commit.url}/checks`}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={formatCommitChecksLabel(checks)}
      className={clsx(
        "inline-flex min-h-7 items-center gap-1 rounded-sm px-1.5 font-mono text-sm tabular-nums transition-colors hover:underline",
        getCommitChecksStateClassName(checks),
      )}
      title={title}
    >
      <CommitChecksIcon summary={checks} />
      <span>{formatCommitChecksCompactLabel(checks)}</span>
    </a>
  );
}

function BranchPreviewLink({ previewUrl }: { previewUrl: string | undefined }) {
  if (!previewUrl) {
    return null;
  }

  return (
    <a
      href={previewUrl}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Open branch preview"
      className={clsx(
        "inline-flex min-h-7 items-center gap-1 rounded-sm px-1.5 font-mono text-sm transition-colors hover:underline",
        linkStyle,
      )}
      title={previewUrl}
    >
      <ExternalLink className="h-4 w-4" strokeWidth={2} />
      <span>Preview</span>
    </a>
  );
}

function VaultBranchCommitLink({ commit }: { commit: VaultBranchCommitViewModel }) {
  const label = commit.isHead ? `Head ${commit.shortSha}` : commit.shortSha;

  return (
    <a
      href={commit.url}
      target="_blank"
      rel="noreferrer noopener"
      className={clsx(
        "-mx-1 -my-0.5 inline-flex min-h-7 items-center rounded-sm px-1 py-0.5 font-mono text-sm tabular-nums underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
        linkStyle,
      )}
      title={commit.title ? `Open commit: ${commit.title}` : "Open commit"}
    >
      <span>{label}</span>
    </a>
  );
}

function VaultBranchCommitRow({
  aheadBehindLabel,
  commit,
  previewUrl,
}: {
  aheadBehindLabel: string | null;
  commit: VaultBranchCommitViewModel;
  previewUrl: string | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <VaultBranchCommitLink commit={commit} />
      {aheadBehindLabel ? (
        <span className="font-mono text-sm tabular-nums" title="Ahead/behind versus default branch">
          {aheadBehindLabel}
        </span>
      ) : null}
      <CommitChecksSummaryLink commit={commit} />
      <BranchPreviewLink previewUrl={previewUrl} />
    </div>
  );
}

function VaultBranchHiddenCommitCount({ count }: { count: number }) {
  return (
    <div
      aria-label={`${count} more ahead commits not shown`}
      className="font-mono text-sm tabular-nums text-muted-foreground"
      title={`${count} more ahead commits not shown`}
    >
      +{count} more
    </div>
  );
}

function VaultBranchCommitStack({
  aheadBehindLabel,
  aheadBy,
  commits,
  isDefault,
  previewUrl,
}: {
  aheadBehindLabel: string | null;
  aheadBy: number | undefined;
  commits: readonly VaultBranchCommitViewModel[];
  isDefault: boolean;
  previewUrl: string | undefined;
}) {
  const visibleCommits = commits.filter((commit) => commit.checks || commit.isHead);
  if (visibleCommits.length === 0) {
    return null;
  }
  const hiddenAheadCommitCount =
    !isDefault && typeof aheadBy === "number" && aheadBy > visibleCommits.length
      ? aheadBy - visibleCommits.length
      : 0;

  return (
    <div className="space-y-1">
      {visibleCommits.map((commit) => (
        <VaultBranchCommitRow
          key={commit.sha}
          aheadBehindLabel={commit.isHead ? aheadBehindLabel : null}
          commit={commit}
          previewUrl={commit.isHead ? previewUrl : undefined}
        />
      ))}
      {hiddenAheadCommitCount > 0 ? (
        <VaultBranchHiddenCommitCount count={hiddenAheadCommitCount} />
      ) : null}
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
  repositoryFullName,
  branch,
  convexDeployments = [],
  productionApps = [],
  schemaGraphAccessEnabled = false,
}: {
  repositoryFullName: string;
  branch: VaultRemoteBranchListItem;
  convexDeployments?: readonly VaultDashboardConvexDeployment[];
  productionApps?: readonly VaultBranchProductionApp[];
  schemaGraphAccessEnabled?: boolean;
}) {
  const branchRow = buildVaultBranchRowViewModel({
    branch,
    repositoryFullName,
  });
  const pullRequest = branchRow.pullRequest;
  const aheadBehindLabel = formatAheadBehindCounts(branchRow.aheadBy, branchRow.behindBy);
  const normalizedPullRequestLabels = pullRequest?.labels ?? [];
  const pullRequestLabel = pullRequest ? `PR #${pullRequest.number}` : "Pull request";
  const hasPullRequestMetadata =
    pullRequest?.isDraft === true || normalizedPullRequestLabels.length > 0;
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
  const branchRoute = buildVaultDashboardBranchRoute({
    repositoryFullName,
    branchName: branchRow.name,
    openChangedFiles: !branchRow.isDefault,
  });
  const branchSamebaseLinkLabel = branchRow.isDefault ? "Edit" : "View changes";
  const branchSamebaseLinkTitle = branchRow.isDefault
    ? "Open branch in Samebase"
    : "View changes in Samebase";
  const activeProductionApps = branchRow.isDefault ? productionApps : [];
  const activeConvexLinks = branchRow.isDefault
    ? buildVaultDashboardBranchConvexLinks({
        repositoryFullName,
        branchName: branchRow.name,
        convexDeployments,
        schemaGraphAccessEnabled,
      })
    : [];

  return (
    <>
      {branchRow.remoteState === "deleted_upstream" ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1 break-words text-base leading-6 text-muted-foreground/70 line-through">
            {branchRow.name}
          </span>
          <span className="shrink-0 corner-notch-1 border border-border/60 px-1.5 py-0.5 text-xs uppercase tracking-wide text-muted-foreground/80">
            deleted upstream
          </span>
        </div>
      ) : (
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
          <div className="space-y-1 text-base leading-6 text-muted-foreground/80">
            <VaultBranchCommitStack
              aheadBehindLabel={aheadBehindLabel}
              aheadBy={branchRow.aheadBy}
              commits={branchRow.commits}
              isDefault={branchRow.isDefault}
              previewUrl={branchRow.previewUrl}
            />
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
      )}
    </>
  );
}

export function VaultBranchLinkRow({
  vaultId,
  repositoryFullName,
  branch,
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
        repositoryFullName={repositoryFullName}
        branch={branch}
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
  repositoryFullName: string;
  convexDeployments?: readonly VaultDashboardConvexDeployment[];
  remoteBranches: VaultRemoteBranchListItem[];
  productionApps?: readonly VaultBranchProductionApp[];
  schemaGraphAccessEnabled?: boolean;
  stagedSummaries: readonly VaultDashboardStagedBranchSummary[];
  expansion?: VaultBranchListExpansionProps;
}

interface VaultBranchListExpansionProps {
  hiddenBranchCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  placement?: "header" | "list";
}

export function VaultBranchListExpansionControl({
  hiddenBranchCount,
  isExpanded,
  onToggle,
  placement = "list",
}: VaultBranchListExpansionProps) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={placement === "list" ? "w-full" : undefined}
      aria-expanded={isExpanded}
      onClick={onToggle}
    >
      <span>{isExpanded ? "Show less branches" : `Show ${hiddenBranchCount} more branches`}</span>
      <ChevronDownIcon className={isExpanded ? "rotate-180" : undefined} aria-hidden="true" />
    </Button>
  );

  if (placement === "header") {
    return button;
  }

  return <div className="px-3 py-1.5">{button}</div>;
}

function VaultBranchList({
  vaultId,
  repositoryFullName,
  convexDeployments,
  remoteBranches,
  productionApps,
  schemaGraphAccessEnabled,
  stagedSummaries,
  expansion,
}: VaultBranchListProps) {
  const summaryByBranch = new Map(
    stagedSummaries.map((summary) => [summary.branch, summary.counts]),
  );

  return (
    // Let branch rows align with the vault card edge instead of nesting a
    // second inset panel inside the already padded card.
    <div className="-mx-4 overflow-hidden border bg-muted">
      {remoteBranches.map((branch) => (
        <VaultBranchLinkRow
          key={branch.name}
          branch={branch}
          vaultId={vaultId}
          repositoryFullName={repositoryFullName}
          stagedSummary={summaryByBranch.get(branch.name)}
          convexDeployments={branch.isDefault ? convexDeployments : undefined}
          productionApps={branch.isDefault ? productionApps : undefined}
          schemaGraphAccessEnabled={schemaGraphAccessEnabled}
        />
      ))}
      {expansion ? <VaultBranchListExpansionControl {...expansion} /> : null}
    </div>
  );
}

export function VaultBranchHeaderControls({
  expansion,
  filteredBranchCount,
  filterOptions,
  filters,
  hiddenBranchCount,
  onChangeFilters,
  remoteBranchCount,
}: {
  expansion?: VaultBranchListExpansionProps;
  filteredBranchCount: number;
  filterOptions: VaultBranchFilterOption[];
  filters: VaultBranchFiltersState;
  hiddenBranchCount: number;
  onChangeFilters: (nextFilters: VaultBranchFiltersState) => void;
  remoteBranchCount: number;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      {expansion ? <VaultBranchListExpansionControl {...expansion} /> : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {hiddenBranchCount > 0 ? (
          <span className="text-xs text-muted-foreground/80">
            {filteredBranchCount} of {remoteBranchCount}
          </span>
        ) : null}
        <VaultBranchFiltersControl
          value={filters}
          options={filterOptions}
          onChange={onChangeFilters}
        />
      </div>
    </div>
  );
}

function VaultBranchSection({
  convexDeployments,
  filteredBranchCount,
  productionApps,
  repositoryFullName,
  schemaGraphAccessEnabled,
  stagedSummaries,
  vaultId,
  visibleRemoteBranches,
}: {
  convexDeployments?: readonly VaultDashboardConvexDeployment[];
  filteredBranchCount: number;
  productionApps?: readonly VaultBranchProductionApp[];
  repositoryFullName: string;
  schemaGraphAccessEnabled: boolean;
  stagedSummaries: readonly VaultDashboardStagedBranchSummary[];
  vaultId: Id<"vaults">;
  visibleRemoteBranches: VaultRemoteBranchListItem[];
}) {
  return (
    <>
      {filteredBranchCount > 0 ? (
        <VaultBranchList
          vaultId={vaultId}
          repositoryFullName={repositoryFullName}
          remoteBranches={visibleRemoteBranches}
          convexDeployments={convexDeployments}
          productionApps={productionApps}
          schemaGraphAccessEnabled={schemaGraphAccessEnabled}
          stagedSummaries={stagedSummaries}
        />
      ) : null}
    </>
  );
}

function renderVaultDashboardCooldownStatus({
  cooldownUntil,
  label,
  now,
  title,
}: {
  cooldownUntil: number;
  label: string;
  now: number;
  title: string;
}) {
  return (
    <>
      <span className="text-amber-700" title={title}>
        {label}
      </span>
      <span>·</span>
      <span className="font-mono tabular-nums">{formatRelativeTimeUntil(cooldownUntil, now)}</span>
    </>
  );
}

function renderVaultDashboardRepositoryStatus({
  isReady,
  now,
  onManualRepositoryRefresh,
  sharedLastSyncedAt,
  treeRefreshUiState,
  vault,
}: {
  isReady: boolean;
  now: number;
  onManualRepositoryRefresh: (vaultId: Id<"vaults">) => void;
  sharedLastSyncedAt: number | undefined;
  treeRefreshUiState: ReturnType<typeof getTreeRefreshUiState>;
  vault: Pick<VaultDashboardVault, "_id"> & {
    repositoryFullName: string;
    treeRefreshFailureMessage?: string;
  };
}) {
  if (!isReady) {
    return undefined;
  }

  if (treeRefreshUiState.kind === "syncing") {
    return (
      <>
        <UpdateIcon className="h-3 w-3 animate-spin" />
        <span>Syncing...</span>
      </>
    );
  }

  if (treeRefreshUiState.kind === "rate_limited") {
    return renderVaultDashboardCooldownStatus({
      cooldownUntil: treeRefreshUiState.cooldownUntil,
      label: "GitHub rate limited",
      now,
      title: vault.treeRefreshFailureMessage ?? "GitHub API rate limited. Auto-refresh paused.",
    });
  }

  if (treeRefreshUiState.kind === "cooldown") {
    return renderVaultDashboardCooldownStatus({
      cooldownUntil: treeRefreshUiState.cooldownUntil,
      label: "Paused",
      now,
      title: vault.treeRefreshFailureMessage ?? "Auto-refresh paused after a failed sync.",
    });
  }

  if (treeRefreshUiState.kind === "failed") {
    return (
      <span
        className="text-amber-700"
        title={vault.treeRefreshFailureMessage ?? "Last sync failed. Showing cached state."}
      >
        Last sync failed
      </span>
    );
  }

  if (typeof sharedLastSyncedAt === "number") {
    return (
      <VaultLastUpdatedStatus
        lastSyncedAt={sharedLastSyncedAt}
        now={now}
        onRefresh={() => {
          onManualRepositoryRefresh(vault._id);
        }}
        repositoryFullName={vault.repositoryFullName}
      />
    );
  }

  return undefined;
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
  developerToolsVisible: boolean;
  isRemovingVault: boolean;
  retryingDeletionRunId: Id<"vaultDeletionRuns"> | null;
  retryingInfrastructureVaultId: Id<"vaults"> | null;
  now: number;
  viewModel: VaultDashboardViewModel;
  logoRouteSearch: LogoRouteSearch;
  replaceLogoRouteSearch: (nextSearch: LogoRouteSearch) => void;
  openDeveloperToolsByVaultId: Partial<Record<Id<"vaults">, boolean>>;
  persistedVaultBranchFiltersByVaultId: Map<string, VaultBranchFiltersState>;
  persistedVaultResourceLinksOpenByVaultId: Map<string, boolean>;
  schemaGraphAccessEnabled: boolean;
  deleteRepositoryFullName?: string;
  rootRouteSearch: RootRouteSearch;
  onOpenDeveloperToolsChange: (vaultId: Id<"vaults">, isOpen: boolean) => void;
  onManualRepositoryRefresh: (vaultId: Id<"vaults">) => void;
  onRetryInfrastructureProvisioning: (vaultId: Id<"vaults">) => void;
  onRetryVaultDeletion: (runId: Id<"vaultDeletionRuns">) => void;
  onSaveVaultBranchFilters: (
    vaultId: Id<"vaults">,
    nextVaultBranchFilters: VaultBranchFiltersState,
  ) => void;
  onResourceLinksOpenChange: (vaultId: Id<"vaults">, resourceLinksOpen: boolean) => void;
};

function buildVaultDashboardRepositoryNameCounts(vaults: VaultDashboardVault[]) {
  const repositoryNameCounts = new Map<string, number>();
  for (const vault of vaults) {
    repositoryNameCounts.set(
      vault.ghRepoName,
      (repositoryNameCounts.get(vault.ghRepoName) ?? 0) + 1,
    );
  }

  return repositoryNameCounts;
}

function buildVaultProductionApps(vault: VaultDashboardVault): VaultBranchProductionApp[] {
  const cloudflareLinks: VaultBranchProductionLinkInput[] = vault.cloudflareWorkers.flatMap(
    (worker) => {
      if (!worker.workersDevUrl) {
        return [];
      }
      return [
        {
          appRoot: worker.appRoot,
          href: worker.workersDevUrl,
          label: buildVaultBranchProductionUrlLabel(worker.workersDevUrl),
          provider: "cloudflare",
          sortKey: worker.workerName,
          title:
            worker.appRoot === "."
              ? "Open production app"
              : `Open production app for ${worker.appRoot}`,
        },
      ];
    },
  );
  const convexLinks: VaultBranchProductionLinkInput[] = vault.convexDeployments.flatMap(
    (deployment) => {
      if (!deployment.deploymentDashboardUrl) {
        return [];
      }
      return [
        {
          appRoot: deployment.appRoot,
          href: deployment.deploymentDashboardUrl,
          label: `Production: ${deployment.deploymentName}`,
          provider: "convex",
          sortKey: deployment.deploymentName,
          title: `Open production Convex deployment ${deployment.deploymentName}`,
        },
      ];
    },
  );

  return buildVaultBranchProductionApps([...cloudflareLinks, ...convexLinks]);
}

function resolveVaultDashboardActionRepositoryFullName({
  isActive,
  selectedRepositoryFullName,
}: {
  isActive: boolean | undefined;
  selectedRepositoryFullName: string | null;
}) {
  if (!isActive) {
    return undefined;
  }

  return selectedRepositoryFullName ?? undefined;
}

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

function VaultDashboardMissingVaultState({ repositoryFullName }: { repositoryFullName: string }) {
  return (
    <div className="flex min-h-full items-start p-4 text-sm text-muted-foreground">
      Vault not found: {repositoryFullName}
    </div>
  );
}

export function VaultDashboardSelectionEmptyState() {
  return (
    <div className="flex min-h-full items-start p-4 text-sm text-muted-foreground">
      Select a vault from the left sidebar or add one from the right sidebar.
    </div>
  );
}

export function VaultDashboardView({
  developerToolsVisible,
  isRemovingVault,
  retryingDeletionRunId,
  retryingInfrastructureVaultId,
  now,
  viewModel,
  logoRouteSearch,
  replaceLogoRouteSearch,
  openDeveloperToolsByVaultId,
  persistedVaultBranchFiltersByVaultId,
  persistedVaultResourceLinksOpenByVaultId,
  schemaGraphAccessEnabled,
  deleteRepositoryFullName,
  rootRouteSearch,
  onOpenDeveloperToolsChange,
  onManualRepositoryRefresh,
  onRetryInfrastructureProvisioning,
  onRetryVaultDeletion,
  onSaveVaultBranchFilters,
  onResourceLinksOpenChange,
}: VaultDashboardViewProps) {
  const navigate = useNavigate();
  const dashboardRoutePathname = useLocation({
    select: (location) => location.pathname,
  });
  const { stagedBranchSummariesByVaultId, vaults } = viewModel;
  const openProviderAddDialog = useCallback(
    ({ appRoot, provider }: { appRoot: string; provider: "cloudflare" | "convex" }) => {
      void navigate({
        to: ".",
        search: (currentSearch) =>
          applyVaultDashboardProviderAddSearch({
            appRoot,
            currentSearch,
            provider,
          }),
        state: true,
      });
    },
    [navigate],
  );
  const openAppRootAddDialog = useCallback(() => {
    void navigate({
      to: ".",
      search: applyVaultDashboardAddAppRootSearch,
      state: true,
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

  const repositoryNameCounts = buildVaultDashboardRepositoryNameCounts(vaults);
  const isInfrastructureRetryInFlight = retryingInfrastructureVaultId !== null;

  return (
    <VaultDashboardRepositoryList>
      {vaults.map((vault) => {
        const deletion = vault.deletion;
        const isDeletingVault = deletion.state !== "not_deleting";
        const isReady = vault.state === "ready" && !isDeletingVault;
        const remoteBranches = vault.remoteBranches;
        const vaultBranchFilters =
          persistedVaultBranchFiltersByVaultId.get(vault._id) ?? getDefaultVaultBranchFilters();
        const vaultResourceLinksOpen =
          persistedVaultResourceLinksOpenByVaultId.get(vault._id) ?? false;
        const activeRemoteBranches = remoteBranches.filter(
          (branch) => branch.remoteState === "active",
        );
        const defaultBranch = activeRemoteBranches.find((branch) => branch.isDefault)?.name;
        const primaryBranch = defaultBranch || activeRemoteBranches[0]?.name;
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
        const resourceRailState = buildVaultDashboardResourceRailState({
          buildAddAppRootHref: () =>
            buildVaultDashboardAddAppRootHref({
              dashboardRoutePathname,
              rootRouteSearch,
            }),
          addAppRootOnClick: () => {
            openAppRootAddDialog();
          },
          buildAddCloudflareWorkerHref: (appRoot) =>
            buildVaultDashboardProviderAddHref({
              appRoot,
              dashboardRoutePathname,
              provider: "cloudflare",
              rootRouteSearch,
            }),
          addCloudflareWorkerOnClick: (appRoot) => {
            openProviderAddDialog({ appRoot, provider: "cloudflare" });
          },
          buildAddConvexHref: (appRoot) =>
            buildVaultDashboardProviderAddHref({
              appRoot,
              dashboardRoutePathname,
              provider: "convex",
              rootRouteSearch,
            }),
          addConvexOnClick: (appRoot) => {
            openProviderAddDialog({ appRoot, provider: "convex" });
          },
          githubRepositoryUrl,
          isRetryingInfrastructure: retryingInfrastructureVaultId === vault._id,
          retryInfrastructureOnClick: isInfrastructureRetryInFlight
            ? undefined
            : () => {
                onRetryInfrastructureProvisioning(vault._id);
              },
          vault,
        });
        const productionApps = buildVaultProductionApps(vault);
        const sharedLastSyncedAt = vault.lastTreeRefreshAt;
        const treeRefreshUiState = getTreeRefreshUiState({
          now,
          treeRefreshStartedAt: vault.treeRefreshStartedAt,
          lastTreeRefreshAt: vault.lastTreeRefreshAt,
          lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
          treeRefreshFailureKind: vault.treeRefreshFailureKind,
          treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
        });
        const branchSectionState = buildVaultBranchSectionState({
          filters: vaultBranchFilters,
          remoteBranches,
        });
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
              repositoryFullName={vault.repositoryFullName}
            />
          ) : undefined;
        const deleteBlockedSection =
          !isDeletingVault &&
          deleteRepositoryFullName === vault.repositoryFullName &&
          deletion.deleteAction.state === "disabled" ? (
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
        const titleRepositoryOwnerVisible = (repositoryNameCounts.get(vault.ghRepoName) ?? 0) > 1;
        const branchSection =
          isReady && branchSectionState.filteredRemoteBranches.length > 0 ? (
            <VaultBranchSection
              convexDeployments={vault.convexDeployments}
              filteredBranchCount={branchSectionState.filteredRemoteBranches.length}
              schemaGraphAccessEnabled={schemaGraphAccessEnabled}
              vaultId={vault._id}
              repositoryFullName={vault.repositoryFullName}
              visibleRemoteBranches={branchSectionState.visibleRemoteBranches}
              productionApps={productionApps}
              stagedSummaries={stagedBranchSummaries}
            />
          ) : undefined;
        return (
          <div key={vault._id} data-vault-dashboard-repository-card="">
            <VaultDashboardRepositoryCard
              isReady={isReady}
              repositoryOwner={vault.ghRepoOwner}
              repositoryName={vault.ghRepoName}
              titleRepositoryOwnerVisible={titleRepositoryOwnerVisible}
              titleHref={undefined}
              titleTarget={undefined}
              titleTitle={undefined}
              titleClassName={undefined}
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
              repositoryStatus={renderVaultDashboardRepositoryStatus({
                isReady,
                now,
                onManualRepositoryRefresh,
                sharedLastSyncedAt,
                treeRefreshUiState,
                vault,
              })}
              headerControls={
                isReady && remoteBranches.length > 0 ? (
                  <VaultBranchHeaderControls
                    filteredBranchCount={branchSectionState.filteredRemoteBranches.length}
                    filterOptions={branchSectionState.filterOptions}
                    filters={vaultBranchFilters}
                    hiddenBranchCount={branchSectionState.hiddenBranchCount}
                    onChangeFilters={(nextVaultBranchFilters) => {
                      onSaveVaultBranchFilters(vault._id, nextVaultBranchFilters);
                    }}
                    remoteBranchCount={remoteBranches.length}
                    expansion={
                      branchSectionState.hasBranchListOverflow
                        ? {
                            hiddenBranchCount: branchSectionState.collapsedBranchCount,
                            isExpanded: vaultBranchFilters.branchesExpanded,
                            onToggle: () => {
                              onSaveVaultBranchFilters(vault._id, {
                                ...vaultBranchFilters,
                                branchesExpanded: !vaultBranchFilters.branchesExpanded,
                              });
                            },
                            placement: "header",
                          }
                        : undefined
                    }
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
  const dashboardViewModel = useMemo(
    () =>
      vaults
        ? {
            vaults: selectedVault ? [selectedVault] : [],
            stagedBranchSummariesByVaultId,
          }
        : null,
    [selectedVault, stagedBranchSummariesByVaultId, vaults],
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
  const [retryingInfrastructureVaultId, setRetryingInfrastructureVaultId] =
    useState<Id<"vaults"> | null>(null);
  const createVaultAppRoot = useMutation(api.vault.dashboard.createVaultAppRoot);
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
  const userVaultBranchFilters = useConvexQuery(api.vault.dashboard.getUserVaultBranchFilters);
  const userVaultResourceLinksState = useConvexQuery(
    api.vault.dashboard.getUserVaultResourceLinksState,
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
  const deleteModeActive = rootRouteSearch.delete;
  const addConvexModeActive = rootRouteSearch["add-convex"];
  const addCloudflareWorkerModeActive = rootRouteSearch["add-cloudflare"];
  const providerAddAppRoot = rootRouteSearch[DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM] ?? null;
  const selectedActionRepositoryFullName = selectedVault?.repositoryFullName ?? null;
  const deleteRepositoryFullName = resolveVaultDashboardActionRepositoryFullName({
    isActive: deleteModeActive,
    selectedRepositoryFullName: selectedActionRepositoryFullName,
  });
  const addAppRootRepositoryFullName = resolveVaultDashboardActionRepositoryFullName({
    isActive: addAppRootModeActive,
    selectedRepositoryFullName: selectedActionRepositoryFullName,
  });
  const addCloudflareWorkerRepositoryFullName = resolveVaultDashboardActionRepositoryFullName({
    isActive: addCloudflareWorkerModeActive,
    selectedRepositoryFullName: selectedActionRepositoryFullName,
  });
  const addConvexRepositoryFullName = resolveVaultDashboardActionRepositoryFullName({
    isActive: addConvexModeActive,
    selectedRepositoryFullName: selectedActionRepositoryFullName,
  });
  const setVaultBranchFilters = useMutation(
    api.vault.dashboard.setVaultBranchFilters,
  ).withOptimisticUpdate((localStore, args) => {
    const currentFilters = localStore.getQuery(api.vault.dashboard.getUserVaultBranchFilters, {});
    if (!currentFilters) {
      return;
    }

    const normalizedFilters = normalizeVaultBranchFilters(args);
    const nextFilters = currentFilters.filter(
      (vaultBranchFilter) => vaultBranchFilter.vaultId !== args.vaultId,
    );
    const shouldPersist =
      normalizedFilters.hiddenLabels.length > 0 ||
      normalizedFilters.includeDrafts ||
      !normalizedFilters.includeNoLabel ||
      normalizedFilters.branchesExpanded;

    if (shouldPersist) {
      nextFilters.push({
        vaultId: args.vaultId,
        hiddenLabels: normalizedFilters.hiddenLabels,
        includeDrafts: normalizedFilters.includeDrafts,
        includeNoLabel: normalizedFilters.includeNoLabel,
        branchesExpanded: normalizedFilters.branchesExpanded,
      });
    }

    localStore.setQuery(api.vault.dashboard.getUserVaultBranchFilters, {}, nextFilters);
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
  // In-app delete icon clicks should close back to the dashboard entry that
  // existed before the modal; direct links should only replace the delete key.
  const previousDeleteModeActiveRef = useRef(deleteModeActive);
  const shouldPopDeleteHistoryRef = useRef(false);
  const previousAddAppRootModeActiveRef = useRef(addAppRootModeActive);
  const shouldPopAddAppRootHistoryRef = useRef(false);
  const previousAddConvexModeActiveRef = useRef(addConvexModeActive);
  const shouldPopAddConvexHistoryRef = useRef(false);
  const previousAddCloudflareWorkerModeActiveRef = useRef(addCloudflareWorkerModeActive);
  const shouldPopAddCloudflareWorkerHistoryRef = useRef(false);
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

  const { enqueueManualRepositoryRefresh } = useDashboardRepositoryRefreshDemand();

  const addAppRootDialogVault =
    addAppRootRepositoryFullName && vaults
      ? (vaults.find((vault) => vault.repositoryFullName === addAppRootRepositoryFullName) ?? null)
      : null;
  const vaultToAddAppRoot = useMemo(
    () =>
      addAppRootDialogVault?.state === "ready"
        ? {
            hasAppRoots: addAppRootDialogVault.appRoots.length > 0,
            hasRootAppRoot: addAppRootDialogVault.appRoots.some(
              (app) => app.appRoot === ROOT_VAULT_APP_ROOT,
            ),
            id: addAppRootDialogVault._id,
            repositoryFullName: addAppRootDialogVault.repositoryFullName,
          }
        : null,
    [addAppRootDialogVault],
  );
  const deleteDialogVault =
    deleteRepositoryFullName && vaults
      ? (vaults.find((vault) => vault.repositoryFullName === deleteRepositoryFullName) ?? null)
      : null;
  const canOpenDeleteDialog =
    deleteDialogVault?.deletion.state === "not_deleting" &&
    deleteDialogVault.deletion.deleteAction.state === "available";
  const vaultToDelete =
    deleteDialogVault && canOpenDeleteDialog ? buildVaultDeleteIntent(deleteDialogVault) : null;
  const addConvexDialogVault =
    addConvexRepositoryFullName && vaults
      ? (vaults.find((vault) => vault.repositoryFullName === addConvexRepositoryFullName) ?? null)
      : null;
  const canOpenConnectConvexDialog =
    addConvexDialogVault?.state === "ready" && providerAddAppRoot !== null;
  const vaultToConnectConvex = useMemo(() => {
    if (!addConvexDialogVault || !canOpenConnectConvexDialog) {
      return null;
    }

    return {
      fixedAppRoot: providerAddAppRoot,
      id: addConvexDialogVault._id,
      repositoryFullName: addConvexDialogVault.repositoryFullName,
      repositoryName: addConvexDialogVault.ghRepoName,
    };
  }, [addConvexDialogVault, canOpenConnectConvexDialog, providerAddAppRoot]);
  const addCloudflareWorkerDialogVault =
    addCloudflareWorkerRepositoryFullName && vaults
      ? (vaults.find(
          (vault) => vault.repositoryFullName === addCloudflareWorkerRepositoryFullName,
        ) ?? null)
      : null;
  const canOpenConnectCloudflareDialog = addCloudflareWorkerDialogVault?.state === "ready";
  const canOpenScopedCloudflareDialog =
    canOpenConnectCloudflareDialog && providerAddAppRoot !== null;
  const vaultToConnectCloudflare = useMemo(() => {
    if (!addCloudflareWorkerDialogVault || !canOpenScopedCloudflareDialog) {
      return null;
    }

    return {
      fixedAppRoot: providerAddAppRoot,
      id: addCloudflareWorkerDialogVault._id,
      repositoryFullName: addCloudflareWorkerDialogVault.repositoryFullName,
      repositoryName: addCloudflareWorkerDialogVault.ghRepoName,
    };
  }, [addCloudflareWorkerDialogVault, canOpenScopedCloudflareDialog, providerAddAppRoot]);
  const stagedChangesCount = deleteDialogVault?.fileCount ?? 0;
  const connectedCodespacesCount = useConvexQuery(
    api.codespaces.mutations.getConnectedCodespacesCount,
    CODESPACES_ENABLED && vaultToDelete ? { vaultId: vaultToDelete.id } : "skip",
  );

  const clearAddAppRootSearchParam = useCallback(
    ({ preferHistoryBack }: { preferHistoryBack: boolean }) => {
      const shouldPopAddAppRootRoute =
        preferHistoryBack &&
        addAppRootModeActive &&
        shouldPopAddAppRootHistoryRef.current &&
        router.history.canGoBack();
      shouldPopAddAppRootHistoryRef.current = false;

      if (shouldPopAddAppRootRoute) {
        router.history.back();
        return;
      }

      void navigate({
        replace: true,
        search: (currentSearch) =>
          applySearchPatch(currentSearch, { [DASHBOARD_ADD_APP_ROOT_QUERY_PARAM]: null }),
        state: true,
        to: ".",
      });
    },
    [addAppRootModeActive, navigate, router],
  );

  const clearDeleteSearchParam = useCallback(
    ({ preferHistoryBack }: { preferHistoryBack: boolean }) => {
      const shouldPopDeleteRoute =
        preferHistoryBack &&
        deleteModeActive &&
        shouldPopDeleteHistoryRef.current &&
        router.history.canGoBack();
      shouldPopDeleteHistoryRef.current = false;

      if (shouldPopDeleteRoute) {
        router.history.back();
        return;
      }

      void navigate({
        replace: true,
        search: (currentSearch) => applySearchPatch(currentSearch, { delete: null }),
        state: true,
        to: ".",
      });
    },
    [deleteModeActive, navigate, router],
  );

  const clearAddConvexSearchParam = useCallback(
    ({ preferHistoryBack }: { preferHistoryBack: boolean }) => {
      const shouldPopAddConvexRoute =
        preferHistoryBack &&
        addConvexModeActive &&
        shouldPopAddConvexHistoryRef.current &&
        router.history.canGoBack();
      shouldPopAddConvexHistoryRef.current = false;

      if (shouldPopAddConvexRoute) {
        router.history.back();
        return;
      }

      void navigate({
        replace: true,
        search: (currentSearch) =>
          applySearchPatch(currentSearch, {
            "add-convex": null,
            [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]: null,
          }),
        state: true,
        to: ".",
      });
    },
    [addConvexModeActive, navigate, router],
  );

  const clearAddCloudflareWorkerSearchParam = useCallback(
    ({ preferHistoryBack }: { preferHistoryBack: boolean }) => {
      const shouldPopAddCloudflareWorkerRoute =
        preferHistoryBack &&
        addCloudflareWorkerModeActive &&
        shouldPopAddCloudflareWorkerHistoryRef.current &&
        router.history.canGoBack();
      shouldPopAddCloudflareWorkerHistoryRef.current = false;

      if (shouldPopAddCloudflareWorkerRoute) {
        router.history.back();
        return;
      }

      void navigate({
        replace: true,
        search: (currentSearch) =>
          applySearchPatch(currentSearch, {
            "add-cloudflare": null,
            [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]: null,
          }),
        state: true,
        to: ".",
      });
    },
    [addCloudflareWorkerModeActive, navigate, router],
  );

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
    async (accountId: string) => {
      const requestId = cloudflareWorkersRequestIdRef.current + 1;
      cloudflareWorkersRequestIdRef.current = requestId;
      setCloudflareConnectDialogLoading(true);
      setCloudflareConnectDialogWorkers([]);
      try {
        const workers = await listCloudflareWorkers({ accountId });
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
    async (preferredAccountId: string | undefined) => {
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
          accounts.find((account) => account.accountId === preferredAccountId) ?? accounts[0];
        setCloudflareConnectDialogSelectedAccountId(selectedAccount.accountId);
        if (cloudflareDialogResourcesRequestIdRef.current !== requestId) {
          return;
        }
        await loadCloudflareWorkersForAccount(selectedAccount.accountId);
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
    const previousAddAppRootModeActive = previousAddAppRootModeActiveRef.current;
    if (!previousAddAppRootModeActive && addAppRootModeActive) {
      shouldPopAddAppRootHistoryRef.current = true;
    }
    if (!addAppRootModeActive) {
      shouldPopAddAppRootHistoryRef.current = false;
    }
    previousAddAppRootModeActiveRef.current = addAppRootModeActive;

    if (!vaultToAddAppRoot) {
      if (preparedAddAppRootRepositoryRef.current) {
        preparedAddAppRootRepositoryRef.current = null;
        resetAddAppRootDialogState();
      }
      if (addAppRootModeActive && vaults) {
        clearAddAppRootSearchParam({ preferHistoryBack: false });
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
    clearAddAppRootSearchParam,
    prepareAddAppRootDialog,
    resetAddAppRootDialogState,
    vaultToAddAppRoot,
    vaults,
  ]);

  useEffect(() => {
    const previousDeleteModeActive = previousDeleteModeActiveRef.current;
    if (!previousDeleteModeActive && deleteModeActive) {
      shouldPopDeleteHistoryRef.current = true;
    }
    if (!deleteModeActive) {
      shouldPopDeleteHistoryRef.current = false;
    }
    previousDeleteModeActiveRef.current = deleteModeActive;

    if (!vaultToDelete) {
      if (preparedDeleteRepositoryRef.current) {
        preparedDeleteRepositoryRef.current = null;
        resetDeleteDialogState();
      }
      if (deleteModeActive && vaults && !deleteDialogVault) {
        clearDeleteSearchParam({ preferHistoryBack: false });
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
    clearDeleteSearchParam,
    deleteModeActive,
    deleteRepositoryFullName,
    prepareDeleteDialog,
    resetDeleteDialogState,
    deleteDialogVault,
    vaultToDelete,
    vaults,
  ]);

  useEffect(() => {
    const previousAddConvexModeActive = previousAddConvexModeActiveRef.current;
    if (!previousAddConvexModeActive && addConvexModeActive) {
      shouldPopAddConvexHistoryRef.current = true;
    }
    if (!addConvexModeActive) {
      shouldPopAddConvexHistoryRef.current = false;
    }
    previousAddConvexModeActiveRef.current = addConvexModeActive;

    if (!vaultToConnectConvex) {
      if (preparedAddConvexRepositoryRef.current) {
        preparedAddConvexRepositoryRef.current = null;
        resetConvexDialogState();
      }
      if (addConvexModeActive && vaults) {
        clearAddConvexSearchParam({ preferHistoryBack: false });
      }
      return;
    }

    const preparedConvexKey = `${vaultToConnectConvex.repositoryFullName}\n${vaultToConnectConvex.fixedAppRoot}`;
    if (preparedAddConvexRepositoryRef.current === preparedConvexKey) {
      return;
    }

    preparedAddConvexRepositoryRef.current = preparedConvexKey;
    setConvexConnectDialogAppRoot(vaultToConnectConvex.fixedAppRoot);
    setConvexConnectDialogCreateProjectName(
      buildDefaultAppResourceName({
        repositoryName: vaultToConnectConvex.repositoryName,
        provider: "convex",
      }),
    );
    void loadConvexDialogResources();
  }, [
    addConvexModeActive,
    clearAddConvexSearchParam,
    loadConvexDialogResources,
    resetConvexDialogState,
    setConvexConnectDialogAppRoot,
    setConvexConnectDialogCreateProjectName,
    vaultToConnectConvex,
    vaults,
  ]);

  useEffect(() => {
    const previousAddCloudflareWorkerModeActive = previousAddCloudflareWorkerModeActiveRef.current;
    if (!previousAddCloudflareWorkerModeActive && addCloudflareWorkerModeActive) {
      shouldPopAddCloudflareWorkerHistoryRef.current = true;
    }
    if (!addCloudflareWorkerModeActive) {
      shouldPopAddCloudflareWorkerHistoryRef.current = false;
    }
    previousAddCloudflareWorkerModeActiveRef.current = addCloudflareWorkerModeActive;

    if (!vaultToConnectCloudflare) {
      if (preparedAddCloudflareWorkerRepositoryRef.current) {
        preparedAddCloudflareWorkerRepositoryRef.current = null;
        resetCloudflareDialogState();
      }
      if (addCloudflareWorkerModeActive && vaults) {
        clearAddCloudflareWorkerSearchParam({ preferHistoryBack: false });
      }
      return;
    }

    const preparedCloudflareKey = `${vaultToConnectCloudflare.repositoryFullName}\n${vaultToConnectCloudflare.fixedAppRoot}`;
    if (preparedAddCloudflareWorkerRepositoryRef.current === preparedCloudflareKey) {
      return;
    }

    preparedAddCloudflareWorkerRepositoryRef.current = preparedCloudflareKey;
    setCloudflareConnectDialogAppRoot(vaultToConnectCloudflare.fixedAppRoot);
    setCloudflareConnectDialogCreateWorkerName(
      buildDefaultAppResourceName({
        repositoryName: vaultToConnectCloudflare.repositoryName,
        provider: "cloudflare",
      }),
    );
    void loadCloudflareDialogResources(connectedCloudflareConnection?.accountId);
  }, [
    addCloudflareWorkerModeActive,
    clearAddCloudflareWorkerSearchParam,
    connectedCloudflareConnection?.accountId,
    loadCloudflareDialogResources,
    resetCloudflareDialogState,
    setCloudflareConnectDialogAppRoot,
    setCloudflareConnectDialogCreateWorkerName,
    vaultToConnectCloudflare,
    vaults,
  ]);

  const handleAddAppRootDialogOpenChange = (isOpen: boolean) => {
    if (isOpen || isSubmittingAppRoot) {
      return;
    }
    clearAddAppRootSearchParam({ preferHistoryBack: true });
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
          ? ROOT_VAULT_APP_ROOT
          : addAppRootValue;
      await createVaultAppRoot({
        vaultId: vaultToAddAppRoot.id,
        appRoot,
      });
      resetAddAppRootDialogState();
      clearAddAppRootSearchParam({ preferHistoryBack: true });
    } catch (error) {
      setAddAppRootDialogError(error instanceof Error ? error.message : "Could not add app root.");
    } finally {
      setAddAppRootDialogSubmitting(false);
    }
  };

  const handleCloudflareAccountChange = (accountId: string) => {
    setCloudflareConnectDialogSelectedAccountId(accountId);
    setCloudflareConnectDialogSelectedWorkerName("");
    setCloudflareConnectDialogError(null);
    void loadCloudflareWorkersForAccount(accountId);
  };

  const handleConnectCloudflareDialogOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      return;
    }
    clearAddCloudflareWorkerSearchParam({ preferHistoryBack: true });
  };

  const handleConnectConvexDialogOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      return;
    }
    clearAddConvexSearchParam({ preferHistoryBack: true });
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
          appRoot: vaultToConnectConvex.fixedAppRoot,
          projectId: selectedConvexProject.projectId,
        });
      } else {
        await createConvexProject({
          vaultId: vaultToConnectConvex.id,
          appRoot: vaultToConnectConvex.fixedAppRoot,
          projectName: convexCreateProjectName,
        });
      }
      resetConvexDialogState();
      clearAddConvexSearchParam({ preferHistoryBack: true });
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
          appRoot: vaultToConnectCloudflare.fixedAppRoot,
          accountId: selectedCloudflareAccountId,
          workerName: selectedCloudflareWorkerName,
        });
      } else {
        await createCloudflareWorker({
          vaultId: vaultToConnectCloudflare.id,
          appRoot: vaultToConnectCloudflare.fixedAppRoot,
          accountId: selectedCloudflareAccountId,
          workerName: cloudflareCreateWorkerName,
        });
      }
      resetCloudflareDialogState();
      clearAddCloudflareWorkerSearchParam({ preferHistoryBack: true });
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
      clearDeleteSearchParam({ preferHistoryBack: true });
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

  if (!dashboardViewModel || !vaults) {
    return null;
  }

  const persistedVaultBranchFiltersByVaultId = new Map<string, VaultBranchFiltersState>(
    (userVaultBranchFilters ?? []).map((vaultBranchFilter) => [
      vaultBranchFilter.vaultId,
      normalizeVaultBranchFilters(vaultBranchFilter),
    ]),
  );
  const persistedVaultResourceLinksOpenByVaultId = new Map<string, boolean>(
    (userVaultResourceLinksState ?? []).map((state) => [state.vaultId, state.resourceLinksOpen]),
  );

  const saveVaultBranchFilters = async (
    vaultId: Id<"vaults">,
    nextVaultBranchFilters: VaultBranchFiltersState,
  ) => {
    const normalizedVaultBranchFilters = normalizeVaultBranchFilters(nextVaultBranchFilters);

    try {
      await setVaultBranchFilters({
        vaultId,
        hiddenLabels: normalizedVaultBranchFilters.hiddenLabels,
        includeDrafts: normalizedVaultBranchFilters.includeDrafts,
        includeNoLabel: normalizedVaultBranchFilters.includeNoLabel,
        branchesExpanded: normalizedVaultBranchFilters.branchesExpanded,
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

  const handleVaultBranchFiltersChange = (
    vaultId: Id<"vaults">,
    nextVaultBranchFilters: VaultBranchFiltersState,
  ) => {
    void saveVaultBranchFilters(vaultId, nextVaultBranchFilters);
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

    clearDeleteSearchParam({ preferHistoryBack: true });
  };

  const selectedVaultMissing =
    Boolean(selectedRepositoryFullName) && vaults.length > 0 && selectedVault === null;
  const leftPane = {
    header: (
      <div className="flex h-full items-center px-2 text-sm font-medium text-foreground">
        Vaults
      </div>
    ),
    content: (
      <VaultDashboardVaultList selectedVaultId={selectedVault?._id ?? null} vaults={vaults} />
    ),
  };
  const dashboardBody =
    selectedVaultMissing && selectedRepositoryFullName ? (
      <VaultDashboardMissingVaultState repositoryFullName={selectedRepositoryFullName} />
    ) : selectedVault === null ? (
      <VaultDashboardSelectionEmptyState />
    ) : (
      <VaultDashboardView
        developerToolsVisible={developerToolsVisible}
        isRemovingVault={isDeleting || isCommitting}
        retryingDeletionRunId={retryingDeletionRunId}
        retryingInfrastructureVaultId={retryingInfrastructureVaultId}
        now={now}
        viewModel={dashboardViewModel}
        logoRouteSearch={rootRouteSearch}
        replaceLogoRouteSearch={(nextSearch) => {
          void navigate({
            replace: true,
            search: (currentSearch) => replaceRootLogoRouteSearch(currentSearch, nextSearch),
            state: true,
            to: ".",
          });
        }}
        openDeveloperToolsByVaultId={openDeveloperToolsByVaultId}
        persistedVaultBranchFiltersByVaultId={persistedVaultBranchFiltersByVaultId}
        persistedVaultResourceLinksOpenByVaultId={persistedVaultResourceLinksOpenByVaultId}
        schemaGraphAccessEnabled={schemaGraphAccessEnabled}
        deleteRepositoryFullName={deleteRepositoryFullName}
        rootRouteSearch={rootRouteSearch}
        onOpenDeveloperToolsChange={handleVaultDeveloperToolsOpenChange}
        onManualRepositoryRefresh={enqueueManualRepositoryRefresh}
        onRetryInfrastructureProvisioning={(vaultId) => {
          void handleRetryInfrastructureProvisioning(vaultId);
        }}
        onRetryVaultDeletion={(runId) => {
          void handleRetryVaultDeletion(runId);
        }}
        onSaveVaultBranchFilters={handleVaultBranchFiltersChange}
        onResourceLinksOpenChange={handleVaultResourceLinksOpenChange}
      />
    );

  return (
    <AppWorkspaceRouteChrome
      left={leftPane}
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
