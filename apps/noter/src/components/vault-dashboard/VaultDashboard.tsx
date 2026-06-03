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
import {
  buildVaultDashboardRepositoryHashHref,
  buildVaultDashboardRepositoryHashId,
  normalizeVaultDashboardRepositoryHash,
} from "@/components/vault-dashboard/vaultDashboardRepositoryHash";
import { ChevronDownIcon, TrashIcon, UpdateIcon } from "@/lib/radixIcons";
import { CheckIcon, GitBranch, GitCommitHorizontal, Loader2 } from "lucide-react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { linkStyle } from "../styles";
import { clsx } from "clsx";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { formatRelativeTimeUntil } from "@/lib/formatRelativeTime";
import {
  hasCurrentCloudflareBuildFailureLogs,
  hasCurrentCloudflareBranchPreview,
} from "@/lib/cloudflarePreviewLinks";
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
import { useNoterAuthActions } from "@/authClient";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { PROVIDERS_ROUTE } from "@/lib/providersRoute";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
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
import { routePreviewLinkInteractionClassName } from "@/components/routePreviewLinkStyles";
import {
  VaultDashboardAccountSection,
  VaultDashboardEmptyState,
  VaultDashboardRepositoryCard,
  VaultDashboardRepositoryList,
  VaultDashboardScrollTargetEndPadding,
  VaultDashboardSidebarContent,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import { formatAuthProviderLabel } from "@/lib/authProviderLabel";
import type { Id } from "../../../convex/_generated/dataModel";
import { buildVaultCodespaceChatRoute, buildVaultFileRoute } from "@/lib/vaultRoutes";
import {
  formatVaultSourceSetupStep,
  type VaultDashboardSourceSetup,
} from "@/components/vault-dashboard/vaultSourceSetup";
import {
  resolveVaultProviderSetupStatus,
  type VaultDashboardProviderSetup,
} from "@/components/vault-dashboard/vaultProviderSetup";
import { buildGitHubBranchTreeUrl } from "@/lib/githubUrls";
import { type LogoRouteSearch } from "@/lib/logoRouteSearch";
import {
  DASHBOARD_ADD_APP_ROOT_QUERY_PARAM,
  DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM,
  replaceRootLogoRouteSearch,
  type RootRouteSearch,
  useRootRouteSearch,
} from "@/lib/rootRouteSearch";
import { buildPullRequestLabelStyle, normalizePullRequestLabels } from "@/lib/pullRequestLabels";
import { applySearchPatch } from "@/lib/routeSearchFlags";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  getDefaultVaultBranchFilters,
  normalizeVaultBranchFilters,
  type VaultBranchFilterOption,
  type VaultBranchFilters as VaultBranchFiltersState,
} from "@/components/vault-dashboard/vaultDashboardBranchFilters";
import {
  buildVaultBranchSectionState,
  type VaultRemoteBranchListItem,
} from "@/components/vault-dashboard/VaultDashboardBranchSectionState";
import { toast } from "@/components/ui/use-toast";
import { CHAT_ENABLED, CODESPACES_ENABLED } from "../../../shared/featureFlags";
import {
  buildDefaultAppResourceName,
  validateAppResourceName,
} from "../../../shared/appResourceNames";
import { ROOT_VAULT_APP_ROOT } from "../../../shared/vaultAppRoot";
import { toSafeRepoName } from "../../../shared/repoName";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
  NoterLogoMark,
  PullRequestStateLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { useDashboardRepositoryRefreshDemand } from "@/components/vault-dashboard/VaultDashboardRepositoryRefreshDemand";

const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";
const DASHBOARD_NEW_APP_QUERY_PARAM = "new-app";

export type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];

type VaultDashboardLogoComponent = () => ReactNode;
type GitHubRepositoryOwnerOption = {
  login: string;
  kind: "user" | "organization";
};

export type VaultDeleteDialogTarget = {
  repositoryFullName: string;
  isNoterManaged: boolean;
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
type CloudflareAccountOption = {
  accountId: string;
  accountName: string;
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

function compareCloudflareAccountOptions(
  left: CloudflareAccountOption,
  right: CloudflareAccountOption,
) {
  return (
    left.accountName.localeCompare(right.accountName) ||
    left.accountId.localeCompare(right.accountId)
  );
}

function compareCloudflareWorkerOptions(
  left: CloudflareWorkerOption,
  right: CloudflareWorkerOption,
) {
  return (
    left.workerName.localeCompare(right.workerName) || left.workerTag.localeCompare(right.workerTag)
  );
}

function compareGitHubRepositoryOwnerOptions(
  left: GitHubRepositoryOwnerOption,
  right: GitHubRepositoryOwnerOption,
) {
  return left.login.localeCompare(right.login) || left.kind.localeCompare(right.kind);
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
type CreateResourceNameMode = "auto" | "manual";
type AddAppRootMode = "app" | "monorepo";
type CreateResourceNameCheckResult =
  (typeof api.vault.actions.checkCreateRepositoryResourceNames)["_returnType"];
type CreateResourceNameCheckState = {
  key: string;
  result: CreateResourceNameCheckResult;
};
type CreateResourceNameAvailability = CreateResourceNameCheckResult["convex"];

type VaultDashboardLocalState = {
  addAppRootDialog: {
    appRoot: string;
    error: string | null;
    isSubmitting: boolean;
    mode: AddAppRootMode;
  };
  cloudflareAccountDialog: {
    error: string | null;
    isLoadingAccounts: boolean;
    isOpen: boolean;
    isSubmitting: boolean;
    options: CloudflareAccountOption[];
    selectedAccountId: string;
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
  cloudflareWorkerName: string;
  cloudflareWorkerNameMode: CreateResourceNameMode;
  commitError: string | null;
  convexProjectName: string;
  convexProjectNameMode: CreateResourceNameMode;
  createError: string | null;
  deleteError: string | null;
  didAttemptCommit: boolean;
  isCommitting: boolean;
  isCreating: boolean;
  isDeleting: boolean;
  isGlobalChatBusy: boolean;
  isLoadingGithubRepositoryOwners: boolean;
  isSigningOut: boolean;
  githubRepositoryOwnerOptions: GitHubRepositoryOwnerOption[];
  githubRepositoryOwnerLoadError: string | null;
  newRepositoryName: string;
  openDeveloperToolsByVaultId: Partial<Record<Id<"vaults">, boolean>>;
  removeCodespaces: boolean;
  removeConvexProvision: boolean;
  removeGithubRepo: boolean;
  removeCloudflareProvision: boolean;
  retryingDeletionRunId: Id<"vaultDeletionRuns"> | null;
  selectedGithubRepositoryOwner: string;
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
    cloudflareAccountDialog: {
      error: null,
      isLoadingAccounts: false,
      isOpen: false,
      isSubmitting: false,
      options: [],
      selectedAccountId: "",
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
    cloudflareWorkerName: "",
    cloudflareWorkerNameMode: "auto",
    commitError: null,
    convexProjectName: "",
    convexProjectNameMode: "auto",
    createError: null,
    deleteError: null,
    didAttemptCommit: false,
    isCommitting: false,
    isCreating: false,
    isDeleting: false,
    isGlobalChatBusy: false,
    isLoadingGithubRepositoryOwners: false,
    isSigningOut: false,
    githubRepositoryOwnerOptions: [],
    githubRepositoryOwnerLoadError: null,
    newRepositoryName: "",
    openDeveloperToolsByVaultId: {},
    removeCodespaces: false,
    removeConvexProvision: false,
    removeGithubRepo: false,
    removeCloudflareProvision: false,
    retryingDeletionRunId: null,
    selectedGithubRepositoryOwner: "",
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
    clearCreateError: () => {
      setState((state) => (state.createError === null ? state : { ...state, createError: null }));
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
    resetCreateRepositoryName: () => {
      setState((state) => ({
        ...state,
        cloudflareWorkerName: "",
        cloudflareWorkerNameMode: "auto",
        convexProjectName: "",
        convexProjectNameMode: "auto",
        newRepositoryName: "",
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
    setCloudflareAccountDialogError: (error: string | null) => {
      setState((state) => ({
        ...state,
        cloudflareAccountDialog: { ...state.cloudflareAccountDialog, error },
      }));
    },
    setCloudflareAccountDialogOpen: (isOpen: boolean) => {
      setState((state) => ({
        ...state,
        cloudflareAccountDialog: { ...state.cloudflareAccountDialog, isOpen },
      }));
    },
    setCloudflareAccountDialogOptions: (options: CloudflareAccountOption[]) => {
      setState((state) => ({
        ...state,
        cloudflareAccountDialog: { ...state.cloudflareAccountDialog, options },
      }));
    },
    setCloudflareAccountDialogSelectedAccountId: (selectedAccountId: string) => {
      setState((state) => ({
        ...state,
        cloudflareAccountDialog: { ...state.cloudflareAccountDialog, selectedAccountId },
      }));
    },
    setCloudflareAccountsLoading: (isLoadingAccounts: boolean) => {
      setState((state) => ({
        ...state,
        cloudflareAccountDialog: { ...state.cloudflareAccountDialog, isLoadingAccounts },
      }));
    },
    setCloudflareAccountSubmitting: (isSubmitting: boolean) => {
      setState((state) => ({
        ...state,
        cloudflareAccountDialog: { ...state.cloudflareAccountDialog, isSubmitting },
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
    setCloudflareWorkerName: (cloudflareWorkerName: string, mode: CreateResourceNameMode) => {
      setState((state) => ({
        ...state,
        cloudflareWorkerName,
        cloudflareWorkerNameMode: mode,
        createError: null,
      }));
    },
    setCommitError: (commitError: string | null) => {
      setState((state) => ({ ...state, commitError }));
    },
    setConvexProjectName: (convexProjectName: string, mode: CreateResourceNameMode) => {
      setState((state) => ({
        ...state,
        convexProjectName,
        convexProjectNameMode: mode,
        createError: null,
      }));
    },
    setCreateError: (createError: string | null) => {
      setState((state) => ({ ...state, createError }));
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
    setGithubRepositoryOwnerLoadError: (githubRepositoryOwnerLoadError: string | null) => {
      setState((state) => ({ ...state, githubRepositoryOwnerLoadError }));
    },
    setGithubRepositoryOwnerOptions: (
      githubRepositoryOwnerOptions: GitHubRepositoryOwnerOption[],
    ) => {
      setState((state) => {
        const sortedGithubRepositoryOwnerOptions = [...githubRepositoryOwnerOptions].sort(
          compareGitHubRepositoryOwnerOptions,
        );
        const selectedOwnerStillExists = sortedGithubRepositoryOwnerOptions.some(
          (owner) => owner.login === state.selectedGithubRepositoryOwner,
        );
        const selectedGithubRepositoryOwner = selectedOwnerStillExists
          ? state.selectedGithubRepositoryOwner
          : (sortedGithubRepositoryOwnerOptions[0]?.login ?? "");
        return {
          ...state,
          githubRepositoryOwnerLoadError: null,
          githubRepositoryOwnerOptions: sortedGithubRepositoryOwnerOptions,
          selectedGithubRepositoryOwner,
        };
      });
    },
    setIsCommitting: (isCommitting: boolean) => {
      setState((state) => ({ ...state, isCommitting }));
    },
    setIsCreating: (isCreating: boolean) => {
      setState((state) => ({ ...state, isCreating }));
    },
    setIsDeleting: (isDeleting: boolean) => {
      setState((state) => ({ ...state, isDeleting }));
    },
    setRetryingDeletionRunId: (retryingDeletionRunId: Id<"vaultDeletionRuns"> | null) => {
      setState((state) => ({ ...state, retryingDeletionRunId }));
    },
    setIsLoadingGithubRepositoryOwners: (isLoadingGithubRepositoryOwners: boolean) => {
      setState((state) => ({ ...state, isLoadingGithubRepositoryOwners }));
    },
    setIsSigningOut: (isSigningOut: boolean) => {
      setState((state) => ({ ...state, isSigningOut }));
    },
    setNewRepositoryName: (newRepositoryName: string) => {
      setState((state) => ({
        ...state,
        createError: null,
        newRepositoryName,
      }));
    },
    setSelectedGithubRepositoryOwner: (selectedGithubRepositoryOwner: string) => {
      setState((state) => ({
        ...state,
        createError: null,
        selectedGithubRepositoryOwner,
      }));
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
    isNoterManaged: vault.isNoterManaged,
    canRemoveGithubRepo: vault.isNoterManaged && vault.hasConnectedGitHubRepository,
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

export function VaultDashboardDeleteControl({
  deleteAction,
  isRemovingVault = false,
  repositoryFullName,
  repositoryHashId,
}: {
  deleteAction: VaultDashboardDeleteAction;
  isRemovingVault?: boolean;
  repositoryFullName: string;
  repositoryHashId: string;
}) {
  const navigate = useNavigate();
  const deleteTriggerDisabled = isRemovingVault || deleteAction.state === "disabled";
  const title = deleteAction.state === "disabled" ? deleteAction.reason : "Remove vault";

  return (
    <span className="absolute right-4 top-4">
      <Link
        to={DASHBOARD_ROUTE}
        hash={repositoryHashId}
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
            hash: repositoryHashId,
            search: (currentSearch) => applySearchPatch(currentSearch, { delete: true }),
            to: DASHBOARD_ROUTE,
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
                    Only available for confirmed repositories created in Noter.
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
                      Only available for infrastructure provisioned by Noter.
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

export function VaultDashboardCreateDialog({
  children,
  createButtonDisabled,
  footerMessages,
  isCreating,
  onOpenChange,
  onSubmit,
  open,
}: {
  children: ReactNode;
  createButtonDisabled: boolean;
  footerMessages: ReactNode;
  isCreating: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: () => void;
  open: boolean;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createButtonDisabled) {
      return;
    }
    onSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent showCloseButton={!isCreating}>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New App</DialogTitle>
            <DialogDescription>GitHub, Convex, and Cloudflare resources.</DialogDescription>
          </DialogHeader>
          <div className="flex w-full flex-col items-stretch gap-2">{children}</div>
          <CreateControlMessageSlot size="comfortable">{footerMessages}</CreateControlMessageSlot>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createButtonDisabled}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isCreating ? "Creating app..." : "New App"}
            </Button>
          </DialogFooter>
        </form>
      </AppDialogContent>
    </Dialog>
  );
}

/**
 * Visual coverage mounts this same field tree so the create-dialog fixture cannot
 * drift away from the production dialog layout.
 */
export function VaultDashboardCreateFormFields({
  cloudflareWorkerName,
  cloudflareWorkerNameSupport,
  convexProjectName,
  convexProjectNameSupport,
  githubConnected,
  githubRepositoryNameSupport,
  githubRepositoryOwnerOptions,
  hasRequiredCreateConnections,
  isCreating,
  isLoadingGithubRepositoryOwners,
  newRepositoryName,
  onCloudflareWorkerNameBlur,
  onCloudflareWorkerNameChange,
  onConvexProjectNameBlur,
  onConvexProjectNameChange,
  onGithubRepositoryOwnerChange,
  onNewRepositoryNameChange,
  selectedGithubRepositoryOwner,
}: {
  cloudflareWorkerName: string;
  cloudflareWorkerNameSupport: ReactNode;
  convexProjectName: string;
  convexProjectNameSupport: ReactNode;
  githubConnected: boolean;
  githubRepositoryNameSupport: ReactNode;
  githubRepositoryOwnerOptions: GitHubRepositoryOwnerOption[];
  hasRequiredCreateConnections: boolean;
  isCreating: boolean;
  isLoadingGithubRepositoryOwners: boolean;
  newRepositoryName: string;
  onCloudflareWorkerNameBlur: () => void;
  onCloudflareWorkerNameChange: (value: string) => void;
  onConvexProjectNameBlur: () => void;
  onConvexProjectNameChange: (value: string) => void;
  onGithubRepositoryOwnerChange: (value: string) => void;
  onNewRepositoryNameChange: (value: string) => void;
  selectedGithubRepositoryOwner: string;
}) {
  const canEditProviderResourceNames = newRepositoryName.trim().length > 0;
  const providerResourceNameInputDisabled =
    !hasRequiredCreateConnections || isCreating || !canEditProviderResourceNames;
  const ownerSelectPlaceholder = isLoadingGithubRepositoryOwners
    ? "Loading GitHub owners..."
    : "GitHub owner";
  const sortedGithubRepositoryOwnerOptions = [...githubRepositoryOwnerOptions].sort(
    compareGitHubRepositoryOwnerOptions,
  );

  return (
    <>
      {githubConnected && (
        <Select
          value={selectedGithubRepositoryOwner}
          onValueChange={onGithubRepositoryOwnerChange}
          disabled={
            isCreating ||
            !hasRequiredCreateConnections ||
            isLoadingGithubRepositoryOwners ||
            githubRepositoryOwnerOptions.length === 0
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={ownerSelectPlaceholder} />
          </SelectTrigger>
          <AppSelectContent>
            {sortedGithubRepositoryOwnerOptions.map((owner) => (
              <AppSelectItem key={owner.login} value={owner.login}>
                {owner.login}
              </AppSelectItem>
            ))}
          </AppSelectContent>
        </Select>
      )}
      <CreateProviderNameInput
        placeholder="GitHub repo name"
        value={newRepositoryName}
        onChange={onNewRepositoryNameChange}
        icon={<GitHubProviderLogo />}
        disabled={!hasRequiredCreateConnections || isCreating}
      />
      <CreateControlMessageSlot>{githubRepositoryNameSupport}</CreateControlMessageSlot>
      <div
        className={clsx(
          "flex w-full flex-col items-stretch gap-2",
          !canEditProviderResourceNames && "invisible pointer-events-none",
        )}
        aria-hidden={canEditProviderResourceNames ? undefined : true}
      >
        <CreateProviderNameInput
          placeholder="Convex project name"
          value={convexProjectName}
          onChange={onConvexProjectNameChange}
          onBlur={onConvexProjectNameBlur}
          icon={<ConvexProviderLogo />}
          disabled={providerResourceNameInputDisabled}
        />
        <CreateControlMessageSlot>{convexProjectNameSupport}</CreateControlMessageSlot>
        <CreateProviderNameInput
          placeholder="Cloudflare Worker name"
          value={cloudflareWorkerName}
          onChange={onCloudflareWorkerNameChange}
          onBlur={onCloudflareWorkerNameBlur}
          icon={<CloudflareProviderLogo />}
          disabled={providerResourceNameInputDisabled}
        />
        <CreateControlMessageSlot>{cloudflareWorkerNameSupport}</CreateControlMessageSlot>
      </div>
    </>
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
                  placeholder="apps/noter"
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

const VAULT_DASHBOARD_SCROLLABLE_OVERFLOW_VALUES = new Set(["auto", "overlay", "scroll"]);

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

export function VaultDashboardCloudflareAccountDialog({
  accounts,
  error,
  isLoading,
  isSubmitting,
  onAccountChange,
  onOpenChange,
  onSubmit,
  open,
  selectedAccountId,
}: {
  accounts: CloudflareAccountOption[];
  error: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  onAccountChange: (accountId: string) => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: () => void;
  open: boolean;
  selectedAccountId: string;
}) {
  const sortedAccounts = useMemo(
    () => [...accounts].sort(compareCloudflareAccountOptions),
    [accounts],
  );
  const selectedAccount = sortedAccounts.find((account) => account.accountId === selectedAccountId);
  const submitDisabled = isLoading || isSubmitting || !selectedAccountId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>Select Cloudflare Account</DialogTitle>
          <DialogDescription>Choose the Cloudflare account to use for new apps.</DialogDescription>
        </DialogHeader>
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
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
        </div>
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
            Save Account
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}

/**
 * Loads selectable GitHub repo owners once the GitHub connection exists. This is
 * client-owned because owner listing is an authenticated action, not subscribed
 * Convex state; remove the hook if that data moves behind a query.
 */
function useGithubRepositoryOwnerOptions({
  githubConnected,
  listGithubRepositoryOwners,
  setGithubRepositoryOwnerLoadError,
  setGithubRepositoryOwnerOptions,
  setIsLoadingGithubRepositoryOwners,
}: {
  githubConnected: boolean;
  listGithubRepositoryOwners: (
    args: Record<string, never>,
  ) => Promise<GitHubRepositoryOwnerOption[]>;
  setGithubRepositoryOwnerLoadError: (error: string | null) => void;
  setGithubRepositoryOwnerOptions: (owners: GitHubRepositoryOwnerOption[]) => void;
  setIsLoadingGithubRepositoryOwners: (isLoading: boolean) => void;
}) {
  useEffect(() => {
    let shouldIgnoreResult = false;
    if (!githubConnected) {
      setGithubRepositoryOwnerOptions([]);
      setGithubRepositoryOwnerLoadError(null);
      setIsLoadingGithubRepositoryOwners(false);
      return;
    }

    setIsLoadingGithubRepositoryOwners(true);
    setGithubRepositoryOwnerLoadError(null);
    void listGithubRepositoryOwners({})
      .then((owners) => {
        if (!shouldIgnoreResult) {
          setGithubRepositoryOwnerOptions(owners);
        }
      })
      .catch((error: unknown) => {
        if (!shouldIgnoreResult) {
          setGithubRepositoryOwnerOptions([]);
          setGithubRepositoryOwnerLoadError(
            error instanceof Error ? error.message : "Failed to load GitHub owners.",
          );
        }
      })
      .finally(() => {
        if (!shouldIgnoreResult) {
          setIsLoadingGithubRepositoryOwners(false);
        }
      });

    return () => {
      shouldIgnoreResult = true;
    };
  }, [
    githubConnected,
    listGithubRepositoryOwners,
    setGithubRepositoryOwnerLoadError,
    setGithubRepositoryOwnerOptions,
    setIsLoadingGithubRepositoryOwners,
  ]);
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
  productionApps?: readonly VaultBranchProductionApp[];
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

function buildVaultDashboardBranchEditRoute(args: {
  repositoryFullName: string;
  branchName: string;
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

  return buildVaultFileRoute({
    owner,
    repoName,
    branch: args.branchName,
  });
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
  productionApps = [],
}: {
  repositoryFullName: string;
  branch: VaultRemoteBranchListItem;
  productionApps?: readonly VaultBranchProductionApp[];
}) {
  const commitUrl = `https://github.com/${repositoryFullName}/commit/${branch.headCommitSha}`;
  const branchGithubUrl = buildGitHubBranchTreeUrl({
    repositoryFullName,
    branchName: branch.name,
  });
  const aheadBehindLabel = formatAheadBehindCounts(branch.aheadBy, branch.behindBy);
  const hasPullRequestTitle =
    typeof branch.pullRequestTitle === "string" && branch.pullRequestTitle.length > 0;
  const normalizedPullRequestLabels = normalizePullRequestLabels(branch.pullRequestLabels);
  const hasPullRequestLink =
    typeof branch.pullRequestUrl === "string" && branch.pullRequestUrl.length > 0;
  const pullRequestLabel =
    typeof branch.pullRequestNumber === "number"
      ? `PR #${branch.pullRequestNumber}`
      : "Pull request";
  const hasConsolidatedPullRequestLink = hasPullRequestTitle && hasPullRequestLink;
  const hasStandalonePullRequestLink = hasPullRequestLink && !hasConsolidatedPullRequestLink;
  const hasPullRequestMetadata =
    hasStandalonePullRequestLink ||
    branch.pullRequestIsDraft === true ||
    normalizedPullRequestLabels.length > 0;
  const metadataLinkClassName = clsx(
    "-mx-2 -my-1 inline-flex min-h-9 items-center rounded-sm px-2 py-1 text-base leading-6 touch-manipulation underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
    "font-mono",
    linkStyle,
  );
  const branchLabelClassName = clsx(
    "-mx-1.5 -my-1 flex min-h-9 max-w-full items-start gap-1.5 rounded-sm px-1.5 py-1 text-base leading-6",
    hasPullRequestTitle ? "font-mono text-muted-foreground" : "text-muted-foreground",
    !hasPullRequestTitle && branch.isDefault && "font-medium text-foreground",
  );
  const branchEditRoute = buildVaultDashboardBranchEditRoute({
    repositoryFullName,
    branchName: branch.name,
  });
  const hasCurrentPreviewLink = hasCurrentCloudflareBranchPreview({
    pullRequestNumber: branch.pullRequestNumber,
    cloudflareBranchPreviewUrl: branch.cloudflareBranchPreviewUrl,
    cloudflarePreviewPullRequestNumber: branch.cloudflarePreviewPullRequestNumber,
  });
  const hasBuildFailureLogsLink = hasCurrentCloudflareBuildFailureLogs({
    pullRequestNumber: branch.pullRequestNumber,
    cloudflarePreviewLogsUrl: branch.cloudflarePreviewLogsUrl,
    cloudflarePreviewPullRequestNumber: branch.cloudflarePreviewPullRequestNumber,
    cloudflarePreviewStatus: branch.cloudflarePreviewStatus,
  });
  const activeProductionApps = branch.isDefault ? productionApps : [];
  const hasPreviewDeploymentLink =
    !branch.isDefault &&
    hasCurrentPreviewLink &&
    typeof branch.convexPreviewDeploymentDashboardUrl === "string";

  return (
    <>
      {branch.remoteState === "deleted_upstream" ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1 break-words text-base leading-6 text-muted-foreground/70 line-through">
            {branch.name}
          </span>
          <span className="shrink-0 corner-notch-1 border border-border/60 px-1.5 py-0.5 text-xs uppercase tracking-wide text-muted-foreground/80">
            deleted upstream
          </span>
        </div>
      ) : (
        <div className="min-w-0 flex-1 space-y-1.5">
          {hasPullRequestTitle ? (
            hasPullRequestLink ? (
              <a
                href={branch.pullRequestUrl}
                target="_blank"
                rel="noreferrer noopener"
                className={clsx(
                  "-mx-1.5 -my-1 flex min-h-9 max-w-full items-start gap-1.5 rounded-sm px-1.5 py-1 text-base font-medium leading-6 text-foreground touch-manipulation underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
                  linkStyle,
                )}
                title="Open pull request"
              >
                <DashboardLinkIconSlot className="mt-1">
                  <PullRequestStateLogo isDraft={branch.pullRequestIsDraft === true} />
                </DashboardLinkIconSlot>
                <span className="min-w-0 break-words">
                  {pullRequestLabel} {branch.pullRequestTitle}
                </span>
              </a>
            ) : (
              <div className="flex min-h-9 max-w-full items-start gap-1.5 text-base font-medium leading-6 text-foreground">
                <DashboardLinkIconSlot className="mt-1">
                  <PullRequestStateLogo isDraft={branch.pullRequestIsDraft === true} />
                </DashboardLinkIconSlot>
                <span className="min-w-0 break-words">
                  {pullRequestLabel} {branch.pullRequestTitle}
                </span>
              </div>
            )
          ) : null}
          {activeProductionApps.length > 0 ? (
            <VaultBranchProductionApps productionApps={activeProductionApps} />
          ) : null}
          <a
            href={branchGithubUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={clsx(
              branchLabelClassName,
              "underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
              linkStyle,
            )}
            title="Open branch on GitHub"
            aria-label={`Open ${branch.name} branch on GitHub`}
          >
            <DashboardLinkIconSlot className="mt-1">
              <GitBranch aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </DashboardLinkIconSlot>
            <span className="min-w-0 break-words">{branch.name}</span>
          </a>
          <div className="space-y-1 text-base leading-6 text-muted-foreground/80">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <a
                href={commitUrl}
                target="_blank"
                rel="noreferrer noopener"
                className={clsx(metadataLinkClassName, "gap-1.5")}
                title="View commit on GitHub"
              >
                <DashboardLinkIconSlot>
                  <GitCommitHorizontal aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                </DashboardLinkIconSlot>
                <span>Last commit {branch.headCommitSha.slice(0, 7)}</span>
              </a>
              {aheadBehindLabel ? (
                <span
                  className="font-mono tabular-nums"
                  title="Ahead/behind versus the default branch"
                >
                  {aheadBehindLabel}
                </span>
              ) : null}
            </div>
            {hasPullRequestMetadata ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {hasStandalonePullRequestLink ? (
                  <a
                    href={branch.pullRequestUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={clsx(metadataLinkClassName, "gap-1.5")}
                    title="Open pull request"
                  >
                    <DashboardLinkIconSlot>
                      <PullRequestStateLogo isDraft={branch.pullRequestIsDraft === true} />
                    </DashboardLinkIconSlot>
                    <span>{pullRequestLabel}</span>
                  </a>
                ) : null}
                {branch.pullRequestIsDraft ? (
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
            {hasBuildFailureLogsLink ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <a
                  href={branch.cloudflarePreviewLogsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx(
                    metadataLinkClassName,
                    "gap-1.5 text-destructive hover:text-destructive",
                  )}
                  title="Open Cloudflare build logs"
                >
                  <DashboardLinkIconSlot>
                    <CloudflareProviderLogo />
                  </DashboardLinkIconSlot>
                  <span>Build failed logs</span>
                </a>
              </div>
            ) : hasCurrentPreviewLink ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <a
                  href={branch.cloudflareBranchPreviewUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx(metadataLinkClassName, "gap-1.5")}
                  title="Open Cloudflare branch preview"
                >
                  <DashboardLinkIconSlot>
                    <CloudflareProviderLogo />
                  </DashboardLinkIconSlot>
                  <span>Cloudflare preview</span>
                </a>
              </div>
            ) : null}
            {branchEditRoute ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <Link
                  to={branchEditRoute}
                  className={clsx(metadataLinkClassName, "gap-1.5")}
                  title="Open branch in Noter"
                >
                  <DashboardLinkIconSlot>
                    <NoterLogoMark />
                  </DashboardLinkIconSlot>
                  <span>Edit</span>
                </Link>
              </div>
            ) : null}
            {hasPreviewDeploymentLink ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <a
                  href={branch.convexPreviewDeploymentDashboardUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx(metadataLinkClassName, "gap-1.5")}
                  title="Open Convex preview deployment dashboard"
                >
                  <DashboardLinkIconSlot>
                    <ConvexProviderLogo />
                  </DashboardLinkIconSlot>
                  <span>Preview deploy</span>
                </a>
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
  productionApps,
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
        productionApps={productionApps}
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
  remoteBranches: VaultRemoteBranchListItem[];
  productionApps?: readonly VaultBranchProductionApp[];
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
  remoteBranches,
  productionApps,
  expansion,
}: VaultBranchListProps) {
  const stagedSummaries =
    useQuery(api.fileStaging.listStagedFilesBranchSummaries, {
      vaultId,
    }) ?? [];
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
          productionApps={branch.isDefault ? productionApps : undefined}
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
  filteredBranchCount,
  productionApps,
  repositoryFullName,
  vaultId,
  visibleRemoteBranches,
}: {
  filteredBranchCount: number;
  productionApps?: readonly VaultBranchProductionApp[];
  repositoryFullName: string;
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
          productionApps={productionApps}
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

export function VaultSetupProgressSection({
  children,
  label,
  message,
  status,
}: {
  children?: ReactNode;
  label: string;
  message?: string;
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
}: {
  providerSetup: Extract<VaultDashboardProviderSetup, { status: "failed" | "running" }>;
}) {
  const setupStatus = resolveVaultProviderSetupStatus(providerSetup);
  if (!setupStatus) {
    return null;
  }
  const stepLabel = formatVaultSourceSetupStep(providerSetup.step);
  const failureMessage =
    setupStatus.status === "failed" && providerSetup.status === "failed"
      ? `${setupStatus.message} Last failure: ${stepLabel}: ${providerSetup.message}`
      : undefined;

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

type VaultDashboardBodyProps = {
  developerToolsVisible: boolean;
  isRemovingVault: boolean;
  retryingDeletionRunId: Id<"vaultDeletionRuns"> | null;
  now: number;
  logoRouteSearch: LogoRouteSearch;
  replaceLogoRouteSearch: (nextSearch: LogoRouteSearch) => void;
  openDeveloperToolsByVaultId: Partial<Record<Id<"vaults">, boolean>>;
  persistedVaultBranchFiltersByVaultId: Map<string, VaultBranchFiltersState>;
  persistedVaultResourceLinksOpenByVaultId: Map<string, boolean>;
  deleteRepositoryFullName?: string;
  addConvexRepositoryFullName?: string;
  addCloudflareWorkerRepositoryFullName?: string;
  rootRouteSearch: RootRouteSearch;
  vaults: VaultDashboardVault[];
  onOpenDeveloperToolsChange: (vaultId: Id<"vaults">, isOpen: boolean) => void;
  onManualRepositoryRefresh: (vaultId: Id<"vaults">) => void;
  onRetryVaultDeletion: (runId: Id<"vaultDeletionRuns">) => void;
  onSaveVaultBranchFilters: (
    vaultId: Id<"vaults">,
    nextVaultBranchFilters: VaultBranchFiltersState,
  ) => void;
  onResourceLinksOpenChange: (vaultId: Id<"vaults">, resourceLinksOpen: boolean) => void;
};

function findVaultDashboardCardScrollport(element: HTMLElement): HTMLElement | null {
  let currentElement = element.parentElement;
  while (currentElement) {
    if (
      VAULT_DASHBOARD_SCROLLABLE_OVERFLOW_VALUES.has(
        window.getComputedStyle(currentElement).overflowY,
      )
    ) {
      return currentElement;
    }
    currentElement = currentElement.parentElement;
  }
  return null;
}

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

function buildVaultDashboardHashIdForVault({
  repositoryNameCounts,
  vault,
}: {
  repositoryNameCounts: ReadonlyMap<string, number>;
  vault: VaultDashboardVault;
}) {
  return buildVaultDashboardRepositoryHashId({
    hasDuplicateRepositoryName: (repositoryNameCounts.get(vault.ghRepoName) ?? 0) > 1,
    repositoryFullName: vault.repositoryFullName,
    repositoryName: vault.ghRepoName,
  });
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

function resolveVaultDashboardRepositoryFullNameForHash({
  hash,
  vaults,
}: {
  hash: string;
  vaults: VaultDashboardVault[];
}) {
  const repositoryHash = normalizeVaultDashboardRepositoryHash(hash);
  if (!repositoryHash) {
    return undefined;
  }

  const repositoryNameCounts = buildVaultDashboardRepositoryNameCounts(vaults);
  for (const vault of vaults) {
    if (buildVaultDashboardHashIdForVault({ repositoryNameCounts, vault }) === repositoryHash) {
      return vault.repositoryFullName;
    }
  }

  return undefined;
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
        [DASHBOARD_NEW_APP_QUERY_PARAM]: null,
        delete: null,
      })
    : applySearchPatch(currentSearch, {
        "add-cloudflare": true,
        "add-convex": null,
        ...appRootPatch,
        [DASHBOARD_ADD_APP_ROOT_QUERY_PARAM]: null,
        [DASHBOARD_NEW_APP_QUERY_PARAM]: null,
        delete: null,
      });
}

function applyVaultDashboardAddAppRootSearch(currentSearch: RootRouteSearch): RootRouteSearch {
  return applySearchPatch(currentSearch, {
    [DASHBOARD_ADD_APP_ROOT_QUERY_PARAM]: true,
    [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]: null,
    "add-cloudflare": null,
    "add-convex": null,
    [DASHBOARD_NEW_APP_QUERY_PARAM]: null,
    delete: null,
  });
}

function buildVaultDashboardProviderAddHref({
  appRoot,
  provider,
  repositoryHashId,
  rootRouteSearch,
}: {
  appRoot: string;
  provider: "cloudflare" | "convex";
  repositoryHashId: string;
  rootRouteSearch: RootRouteSearch;
}): string {
  return buildPathWithTanStackSearch({
    pathname: DASHBOARD_ROUTE,
    search: applyVaultDashboardProviderAddSearch({
      appRoot,
      currentSearch: rootRouteSearch,
      provider,
    }),
    hash: repositoryHashId,
  });
}

function buildVaultDashboardAddAppRootHref({
  repositoryHashId,
  rootRouteSearch,
}: {
  repositoryHashId: string;
  rootRouteSearch: RootRouteSearch;
}): string {
  return buildPathWithTanStackSearch({
    pathname: DASHBOARD_ROUTE,
    search: applyVaultDashboardAddAppRootSearch(rootRouteSearch),
    hash: repositoryHashId,
  });
}

function scrollVaultDashboardCardIntoView(element: HTMLElement): boolean {
  const scrollport = findVaultDashboardCardScrollport(element);
  if (!scrollport) {
    element.scrollIntoView({
      block: "start",
      inline: "nearest",
    });
    return Math.abs(element.getBoundingClientRect().top) <= 2;
  }

  const elementRect = element.getBoundingClientRect();
  const scrollportRect = scrollport.getBoundingClientRect();
  scrollport.scrollTop += elementRect.top - scrollportRect.top;
  return Math.abs(element.getBoundingClientRect().top - scrollportRect.top) <= 2;
}

// Keep vault hashes app-owned instead of DOM ids, so scrollspy URL updates
// cannot trigger native anchor scrolling.
function readVaultDashboardCardHashId(element: HTMLElement): string | null {
  const hashId = element.dataset.vaultDashboardRepositoryHashId;
  return hashId && hashId.length > 0 ? hashId : null;
}

function findVaultDashboardCardHeader(element: HTMLElement): HTMLElement | null {
  const header = element.querySelector("[data-vault-dashboard-repository-header]");
  return header instanceof HTMLElement ? header : null;
}

function resolveActiveVaultDashboardCardHashId({
  cardElements,
  scrollport,
}: {
  cardElements: Iterable<HTMLElement>;
  scrollport: HTMLElement;
}): string | null {
  const scrollportRect = scrollport.getBoundingClientRect();
  let closestVisibleHeader: {
    distancePx: number;
    hashId: string;
  } | null = null;

  for (const cardElement of cardElements) {
    const hashId = readVaultDashboardCardHashId(cardElement);
    if (!hashId) {
      continue;
    }

    const headerElement = findVaultDashboardCardHeader(cardElement);
    if (!headerElement) {
      continue;
    }

    const headerRect = headerElement.getBoundingClientRect();
    if (headerRect.height <= 0) {
      continue;
    }

    const isHeaderFullyVisible =
      headerRect.top >= scrollportRect.top && headerRect.bottom <= scrollportRect.bottom;
    if (!isHeaderFullyVisible) {
      continue;
    }

    const distancePx = Math.abs(headerRect.top - scrollportRect.top);
    if (!closestVisibleHeader || distancePx < closestVisibleHeader.distancePx) {
      closestVisibleHeader = {
        distancePx,
        hashId,
      };
    }
  }

  return closestVisibleHeader?.hashId ?? null;
}

export function VaultDashboardBody({
  developerToolsVisible,
  isRemovingVault,
  retryingDeletionRunId,
  now,
  logoRouteSearch,
  replaceLogoRouteSearch,
  openDeveloperToolsByVaultId,
  persistedVaultBranchFiltersByVaultId,
  persistedVaultResourceLinksOpenByVaultId,
  deleteRepositoryFullName,
  addConvexRepositoryFullName,
  addCloudflareWorkerRepositoryFullName,
  rootRouteSearch,
  vaults,
  onOpenDeveloperToolsChange,
  onManualRepositoryRefresh,
  onRetryVaultDeletion,
  onSaveVaultBranchFilters,
  onResourceLinksOpenChange,
}: VaultDashboardBodyProps) {
  const navigate = useNavigate();
  const [repositoryLocationHash, setRepositoryLocationHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash,
  );
  const vaultCardElementsRef = useRef(new Map<string, HTMLDivElement>());
  const lastScrolledDeleteRepositoryRef = useRef<string | null>(null);
  const lastScrolledAddConvexRepositoryRef = useRef<string | null>(null);
  const lastScrolledAddCloudflareWorkerRepositoryRef = useRef<string | null>(null);
  const lastExplicitRepositoryHashScrollRef = useRef<string | null>(null);
  const replaceRepositoryLocationHash = useCallback((hashId: string) => {
    const nextHash = buildVaultDashboardRepositoryHashHref(hashId);
    if (window.location.hash === nextHash) {
      return;
    }

    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}${nextHash}`,
    );
    // Scroll tracking is address-bar state only. Hashchange handles explicit
    // navigation; updating repositoryLocationHash here would feed scrollspy
    // changes back into the "scroll to hash" path.
  }, []);
  const openProviderAddDialog = useCallback(
    ({
      appRoot,
      provider,
      repositoryHashId,
    }: {
      appRoot: string;
      provider: "cloudflare" | "convex";
      repositoryHashId: string;
    }) => {
      void navigate({
        to: DASHBOARD_ROUTE,
        hash: repositoryHashId,
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
  const openAppRootAddDialog = useCallback(
    ({ repositoryHashId }: { repositoryHashId: string }) => {
      void navigate({
        to: DASHBOARD_ROUTE,
        hash: repositoryHashId,
        search: applyVaultDashboardAddAppRootSearch,
        state: true,
      });
    },
    [navigate],
  );

  useEffect(() => {
    const syncRepositoryLocationHash = () => {
      setRepositoryLocationHash(window.location.hash);
    };
    syncRepositoryLocationHash();
    window.addEventListener("hashchange", syncRepositoryLocationHash);

    return () => {
      window.removeEventListener("hashchange", syncRepositoryLocationHash);
    };
  }, []);

  const syncActiveRepositoryHash = useCallback(
    (scrollport: HTMLElement) => {
      const activeHashId = resolveActiveVaultDashboardCardHashId({
        cardElements: vaultCardElementsRef.current.values(),
        scrollport,
      });
      if (!activeHashId) {
        return;
      }

      replaceRepositoryLocationHash(activeHashId);
    },
    [replaceRepositoryLocationHash],
  );

  const scrollVaultCardElementForHash = useCallback(
    (vaultCardElement: HTMLDivElement) => {
      const repositoryHash = normalizeVaultDashboardRepositoryHash(repositoryLocationHash);
      if (!repositoryHash) {
        return false;
      }

      if (lastExplicitRepositoryHashScrollRef.current === repositoryHash) {
        return false;
      }

      if (readVaultDashboardCardHashId(vaultCardElement) !== repositoryHash) {
        return false;
      }

      // Direct hash loads resolve after vault data arrives, so anchor the
      // selected card once the target element exists.
      if (scrollVaultDashboardCardIntoView(vaultCardElement)) {
        lastExplicitRepositoryHashScrollRef.current = repositoryHash;
      }
      return true;
    },
    [repositoryLocationHash],
  );

  useEffect(() => {
    // The dashboard scrollport can be replaced while vault data settles; bind
    // after each render so scroll tracking follows the current element.
    const firstVaultCardElement = vaultCardElementsRef.current.values().next().value;
    if (!firstVaultCardElement) {
      return;
    }

    const scrollport = findVaultDashboardCardScrollport(firstVaultCardElement);
    if (!scrollport) {
      return;
    }

    let pendingAnimationFrameId: number | null = null;
    const handleScroll = () => {
      if (pendingAnimationFrameId) {
        return;
      }

      pendingAnimationFrameId = window.requestAnimationFrame(() => {
        pendingAnimationFrameId = null;
        syncActiveRepositoryHash(scrollport);
      });
    };

    scrollport.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollport.removeEventListener("scroll", handleScroll);
      if (pendingAnimationFrameId) {
        window.cancelAnimationFrame(pendingAnimationFrameId);
      }
    };
  });

  useEffect(() => {
    if (!deleteRepositoryFullName) {
      lastScrolledDeleteRepositoryRef.current = null;
      return;
    }

    if (lastScrolledDeleteRepositoryRef.current === deleteRepositoryFullName) {
      return;
    }

    const deleteCardElement = vaultCardElementsRef.current.get(deleteRepositoryFullName);
    if (!deleteCardElement) {
      return;
    }

    // Direct ?delete#vault loads resolve after vault data arrives, so anchor
    // the selected card once the target element exists.
    scrollVaultDashboardCardIntoView(deleteCardElement);
    lastScrolledDeleteRepositoryRef.current = deleteRepositoryFullName;
  }, [deleteRepositoryFullName, vaults]);

  useEffect(() => {
    if (!addConvexRepositoryFullName) {
      lastScrolledAddConvexRepositoryRef.current = null;
      return;
    }

    if (lastScrolledAddConvexRepositoryRef.current === addConvexRepositoryFullName) {
      return;
    }

    const addCardElement = vaultCardElementsRef.current.get(addConvexRepositoryFullName);
    if (!addCardElement) {
      return;
    }

    scrollVaultDashboardCardIntoView(addCardElement);
    lastScrolledAddConvexRepositoryRef.current = addConvexRepositoryFullName;
  }, [addConvexRepositoryFullName, vaults]);

  useEffect(() => {
    if (!addCloudflareWorkerRepositoryFullName) {
      lastScrolledAddCloudflareWorkerRepositoryRef.current = null;
      return;
    }

    if (
      lastScrolledAddCloudflareWorkerRepositoryRef.current === addCloudflareWorkerRepositoryFullName
    ) {
      return;
    }

    const addCardElement = vaultCardElementsRef.current.get(addCloudflareWorkerRepositoryFullName);
    if (!addCardElement) {
      return;
    }

    scrollVaultDashboardCardIntoView(addCardElement);
    lastScrolledAddCloudflareWorkerRepositoryRef.current = addCloudflareWorkerRepositoryFullName;
  }, [addCloudflareWorkerRepositoryFullName, vaults]);

  useEffect(() => {
    const repositoryHash = normalizeVaultDashboardRepositoryHash(repositoryLocationHash);
    if (!repositoryHash) {
      lastExplicitRepositoryHashScrollRef.current = null;
      return;
    }

    if (lastExplicitRepositoryHashScrollRef.current === repositoryHash) {
      return;
    }

    for (const vaultCardElement of vaultCardElementsRef.current.values()) {
      if (scrollVaultCardElementForHash(vaultCardElement)) {
        return;
      }
    }
  }, [repositoryLocationHash, scrollVaultCardElementForHash, vaults]);

  if (vaults.length === 0) {
    return (
      <VaultDashboardEmptyState
        logoRouteSearch={logoRouteSearch}
        replaceRouteSearch={replaceLogoRouteSearch}
      />
    );
  }

  const repositoryNameCounts = buildVaultDashboardRepositoryNameCounts(vaults);

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
        const repositoryHashId = buildVaultDashboardHashIdForVault({
          repositoryNameCounts,
          vault,
        });
        const developerToolsOpen =
          developerToolsVisible && (openDeveloperToolsByVaultId[vault._id] ?? false);
        const resourceRailState = buildVaultDashboardResourceRailState({
          buildAddAppRootHref: () =>
            buildVaultDashboardAddAppRootHref({
              repositoryHashId,
              rootRouteSearch,
            }),
          addAppRootOnClick: () => {
            openAppRootAddDialog({ repositoryHashId });
          },
          buildAddCloudflareWorkerHref: (appRoot) =>
            buildVaultDashboardProviderAddHref({
              appRoot,
              provider: "cloudflare",
              repositoryHashId,
              rootRouteSearch,
            }),
          addCloudflareWorkerOnClick: (appRoot) => {
            openProviderAddDialog({ appRoot, provider: "cloudflare", repositoryHashId });
          },
          buildAddConvexHref: (appRoot) =>
            buildVaultDashboardProviderAddHref({
              appRoot,
              provider: "convex",
              repositoryHashId,
              rootRouteSearch,
            }),
          addConvexOnClick: (appRoot) => {
            openProviderAddDialog({ appRoot, provider: "convex", repositoryHashId });
          },
          githubRepositoryUrl,
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
        const activeSourceSetup =
          vault.sourceSetup.status === "failed" || vault.sourceSetup.status === "running"
            ? vault.sourceSetup
            : null;
        const activeProviderSetup =
          vault.providerSetup.status === "failed" || vault.providerSetup.status === "running"
            ? vault.providerSetup
            : null;
        const hasProvisioningLog =
          Boolean(activeSourceSetup || activeProviderSetup) || vault.isNoterManaged;
        const sourceSetupSection =
          !isReady && activeSourceSetup ? (
            <VaultSourceSetupSection sourceSetup={activeSourceSetup} />
          ) : undefined;
        const providerSetupStatus = isReady
          ? resolveVaultProviderSetupStatus(vault.providerSetup)
          : null;
        const providerSetupSection =
          providerSetupStatus && activeProviderSetup ? (
            <VaultProviderSetupSection providerSetup={activeProviderSetup} />
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

        return (
          <div
            key={vault._id}
            data-vault-dashboard-repository-hash-id={repositoryHashId}
            ref={(element) => {
              if (element) {
                vaultCardElementsRef.current.set(vault.repositoryFullName, element);
                scrollVaultCardElementForHash(element);
                return;
              }

              vaultCardElementsRef.current.delete(vault.repositoryFullName);
            }}
          >
            <VaultDashboardRepositoryCard
              isReady={isReady}
              repositoryOwner={vault.ghRepoOwner}
              repositoryName={vault.ghRepoName}
              titleRepositoryOwnerVisible={titleRepositoryOwnerVisible}
              titleHref={buildVaultDashboardRepositoryHashHref(repositoryHashId)}
              titleTarget={undefined}
              titleTitle="Link to vault"
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
                    repositoryHashId={repositoryHashId}
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
              branchSection={
                isReady && branchSectionState.filteredRemoteBranches.length > 0 ? (
                  <VaultBranchSection
                    filteredBranchCount={branchSectionState.filteredRemoteBranches.length}
                    vaultId={vault._id}
                    repositoryFullName={vault.repositoryFullName}
                    visibleRemoteBranches={branchSectionState.visibleRemoteBranches}
                    productionApps={productionApps}
                  />
                ) : undefined
              }
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

function resolveCreateResourceNameCheckValue(args: {
  mode: CreateResourceNameMode;
  autoName: string;
  manualName: string;
}): string {
  if (args.mode === "manual") {
    return args.manualName;
  }
  return args.autoName;
}

function resolveCreateResourceName(args: {
  mode: CreateResourceNameMode;
  autoName: string;
  manualName: string;
  availability: CreateResourceNameAvailability | null;
}): string {
  if (args.mode === "manual") {
    return args.manualName;
  }
  if (args.availability?.status === "taken" && args.availability.suggestion) {
    return args.availability.suggestion;
  }
  return args.autoName;
}

function isCreateResourceNameAvailabilityBlocking(
  mode: CreateResourceNameMode,
  availability: CreateResourceNameAvailability | null,
): boolean {
  if (!availability || availability.status === "available") {
    return false;
  }
  return !(mode === "auto" && availability.status === "taken" && availability.suggestion);
}

function isGitHubRepositoryNameAvailabilityBlocking(
  availability: CreateResourceNameAvailability | null,
): boolean {
  return Boolean(availability && availability.status !== "available");
}

function buildCreateResourceNameCheckKey(args: {
  githubRepositoryOwner: string;
  githubRepositoryName: string;
  convexProjectName: string;
  cloudflareWorkerName: string;
}): string {
  return `${args.githubRepositoryOwner}\n${args.githubRepositoryName}\n${args.convexProjectName}\n${args.cloudflareWorkerName}`;
}

/**
 * Debounces provider-name availability reads while the create form changes.
 * Submit still revalidates on the server, so this hook only owns early feedback.
 */
function useCreateResourceNameAvailability(args: {
  enabled: boolean;
  githubRepositoryOwner: string;
  githubRepositoryName: string;
  convexProjectName: string;
  cloudflareWorkerName: string;
  checkCreateRepositoryResourceNames: (input: {
    githubRepositoryOwner: string;
    githubRepositoryName: string;
    convexProjectName: string;
    cloudflareWorkerName: string;
  }) => Promise<CreateResourceNameCheckResult>;
}): {
  checkState: CreateResourceNameCheckState | null;
  checkError: string | null;
  isChecking: boolean;
} {
  const {
    enabled,
    githubRepositoryOwner,
    githubRepositoryName,
    convexProjectName,
    cloudflareWorkerName,
    checkCreateRepositoryResourceNames,
  } = args;
  const [checkState, setCheckState] = useState<CreateResourceNameCheckState | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const checkKey = buildCreateResourceNameCheckKey({
    githubRepositoryOwner,
    githubRepositoryName,
    convexProjectName,
    cloudflareWorkerName,
  });

  useEffect(() => {
    if (!enabled) {
      setCheckError(null);
      setCheckState(null);
      setIsChecking(false);
      return;
    }

    let canceled = false;
    setCheckError(null);
    setIsChecking(true);

    const timeoutId = window.setTimeout(() => {
      void checkCreateRepositoryResourceNames({
        githubRepositoryOwner,
        githubRepositoryName,
        convexProjectName,
        cloudflareWorkerName,
      })
        .then((result) => {
          if (canceled) {
            return;
          }
          setCheckState({ key: checkKey, result });
          setIsChecking(false);
        })
        .catch((error) => {
          if (canceled) {
            return;
          }
          setCheckError(error instanceof Error ? error.message : "Could not check provider names.");
          setCheckState(null);
          setIsChecking(false);
        });
    }, 350);

    return () => {
      canceled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    enabled,
    githubRepositoryOwner,
    githubRepositoryName,
    convexProjectName,
    cloudflareWorkerName,
    checkCreateRepositoryResourceNames,
    checkKey,
  ]);

  return { checkState, checkError, isChecking };
}

function CreateResourceNameFeedback({
  children,
  message,
  suggestion,
  onUseSuggestion,
}: {
  children?: ReactNode;
  message: string;
  suggestion: string | null;
  onUseSuggestion: (suggestion: string) => void;
}) {
  return (
    <div className="text-xs text-red-600">
      <span>{message}</span>
      {suggestion && (
        <button
          type="button"
          className={clsx("ml-1 text-left text-blue-600 underline underline-offset-2", linkStyle)}
          onClick={() => {
            onUseSuggestion(suggestion);
          }}
        >
          Use {suggestion}
        </button>
      )}
      {children}
    </div>
  );
}

function CreateResourceNameStatus({
  children,
  kind,
}: {
  children: ReactNode;
  kind: "available" | "checking" | "info";
}) {
  return (
    <div
      className={clsx(
        "flex min-w-0 items-start text-xs",
        kind !== "info" && "gap-1.5",
        kind === "available" && "text-green-600",
        (kind === "checking" || kind === "info") && "text-muted-foreground",
      )}
      role="status"
    >
      {kind === "available" ? (
        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : kind === "checking" ? (
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : null}
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

// Use toSafeRepoName here so the slash preview matches repository provisioning.
function buildGitHubRepositoryNameSlashReplacement(rawName: string): string | null {
  const repositoryName = toSafeRepoName(rawName);
  if (!rawName.includes("/") || !repositoryName) {
    return null;
  }
  return repositoryName;
}

export function GitHubRepositoryNameSlashPreview({ rawName }: { rawName: string }) {
  const repositoryName = buildGitHubRepositoryNameSlashReplacement(rawName);
  if (!repositoryName) {
    return null;
  }
  return (
    <CreateResourceNameStatus kind="info">
      GitHub repo name:{" "}
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
        {repositoryName}
      </code>
    </CreateResourceNameStatus>
  );
}

function CreateResourceNameHelp({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted-foreground">{children}</div>;
}

function CreateResourceNameInlineAction({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={clsx("text-left", linkStyle)} onClick={onClick}>
      {children}
    </button>
  );
}

export function CreateControlMessageSlot({
  children,
  size = "compact",
}: {
  children: ReactNode;
  size?: "compact" | "comfortable";
}) {
  const isEmpty =
    children === null || children === undefined || typeof children === "boolean" || children === "";
  const sizeClassName = size === "comfortable" ? "min-h-5" : "min-h-4";

  return (
    <div
      className={clsx("min-w-0", sizeClassName, isEmpty && "invisible pointer-events-none")}
      aria-hidden={isEmpty ? true : undefined}
    >
      {children}
    </div>
  );
}

export function CreateProviderNameInput({
  disabled,
  icon,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  value,
}: {
  disabled: boolean;
  icon: ReactNode;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="relative w-full">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-2.5 flex w-5 items-center justify-center text-muted-foreground"
      >
        {icon}
      </span>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className="w-full pl-9"
        disabled={disabled}
        aria-label={placeholder}
      />
    </div>
  );
}

export function VaultDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const rootRouteSearch = useRootRouteSearch();
  const developerToolsVisible = rootRouteSearch[DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM] === true;
  const vaults = useQuery(api.vault.dashboard.getUserVaults);
  const now = useNow();
  const deleteVault = useAction(api.vault.actions.deleteVault);
  const retryDeleteVault = useAction(api.vault.actions.retryDeleteVault);
  const createRepository = useAction(api.vault.actions.createRepository);
  const checkCreateRepositoryResourceNames = useAction(
    api.vault.actions.checkCreateRepositoryResourceNames,
  );
  const listGithubRepositoryOwners = useAction(api.vault.actions.listRepositoryOwners);
  const commitStaging = useAction(api.fileStagingActions.commitStaging);
  const listConvexProjects = useAction(api.vault.convex.listProjects);
  const connectExistingConvexProject = useAction(api.vault.convex.connectExistingProject);
  const createConvexProject = useAction(api.vault.convex.createProject);
  const listCloudflareAccounts = useAction(api.vault.cloudflare.listAccounts);
  const listCloudflareWorkers = useAction(api.vault.cloudflare.listWorkers);
  const selectCloudflareDefaultAccount = useAction(api.vault.cloudflare.selectDefaultAccount);
  const connectExistingCloudflareWorker = useAction(api.vault.cloudflare.connectExistingWorker);
  const createCloudflareWorker = useAction(api.vault.cloudflare.createWorker);
  const createVaultAppRoot = useMutation(api.vault.dashboard.createVaultAppRoot);
  const persistAccountPanelOpen = useMutation(
    api.dashboardSettings.setAccountPanelOpen,
  ).withOptimisticUpdate((localStore, args) => {
    const currentSettings = localStore.getQuery(api.dashboardSettings.getDashboardSettings, {});
    if (!currentSettings) {
      return;
    }
    localStore.setQuery(
      api.dashboardSettings.getDashboardSettings,
      {},
      {
        ...currentSettings,
        accountPanelOpen: args.isOpen,
      },
    );
  });
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
  const githubConnection = useConvexQuery(api.users.getGithubConnectionStatus);
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus);
  const cloudflareConnection = useConvexQuery(api.users.getCloudflareConnectionStatus);
  const userVaultBranchFilters = useConvexQuery(api.vault.dashboard.getUserVaultBranchFilters);
  const userVaultResourceLinksState = useConvexQuery(
    api.vault.dashboard.getUserVaultResourceLinksState,
  );
  const user = useConvexQuery(api.users.viewer);
  const authProviders = useConvexQuery(api.users.getViewerAuthProviders);
  const dashboardSettings = useConvexQuery(api.dashboardSettings.getDashboardSettings);
  const { signOut } = useNoterAuthActions();
  const dashboardAccountPanelOpen = dashboardSettings?.accountPanelOpen;
  const dashboardGlobalChatOpen = dashboardSettings?.globalChatOpen;
  const addAppRootModeActive = rootRouteSearch[DASHBOARD_ADD_APP_ROOT_QUERY_PARAM] === true;
  const newAppModeActive = rootRouteSearch[DASHBOARD_NEW_APP_QUERY_PARAM] === true;
  const deleteModeActive = rootRouteSearch.delete;
  const addConvexModeActive = rootRouteSearch["add-convex"];
  const addCloudflareWorkerModeActive = rootRouteSearch["add-cloudflare"];
  const providerAddAppRoot = rootRouteSearch[DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM] ?? null;
  const deleteRepositoryFullName =
    deleteModeActive && vaults
      ? resolveVaultDashboardRepositoryFullNameForHash({
          hash: location.hash,
          vaults,
        })
      : undefined;
  const addAppRootRepositoryFullName =
    addAppRootModeActive && vaults
      ? resolveVaultDashboardRepositoryFullNameForHash({
          hash: location.hash,
          vaults,
        })
      : undefined;
  const addCloudflareWorkerRepositoryFullName =
    addCloudflareWorkerModeActive && vaults
      ? resolveVaultDashboardRepositoryFullNameForHash({
          hash: location.hash,
          vaults,
        })
      : undefined;
  const addConvexRepositoryFullName =
    addConvexModeActive && vaults
      ? resolveVaultDashboardRepositoryFullNameForHash({
          hash: location.hash,
          vaults,
        })
      : undefined;
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
  const cloudflareAccountDialogRequestIdRef = useRef(0);
  const dashboardLocalStore = useVaultDashboardLocalStore();
  const {
    addAppRootDialog,
    cloudflareAccountDialog,
    cloudflareConnectDialog,
    cloudflareWorkerName,
    cloudflareWorkerNameMode,
    commitError,
    convexProjectName,
    convexProjectNameMode,
    convexConnectDialog,
    createError,
    deleteError,
    didAttemptCommit,
    isCommitting,
    isCreating,
    isDeleting,
    isGlobalChatBusy,
    isLoadingGithubRepositoryOwners,
    isSigningOut,
    githubRepositoryOwnerLoadError,
    githubRepositoryOwnerOptions,
    newRepositoryName,
    openDeveloperToolsByVaultId,
    removeCodespaces,
    removeConvexProvision,
    removeGithubRepo,
    removeCloudflareProvision,
    retryingDeletionRunId,
    selectedGithubRepositoryOwner,
    shouldAutoFocusChatInput,
  } = useSelector(dashboardLocalStore);
  const {
    appRoot: addAppRootValue,
    error: addAppRootError,
    isSubmitting: isSubmittingAppRoot,
    mode: addAppRootMode,
  } = addAppRootDialog;
  const {
    error: cloudflareAccountDialogError,
    isLoadingAccounts: isLoadingCloudflareAccounts,
    isOpen: cloudflareAccountDialogOpen,
    isSubmitting: isSubmittingCloudflareAccount,
    options: cloudflareDefaultAccountOptions,
    selectedAccountId: selectedCloudflareDefaultAccountId,
  } = cloudflareAccountDialog;
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
    clearCreateError,
    markCommitAttempted,
    prepareAddAppRootDialog,
    prepareDeleteDialog,
    resetCloudflareConnectDialogState,
    resetConvexConnectDialogState,
    resetCreateRepositoryName,
    resetDeleteDialogState,
    setCloudflareAccountDialogError,
    setCloudflareAccountDialogOpen,
    setCloudflareAccountDialogOptions,
    setCloudflareAccountDialogSelectedAccountId,
    setCloudflareAccountSubmitting,
    setAddAppRootDialogAppRoot,
    setAddAppRootDialogError,
    setAddAppRootDialogMode,
    setAddAppRootDialogSubmitting,
    setCloudflareAccountsLoading,
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
    setCloudflareWorkerName,
    setCommitError,
    setConvexConnectDialogConnectMode,
    setConvexConnectDialogCreateProjectName,
    setConvexConnectDialogProjects,
    setConvexConnectDialogError,
    setConvexConnectDialogLoading,
    setConvexConnectDialogSelectedProjectId,
    setConvexConnectDialogSubmitting,
    setConvexProjectName,
    setCreateError,
    setDeleteError,
    setDeleteOption,
    setDeveloperToolsOpen,
    setGithubRepositoryOwnerLoadError,
    setGithubRepositoryOwnerOptions,
    setGlobalChatAutoFocus,
    setGlobalChatBusy,
    setIsCommitting,
    setIsCreating,
    setIsDeleting,
    setIsLoadingGithubRepositoryOwners,
    setIsSigningOut,
    setNewRepositoryName,
    setRetryingDeletionRunId,
    setSelectedGithubRepositoryOwner,
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

  const closeNewAppDialog = () => {
    void navigate({
      hash: true,
      replace: true,
      search: (currentSearch) =>
        applySearchPatch(currentSearch, { [DASHBOARD_NEW_APP_QUERY_PARAM]: null }),
      state: true,
      to: ".",
    });
  };
  const openNewAppDialog = () => {
    void navigate({
      hash: true,
      search: (currentSearch) =>
        applySearchPatch(currentSearch, {
          [DASHBOARD_ADD_APP_ROOT_QUERY_PARAM]: null,
          "add-cloudflare": null,
          "add-convex": null,
          [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]: null,
          delete: null,
          [DASHBOARD_NEW_APP_QUERY_PARAM]: true,
        }),
      state: true,
      to: ".",
    });
  };

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
        hash: true,
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
        hash: true,
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
        hash: true,
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
        hash: true,
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

  const loadCloudflareAccountDialogResources = useCallback(
    async (preferredAccountId: string | undefined) => {
      const requestId = cloudflareAccountDialogRequestIdRef.current + 1;
      cloudflareAccountDialogRequestIdRef.current = requestId;
      setCloudflareAccountsLoading(true);
      setCloudflareAccountDialogError(null);
      try {
        const accounts = await listCloudflareAccounts({});
        if (cloudflareAccountDialogRequestIdRef.current !== requestId) {
          return;
        }
        setCloudflareAccountDialogOptions(accounts);
        if (accounts.length === 0) {
          setCloudflareAccountDialogSelectedAccountId("");
          setCloudflareAccountDialogError("No Cloudflare accounts are available.");
          return;
        }

        const selectedAccount =
          accounts.find((account) => account.accountId === preferredAccountId) ?? accounts[0];
        setCloudflareAccountDialogSelectedAccountId(selectedAccount.accountId);
      } catch (error) {
        if (cloudflareAccountDialogRequestIdRef.current !== requestId) {
          return;
        }
        setCloudflareAccountDialogError(
          error instanceof Error ? error.message : "Could not load Cloudflare accounts.",
        );
      } finally {
        if (cloudflareAccountDialogRequestIdRef.current === requestId) {
          setCloudflareAccountsLoading(false);
        }
      }
    },
    [
      listCloudflareAccounts,
      setCloudflareAccountDialogError,
      setCloudflareAccountDialogOptions,
      setCloudflareAccountDialogSelectedAccountId,
      setCloudflareAccountsLoading,
    ],
  );

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
    void loadCloudflareDialogResources(cloudflareConnection?.accountId);
  }, [
    addCloudflareWorkerModeActive,
    clearAddCloudflareWorkerSearchParam,
    cloudflareConnection?.accountId,
    loadCloudflareDialogResources,
    resetCloudflareDialogState,
    setCloudflareConnectDialogAppRoot,
    setCloudflareConnectDialogCreateWorkerName,
    vaultToConnectCloudflare,
    vaults,
  ]);

  const handleOpenCloudflareAccountDialog = () => {
    setCloudflareAccountDialogOpen(true);
    void loadCloudflareAccountDialogResources(cloudflareConnection?.accountId);
  };

  const handleOpenCloudflareAccountDialogFromCreate = () => {
    closeNewAppDialog();
    handleOpenCloudflareAccountDialog();
  };

  const handleCloudflareAccountDialogOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      cloudflareAccountDialogRequestIdRef.current += 1;
    }
    setCloudflareAccountDialogOpen(isOpen);
  };

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

  const handleSubmitCloudflareAccount = async () => {
    if (isSubmittingCloudflareAccount || !selectedCloudflareDefaultAccountId) {
      return;
    }
    setCloudflareAccountDialogError(null);
    setCloudflareAccountSubmitting(true);
    try {
      await selectCloudflareDefaultAccount({
        accountId: selectedCloudflareDefaultAccountId,
      });
      clearCreateError();
      handleCloudflareAccountDialogOpenChange(false);
    } catch (error) {
      setCloudflareAccountDialogError(
        error instanceof Error ? error.message : "Could not save Cloudflare account.",
      );
    } finally {
      setCloudflareAccountSubmitting(false);
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
        removeGithubRepo: vaultToDelete.isNoterManaged
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

  const handleCreateRepository = async () => {
    const repoName = newRepositoryName.trim();
    if (!repoName || isCreating) return;
    if (!hasConnectedCreateProviders) {
      setCreateError(
        `Connect GitHub, Convex, and ${requiredCloudflareConnectionLabel} before creating an app.`,
      );
      return;
    }
    if (cloudflareAccountSelectionRequired) {
      setCreateError("Choose a Cloudflare account before creating an app.");
      handleOpenCloudflareAccountDialogFromCreate();
      return;
    }
    const owner = selectedGithubRepositoryOwner.trim();
    if (!owner) {
      setCreateError("Choose a GitHub owner before creating an app.");
      return;
    }
    if (!convexProjectNameValidation.valid) {
      setCreateError(convexProjectNameValidation.message);
      return;
    }
    if (!cloudflareWorkerNameValidation.valid) {
      setCreateError(cloudflareWorkerNameValidation.message);
      return;
    }
    if (createResourceNameCheckError) {
      setCreateError(createResourceNameCheckError);
      return;
    }
    if (isCreateResourceNameCheckPending) {
      setCreateError("Checking provider names.");
      return;
    }
    if (isGitHubRepositoryNameBlocking) {
      setCreateError(
        githubRepositoryNameAvailability?.message ?? "GitHub repository name is not available.",
      );
      return;
    }
    if (isConvexProjectNameAvailabilityBlocking) {
      setCreateError(
        convexProjectNameAvailability?.message ?? "Convex project name is not available.",
      );
      return;
    }
    if (isCloudflareWorkerNameAvailabilityBlocking) {
      setCreateError(
        cloudflareWorkerNameAvailability?.message ?? "Cloudflare Worker name is not available.",
      );
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      await createRepository({
        name: repoName,
        owner,
        convexProjectName: convexProjectNameValidation.value,
        cloudflareWorkerName: cloudflareWorkerNameValidation.value,
        private: true,
      });
      resetCreateRepositoryName();
      closeNewAppDialog();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create app");
    } finally {
      setIsCreating(false);
    }
  };

  const githubConnected = githubConnection?.connected === true;
  const convexConnected = convexConnection?.connected === true;
  const cloudflareConnected = cloudflareConnection?.connected === true;
  const cloudflareAccountSelectionRequired =
    cloudflareConnection?.connected === true && !cloudflareConnection.accountId;
  const requiredCloudflareConnectionLabel = "Cloudflare";
  const cloudflareMcpTokenStatus = cloudflareConnection?.mcpTokenStatus;
  // Provider connection management lives on /providers. The dashboard only
  // keeps the create button blocked when durable connection status says it must.
  const showCloudflareCreateWarning =
    cloudflareConnected &&
    (cloudflareMcpTokenStatus === "invalid" || cloudflareMcpTokenStatus === "expired");
  const hasConnectedCreateProviders = Boolean(
    githubConnected && convexConnected && cloudflareConnected,
  );
  const hasRequiredCreateConnections = Boolean(
    hasConnectedCreateProviders && !cloudflareAccountSelectionRequired,
  );
  const canCreateRepo = Boolean(
    hasRequiredCreateConnections && selectedGithubRepositoryOwner.trim(),
  );
  const createRepositoryName = newRepositoryName.trim();
  const defaultConvexProjectName = buildDefaultAppResourceName({
    repositoryName: newRepositoryName,
    provider: "convex",
  });
  const defaultCloudflareWorkerName = buildDefaultAppResourceName({
    repositoryName: newRepositoryName,
    provider: "cloudflare",
  });
  const checkedConvexProjectName = resolveCreateResourceNameCheckValue({
    mode: convexProjectNameMode,
    autoName: defaultConvexProjectName,
    manualName: convexProjectName,
  });
  const checkedCloudflareWorkerName = resolveCreateResourceNameCheckValue({
    mode: cloudflareWorkerNameMode,
    autoName: defaultCloudflareWorkerName,
    manualName: cloudflareWorkerName,
  });
  const selectedGithubRepositoryOwnerName = selectedGithubRepositoryOwner.trim();
  const shouldCheckResourceNames = Boolean(
    hasRequiredCreateConnections && selectedGithubRepositoryOwnerName && createRepositoryName,
  );
  const resourceNameCheckKey = buildCreateResourceNameCheckKey({
    githubRepositoryOwner: selectedGithubRepositoryOwnerName,
    githubRepositoryName: createRepositoryName,
    convexProjectName: checkedConvexProjectName,
    cloudflareWorkerName: checkedCloudflareWorkerName,
  });
  const {
    checkState: createResourceNameCheck,
    checkError: createResourceNameCheckError,
    isChecking: isCheckingCreateResourceNames,
  } = useCreateResourceNameAvailability({
    enabled: shouldCheckResourceNames,
    githubRepositoryOwner: selectedGithubRepositoryOwnerName,
    githubRepositoryName: createRepositoryName,
    convexProjectName: checkedConvexProjectName,
    cloudflareWorkerName: checkedCloudflareWorkerName,
    checkCreateRepositoryResourceNames,
  });
  const currentResourceNameCheck =
    createResourceNameCheck?.key === resourceNameCheckKey ? createResourceNameCheck.result : null;
  const githubRepositoryNameAvailability = currentResourceNameCheck?.github ?? null;
  const convexProjectNameAvailability = currentResourceNameCheck?.convex ?? null;
  const cloudflareWorkerNameAvailability = currentResourceNameCheck?.cloudflare ?? null;
  const resolvedConvexProjectName = resolveCreateResourceName({
    mode: convexProjectNameMode,
    autoName: defaultConvexProjectName,
    manualName: convexProjectName,
    availability: convexProjectNameAvailability,
  });
  const resolvedCloudflareWorkerName = resolveCreateResourceName({
    mode: cloudflareWorkerNameMode,
    autoName: defaultCloudflareWorkerName,
    manualName: cloudflareWorkerName,
    availability: cloudflareWorkerNameAvailability,
  });
  const convexProjectNameValidation = validateAppResourceName(resolvedConvexProjectName, "convex");
  const cloudflareWorkerNameValidation = validateAppResourceName(
    resolvedCloudflareWorkerName,
    "cloudflare",
  );
  const isConvexProjectNameAvailabilityBlocking = isCreateResourceNameAvailabilityBlocking(
    convexProjectNameMode,
    convexProjectNameAvailability,
  );
  const isCloudflareWorkerNameAvailabilityBlocking = isCreateResourceNameAvailabilityBlocking(
    cloudflareWorkerNameMode,
    cloudflareWorkerNameAvailability,
  );
  const isGitHubRepositoryNameBlocking = isGitHubRepositoryNameAvailabilityBlocking(
    githubRepositoryNameAvailability,
  );
  const isCreateResourceNameCheckPending = Boolean(
    shouldCheckResourceNames && (isCheckingCreateResourceNames || !currentResourceNameCheck),
  );
  const hasBlockingCreateResourceName = Boolean(
    createRepositoryName &&
    (isGitHubRepositoryNameBlocking ||
      !convexProjectNameValidation.valid ||
      !cloudflareWorkerNameValidation.valid ||
      createResourceNameCheckError ||
      isCreateResourceNameCheckPending ||
      isConvexProjectNameAvailabilityBlocking ||
      isCloudflareWorkerNameAvailabilityBlocking),
  );
  useGithubRepositoryOwnerOptions({
    githubConnected,
    listGithubRepositoryOwners,
    setGithubRepositoryOwnerLoadError,
    setGithubRepositoryOwnerOptions,
    setIsLoadingGithubRepositoryOwners,
  });
  const userDisplayName = user?.name ?? user?.email ?? user?.githubUsername;
  const accountEmail = user?.email ?? user?.githubUsername ?? user?.name ?? null;
  const accountDisplayName = userDisplayName ?? accountEmail;
  const accountProviderLabel = authProviders?.primaryProvider
    ? formatAuthProviderLabel(authProviders.primaryProvider)
    : null;
  const renderCreateResourceNameSupport = ({
    availability,
    checkedName,
    label,
    mode,
    onUseGeneratedName,
    validation,
    onUseSuggestion,
  }: {
    availability: CreateResourceNameAvailability | null;
    checkedName: string;
    label: string;
    mode: CreateResourceNameMode;
    onUseGeneratedName: () => void;
    validation: ReturnType<typeof validateAppResourceName>;
    onUseSuggestion: (suggestion: string) => void;
  }) => {
    const manualResetContent = mode === "manual" && (
      <>
        Custom name.{" "}
        <CreateResourceNameInlineAction onClick={onUseGeneratedName}>
          Use generated name
        </CreateResourceNameInlineAction>
      </>
    );
    const manualReset = manualResetContent && (
      <CreateResourceNameHelp>{manualResetContent}</CreateResourceNameHelp>
    );

    if (createRepositoryName && !validation.valid) {
      return (
        <CreateResourceNameFeedback
          message={validation.message}
          suggestion={validation.suggestion}
          onUseSuggestion={onUseSuggestion}
        >
          {manualResetContent && (
            <span className="ml-1 text-muted-foreground">{manualResetContent}</span>
          )}
        </CreateResourceNameFeedback>
      );
    }

    if (createResourceNameCheckError) {
      return (
        <CreateResourceNameFeedback
          message={createResourceNameCheckError}
          suggestion={null}
          onUseSuggestion={onUseSuggestion}
        >
          {manualResetContent && (
            <span className="ml-1 text-muted-foreground">{manualResetContent}</span>
          )}
        </CreateResourceNameFeedback>
      );
    }

    if (isCreateResourceNameCheckPending) {
      return (
        <CreateResourceNameStatus kind="checking">Checking {label}...</CreateResourceNameStatus>
      );
    }

    if (!availability) {
      return manualReset;
    }

    if (availability.status === "available") {
      return (
        <CreateResourceNameStatus kind="available">
          {label} is available.
          {manualResetContent && (
            <span className="ml-1 text-muted-foreground">{manualResetContent}</span>
          )}
        </CreateResourceNameStatus>
      );
    }

    if (mode === "auto" && availability.status === "taken" && availability.suggestion) {
      return (
        <CreateResourceNameStatus kind="available">
          {checkedName} already exists; using {availability.suggestion}.
        </CreateResourceNameStatus>
      );
    }

    return (
      <CreateResourceNameFeedback
        message={availability.message ?? "Name is not available."}
        suggestion={availability.suggestion}
        onUseSuggestion={onUseSuggestion}
      >
        {manualResetContent && (
          <span className="ml-1 text-muted-foreground">{manualResetContent}</span>
        )}
      </CreateResourceNameFeedback>
    );
  };
  const renderGitHubRepositoryNameSupport = () => {
    if (!createRepositoryName) {
      return null;
    }

    if (createResourceNameCheckError) {
      return (
        <CreateResourceNameFeedback
          message={createResourceNameCheckError}
          suggestion={null}
          onUseSuggestion={setNewRepositoryName}
        />
      );
    }

    // Show GitHub availability errors before slash previews and pending checks.
    if (
      githubRepositoryNameAvailability &&
      githubRepositoryNameAvailability.status !== "available"
    ) {
      return (
        <CreateResourceNameFeedback
          message={
            githubRepositoryNameAvailability.message ?? "GitHub repository name is not available."
          }
          suggestion={githubRepositoryNameAvailability.suggestion}
          onUseSuggestion={setNewRepositoryName}
        />
      );
    }

    if (buildGitHubRepositoryNameSlashReplacement(createRepositoryName)) {
      return <GitHubRepositoryNameSlashPreview rawName={createRepositoryName} />;
    }

    if (isCreateResourceNameCheckPending) {
      return (
        <CreateResourceNameStatus kind="checking">
          Checking GitHub repository...
        </CreateResourceNameStatus>
      );
    }

    if (githubRepositoryNameAvailability?.status === "available") {
      return (
        <CreateResourceNameStatus kind="available">
          GitHub repository name is available.
        </CreateResourceNameStatus>
      );
    }

    return null;
  };
  const createControlFooterMessages =
    createError ||
    !canCreateRepo ||
    githubRepositoryOwnerLoadError ||
    showCloudflareCreateWarning ? (
      <div className="flex flex-col gap-2">
        {createError && <div className="text-sm text-red-600">{createError}</div>}
        {!canCreateRepo && (
          <div className="text-xs text-muted-foreground">
            {cloudflareAccountSelectionRequired ? (
              <>
                Choose a Cloudflare account to create an app.{" "}
                <CreateResourceNameInlineAction
                  onClick={handleOpenCloudflareAccountDialogFromCreate}
                >
                  Select account
                </CreateResourceNameInlineAction>
              </>
            ) : hasRequiredCreateConnections ? (
              "Choose a GitHub owner to create an app."
            ) : (
              `Connect GitHub, Convex, and ${requiredCloudflareConnectionLabel} to create an app.`
            )}
          </div>
        )}
        {githubRepositoryOwnerLoadError && (
          <div className="text-xs text-red-600">{githubRepositoryOwnerLoadError}</div>
        )}
        {showCloudflareCreateWarning && (
          <div className="text-xs text-amber-700">
            Cloudflare token is invalid or expired. Reconnect Cloudflare.
          </div>
        )}
      </div>
    ) : null;
  const createButtonDisabled =
    isCreating ||
    createRepositoryName.length === 0 ||
    !canCreateRepo ||
    hasBlockingCreateResourceName;
  const createFormFields = (
    <VaultDashboardCreateFormFields
      cloudflareWorkerName={resolvedCloudflareWorkerName}
      cloudflareWorkerNameSupport={renderCreateResourceNameSupport({
        availability: cloudflareWorkerNameAvailability,
        checkedName: checkedCloudflareWorkerName,
        label: "Cloudflare Worker name",
        mode: cloudflareWorkerNameMode,
        validation: cloudflareWorkerNameValidation,
        onUseGeneratedName: () => {
          setCloudflareWorkerName("", "auto");
        },
        onUseSuggestion: (suggestion) => {
          setCloudflareWorkerName(suggestion, "manual");
        },
      })}
      convexProjectName={resolvedConvexProjectName}
      convexProjectNameSupport={renderCreateResourceNameSupport({
        availability: convexProjectNameAvailability,
        checkedName: checkedConvexProjectName,
        label: "Convex project name",
        mode: convexProjectNameMode,
        validation: convexProjectNameValidation,
        onUseGeneratedName: () => {
          setConvexProjectName("", "auto");
        },
        onUseSuggestion: (suggestion) => {
          setConvexProjectName(suggestion, "manual");
        },
      })}
      githubConnected={githubConnected}
      githubRepositoryNameSupport={renderGitHubRepositoryNameSupport()}
      githubRepositoryOwnerOptions={githubRepositoryOwnerOptions}
      hasRequiredCreateConnections={hasRequiredCreateConnections}
      isCreating={isCreating}
      isLoadingGithubRepositoryOwners={isLoadingGithubRepositoryOwners}
      newRepositoryName={newRepositoryName}
      onCloudflareWorkerNameBlur={() => {
        if (cloudflareWorkerNameMode === "manual" && !cloudflareWorkerName.trim()) {
          setCloudflareWorkerName("", "auto");
        }
      }}
      onCloudflareWorkerNameChange={(value) => {
        setCloudflareWorkerName(value, "manual");
      }}
      onConvexProjectNameBlur={() => {
        if (convexProjectNameMode === "manual" && !convexProjectName.trim()) {
          setConvexProjectName("", "auto");
        }
      }}
      onConvexProjectNameChange={(value) => {
        setConvexProjectName(value, "manual");
      }}
      onGithubRepositoryOwnerChange={setSelectedGithubRepositoryOwner}
      onNewRepositoryNameChange={setNewRepositoryName}
      selectedGithubRepositoryOwner={selectedGithubRepositoryOwner}
    />
  );
  const createControl = (
    <div className="vault-dashboard-sidebar-inset flex w-full flex-col items-stretch gap-2 py-3">
      <Button className="w-full" type="button" onClick={openNewAppDialog}>
        New App
      </Button>
      {githubConnected ? (
        <Link
          className={clsx(
            buttonVariants({ variant: "outline" }),
            "h-auto min-h-8 w-full whitespace-normal py-2",
          )}
          to="/add"
        >
          <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">
            Connect existing app
          </span>
        </Link>
      ) : (
        <Button variant="outline" className="h-auto min-h-8 w-full whitespace-normal py-2" disabled>
          <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">
            Connect existing app
          </span>
        </Button>
      )}
    </div>
  );

  const resolvedAccountPanelOpen = dashboardAccountPanelOpen ?? false;
  const resolvedGlobalChatOpen = dashboardGlobalChatOpen ?? false;

  const handleAccountPanelOpenChange = (isOpen: boolean) => {
    void persistAccountPanelOpen({ isOpen }).catch((error: unknown) => {
      console.error("Failed to persist account panel state:", error);
    });
  };

  const handleSignOut = () => {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    void signOut()
      .catch((error: unknown) => {
        toast({
          title: "Could not sign out",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsSigningOut(false);
      });
  };

  const handleGlobalChatOpenChange = (isOpen: boolean) => {
    setGlobalChatAutoFocus(isOpen);
    void setEditorChatOpen({ isOpen, scope: "global" }).catch((error: unknown) => {
      console.error("Failed to persist global chat state:", error);
      setGlobalChatAutoFocus(false);
    });
  };

  if (!vaults) {
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

  const handleNewAppDialogOpenChange = (isOpen: boolean) => {
    if (isOpen || isCreating) {
      return;
    }

    closeNewAppDialog();
  };

  const handleDeleteDialogOpenChange = (isOpen: boolean) => {
    if (isOpen || isDeleting || isCommitting) {
      return;
    }

    clearDeleteSearchParam({ preferHistoryBack: true });
  };

  const sidebarContent = (
    <VaultDashboardSidebarContent>
      {user && accountEmail && accountDisplayName ? (
        <VaultDashboardAccountSection
          open={resolvedAccountPanelOpen}
          onOpenChange={handleAccountPanelOpenChange}
          displayName={accountDisplayName}
          email={accountEmail}
          providerLabel={accountProviderLabel}
          onSignOut={handleSignOut}
          isSignOutPending={isSigningOut}
          signOutDisabled={false}
        />
      ) : null}
      <div
        className="vault-dashboard-sidebar-inset py-2"
        data-testid="dashboard-sidebar-providers-link"
      >
        <Link to={PROVIDERS_ROUTE} className={routePreviewLinkInteractionClassName}>
          {PROVIDERS_ROUTE}
        </Link>
      </div>
      {createControl}
      <div className="mt-auto">
        <AppSidebarMetaSection side="right" />
      </div>
    </VaultDashboardSidebarContent>
  );
  const dashboardBody = (
    <VaultDashboardBody
      developerToolsVisible={developerToolsVisible}
      isRemovingVault={isDeleting || isCommitting}
      retryingDeletionRunId={retryingDeletionRunId}
      now={now}
      logoRouteSearch={rootRouteSearch}
      replaceLogoRouteSearch={(nextSearch) => {
        void navigate({
          hash: true,
          replace: true,
          search: (currentSearch) => replaceRootLogoRouteSearch(currentSearch, nextSearch),
          state: true,
          to: ".",
        });
      }}
      openDeveloperToolsByVaultId={openDeveloperToolsByVaultId}
      persistedVaultBranchFiltersByVaultId={persistedVaultBranchFiltersByVaultId}
      persistedVaultResourceLinksOpenByVaultId={persistedVaultResourceLinksOpenByVaultId}
      deleteRepositoryFullName={deleteRepositoryFullName}
      addConvexRepositoryFullName={addConvexRepositoryFullName}
      addCloudflareWorkerRepositoryFullName={addCloudflareWorkerRepositoryFullName}
      rootRouteSearch={rootRouteSearch}
      vaults={vaults}
      onOpenDeveloperToolsChange={handleVaultDeveloperToolsOpenChange}
      onManualRepositoryRefresh={enqueueManualRepositoryRefresh}
      onRetryVaultDeletion={(runId) => {
        void handleRetryVaultDeletion(runId);
      }}
      onSaveVaultBranchFilters={handleVaultBranchFiltersChange}
      onResourceLinksOpenChange={handleVaultResourceLinksOpenChange}
    />
  );

  return (
    <AppWorkspaceRouteChrome
      right={{
        header: null,
        content: sidebarContent,
      }}
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

      <VaultDashboardCreateDialog
        createButtonDisabled={createButtonDisabled}
        footerMessages={createControlFooterMessages}
        isCreating={isCreating}
        onOpenChange={handleNewAppDialogOpenChange}
        onSubmit={() => {
          void handleCreateRepository();
        }}
        open={newAppModeActive}
      >
        {createFormFields}
      </VaultDashboardCreateDialog>
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
      <VaultDashboardCloudflareAccountDialog
        accounts={cloudflareDefaultAccountOptions}
        error={cloudflareAccountDialogError}
        isLoading={isLoadingCloudflareAccounts}
        isSubmitting={isSubmittingCloudflareAccount}
        onAccountChange={(accountId) => {
          setCloudflareAccountDialogSelectedAccountId(accountId);
          setCloudflareAccountDialogError(null);
        }}
        onOpenChange={handleCloudflareAccountDialogOpenChange}
        onSubmit={() => {
          void handleSubmitCloudflareAccount();
        }}
        open={cloudflareAccountDialogOpen}
        selectedAccountId={selectedCloudflareDefaultAccountId}
      />
    </AppWorkspaceRouteChrome>
  );
}
