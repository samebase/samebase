import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { VaultLastUpdatedStatus } from "@/components/vault-dashboard/VaultLastUpdatedStatus";
import { VaultProvisioningLogTextarea } from "@/components/vault-dashboard/VaultProvisioningLogTextarea";
import {
  VaultResourceRail,
  type VaultResourceRailRowState,
  type VaultResourceRailState,
} from "@/components/vault-dashboard/VaultResourceRail";
import { ChevronDownIcon, TrashIcon, UpdateIcon } from "@/lib/radixIcons";
import {
  CheckIcon,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
} from "lucide-react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import {
  Link,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { linkStyle } from "../styles";
import { clsx } from "clsx";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import {
  formatRelativeTimeAgo,
  formatRelativeTimeUntil,
} from "@/lib/formatRelativeTime";
import {
  hasCurrentCloudflareBuildFailureLogs,
  hasCurrentCloudflareBranchPreview,
} from "@/lib/cloudflarePreviewLinks";
import { getTreeRefreshUiState } from "@/lib/treeRefreshStatus";
import {
  CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS,
  CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS,
} from "../../../shared/cloudflareTokenRefresh";
import {
  claimRefreshDebounce,
  releaseRefreshDebounce,
} from "@/lib/refreshDebounce";
import { useNow } from "@/hooks/useNow";
import {
  useAction,
  useMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
} from "react";
import { isInIframe, useNoterAuthActions } from "@/authClient";
import { openGithubOAuthPopup } from "@/lib/githubOAuthFlow";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import {
  Dialog,
  DialogContent,
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
  VaultDashboardAccountSection,
  VaultDashboardEmptyState,
  VaultDashboardProvidersSection,
  VaultDashboardRepositoryCard,
  VaultDashboardRepositoryList,
  VaultDashboardScrollTargetEndPadding,
  VaultDashboardSidebarContent,
  type VaultDashboardProviderRowViewModel,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import { formatAuthProviderLabel } from "@/lib/authProviderLabel";
import {
  useApiKeyConnectDialog,
  type ApiKeyProvider,
} from "@/components/ApiKeyConnectDialog";
import type { Id } from "../../../convex/_generated/dataModel";
import {
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
import { buildGitHubBranchTreeUrl } from "@/lib/githubUrls";
import { type LogoThemeColorSearchInput } from "@/lib/appThemeColorSearch";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import {
  buildPullRequestLabelStyle,
  normalizePullRequestLabels,
} from "@/lib/pullRequestLabels";
import { applySearchPatch } from "@/lib/routeSearchFlags";
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
import { PersistedSidebarProvider } from "@/components/PersistedSidebarProvider";
import { PublicLandingLogoLinkProvider } from "@/contexts/PublicLandingLogoLinkContext";
import { WorkspaceLayoutV2FullPage } from "../workspace-layout-v2/WorkspaceLayoutV2FullPage";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";
import { CHAT_ENABLED, CODESPACES_ENABLED } from "../../../shared/featureFlags";
import {
  buildDefaultAppResourceName,
  validateAppResourceName,
} from "../../../shared/appResourceNames";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
  NoterLogoMark,
  PullRequestStateLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { useDashboardRepositoryRefreshDemand } from "@/components/vault-dashboard/VaultDashboardRepositoryRefreshDemand";

const DASHBOARD_SIDEBAR_DEFAULT_STATE = {
  leftDesktopOpen: false,
  leftDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  leftMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  rightMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
} satisfies WorkspaceSidebarState;
const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];

const formatMcpTokenStatusLabel = (
  status:
    | "valid"
    | "expiring_soon"
    | "expired"
    | "invalid"
    | "unknown"
    | undefined,
): string => {
  if (status === "valid") return "Valid";
  if (status === "expiring_soon") return "Expiring soon";
  if (status === "expired") return "Expired";
  if (status === "invalid") return "Invalid";
  return "Unknown";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getRedirectOrigin = (oauthUrl: string): string | null => {
  try {
    const url = new URL(oauthUrl);
    const redirect = url.searchParams.get("redirect_uri");
    if (!redirect) return null;
    return new URL(redirect).origin;
  } catch {
    return null;
  }
};

const PROVIDER_KEYS = ["github", "convex", "cloudflare"] as const;
type ProviderKey = (typeof PROVIDER_KEYS)[number];
type ProviderMetadata = {
  label: string;
  oauthButtonLabel: string;
  popupName: string;
  completionEventType: string;
  icon: ReactElement;
  apiKeyProvider: ApiKeyProvider | null;
};
type ProviderRuntimeConfig = {
  getOAuthUrl: () => Promise<string>;
  disconnect: () => Promise<unknown>;
  popupRef: MutableRefObject<Window | null>;
  popupOriginRef: MutableRefObject<string | null>;
};
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
};

type VaultDeleteIntent = VaultDeleteDialogTarget & {
  id: Id<"vaults">;
};
type VaultDashboardDeletion = VaultDashboardVault["deletion"];
type VaultDashboardDeleteAction = Extract<
  VaultDashboardDeletion,
  { state: "not_deleting" }
>["deleteAction"];
type VaultDashboardDeletionStep = Extract<
  VaultDashboardDeletion,
  { state: "deleting" | "delete_failed" }
>["currentStep"];

function formatProviderSetupDeveloperLabel(
  providerSetup: VaultDashboardProviderSetup,
): string {
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
type CreateResourceNameMode = "auto" | "manual";
type CreateResourceNameCheckResult =
  (typeof api.vault.actions.checkCreateRepositoryResourceNames)["_returnType"];
type CreateResourceNameCheckState = {
  key: string;
  result: CreateResourceNameCheckResult;
};
type CreateResourceNameAvailability = CreateResourceNameCheckResult["convex"];
type VaultDashboardLocalState = {
  cloudflarePollingPaused: boolean;
  cloudflareWorkerName: string;
  cloudflareWorkerNameMode: CreateResourceNameMode;
  commitError: string | null;
  convexProjectName: string;
  convexProjectNameMode: CreateResourceNameMode;
  createError: string | null;
  dashboardMountedAt: number;
  deleteError: string | null;
  didAttemptCommit: boolean;
  disconnectingProvider: ProviderKey | null;
  isAutoCheckingCloudflareToken: boolean;
  isCheckingCloudflareToken: boolean;
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

function readVaultDashboardInitialLocalState(): VaultDashboardLocalState {
  return {
    cloudflarePollingPaused:
      typeof document !== "undefined"
        ? document.visibilityState !== "visible"
        : false,
    cloudflareWorkerName: "",
    cloudflareWorkerNameMode: "auto",
    commitError: null,
    convexProjectName: "",
    convexProjectNameMode: "auto",
    createError: null,
    dashboardMountedAt: Date.now(),
    deleteError: null,
    didAttemptCommit: false,
    disconnectingProvider: null,
    isAutoCheckingCloudflareToken: false,
    isCheckingCloudflareToken: false,
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
  return useCreateStore(
    readVaultDashboardInitialLocalState(),
    ({ setState }) => ({
      clearCreateError: () => {
        setState((state) =>
          state.createError === null ? state : { ...state, createError: null },
        );
      },
      prepareDeleteDialog: ({
        target,
      }: {
        target: VaultDeleteDialogTarget;
      }) => {
        setState((state) => ({
          ...state,
          commitError: null,
          deleteError: null,
          didAttemptCommit: false,
          removeCodespaces: CODESPACES_ENABLED,
          removeConvexProvision:
            target.isNoterManaged && target.hasConvexProvision,
          removeGithubRepo: target.canRemoveGithubRepo,
          removeCloudflareProvision:
            target.isNoterManaged && target.hasCloudflareProvision,
        }));
      },
      markCommitAttempted: () => {
        setState((state) => ({ ...state, didAttemptCommit: true }));
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
      setCloudflarePollingPaused: (cloudflarePollingPaused: boolean) => {
        setState((state) => ({ ...state, cloudflarePollingPaused }));
      },
      setCloudflareWorkerName: (
        cloudflareWorkerName: string,
        mode: CreateResourceNameMode,
      ) => {
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
      setConvexProjectName: (
        convexProjectName: string,
        mode: CreateResourceNameMode,
      ) => {
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
      setDisconnectingProvider: (disconnectingProvider: ProviderKey | null) => {
        setState((state) => ({ ...state, disconnectingProvider }));
      },
      setGlobalChatAutoFocus: (shouldAutoFocusChatInput: boolean) => {
        setState((state) => ({ ...state, shouldAutoFocusChatInput }));
      },
      setGlobalChatBusy: (isGlobalChatBusy: boolean) => {
        setState((state) => ({ ...state, isGlobalChatBusy }));
      },
      setGithubRepositoryOwnerLoadError: (
        githubRepositoryOwnerLoadError: string | null,
      ) => {
        setState((state) => ({ ...state, githubRepositoryOwnerLoadError }));
      },
      setGithubRepositoryOwnerOptions: (
        githubRepositoryOwnerOptions: GitHubRepositoryOwnerOption[],
      ) => {
        setState((state) => {
          const selectedOwnerStillExists = githubRepositoryOwnerOptions.some(
            (owner) => owner.login === state.selectedGithubRepositoryOwner,
          );
          const selectedGithubRepositoryOwner = selectedOwnerStillExists
            ? state.selectedGithubRepositoryOwner
            : (githubRepositoryOwnerOptions[0]?.login ?? "");
          return {
            ...state,
            githubRepositoryOwnerLoadError: null,
            githubRepositoryOwnerOptions,
            selectedGithubRepositoryOwner,
          };
        });
      },
      setIsAutoCheckingCloudflareToken: (
        isAutoCheckingCloudflareToken: boolean,
      ) => {
        setState((state) => ({ ...state, isAutoCheckingCloudflareToken }));
      },
      setIsCheckingCloudflareToken: (isCheckingCloudflareToken: boolean) => {
        setState((state) => ({ ...state, isCheckingCloudflareToken }));
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
      setRetryingDeletionRunId: (
        retryingDeletionRunId: Id<"vaultDeletionRuns"> | null,
      ) => {
        setState((state) => ({ ...state, retryingDeletionRunId }));
      },
      setIsLoadingGithubRepositoryOwners: (
        isLoadingGithubRepositoryOwners: boolean,
      ) => {
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
      setSelectedGithubRepositoryOwner: (
        selectedGithubRepositoryOwner: string,
      ) => {
        setState((state) => ({
          ...state,
          createError: null,
          selectedGithubRepositoryOwner,
        }));
      },
    }),
  );
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
    canRemoveGithubRepo:
      vault.isNoterManaged && vault.hasConnectedGitHubRepository,
    hasConvexProvision: vault.hasConvexProvision,
    hasCloudflareProvision: vault.hasCloudflareProvision,
  };
}

const dashboardLinkIconSlotClassName =
  "inline-flex h-4 w-5 shrink-0 items-center justify-center";

const DashboardLinkIconSlot = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <span
    aria-hidden="true"
    className={clsx(dashboardLinkIconSlotClassName, className)}
  >
    {children}
  </span>
);

export function VaultDashboardDeleteControl({
  deleteAction,
  isRemovingVault = false,
  repositoryFullName,
}: {
  deleteAction: VaultDashboardDeleteAction;
  isRemovingVault?: boolean;
  repositoryFullName: string;
}) {
  const deleteTriggerDisabled =
    isRemovingVault || deleteAction.state === "disabled";
  const title =
    deleteAction.state === "disabled" ? deleteAction.reason : "Remove vault";

  return (
    <span className="absolute right-4 top-4">
      <Link
        to="/"
        search={(currentSearch) => ({
          ...currentSearch,
          delete: repositoryFullName,
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
    CODESPACES_ENABLED &&
    connectedCodespacesCount !== undefined &&
    connectedCodespacesCount > 0;
  const isCodespacesCleanupPending =
    CODESPACES_ENABLED && connectedCodespacesCount === undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {vaultToDelete
              ? `Remove Vault ${vaultToDelete.repositoryFullName}`
              : "Remove Vault"}
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
                disabled={
                  !vaultToDelete.canRemoveGithubRepo ||
                  isDeleting ||
                  isCommitting
                }
                className="mt-0.5"
              />
              <label
                htmlFor="remove-github-repo"
                className="text-sm text-muted-foreground"
              >
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
                <label
                  htmlFor="remove-codespaces"
                  className="text-sm text-muted-foreground"
                >
                  Also remove all Codespaces ({connectedCodespacesCount}{" "}
                  connected)
                </label>
              </div>
            ) : null}
            {vaultToDelete.hasConvexProvision ? (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="remove-convex-provision"
                  checked={removeConvexProvision}
                  onCheckedChange={(checked) =>
                    onDeleteOptionChange(
                      "removeConvexProvision",
                      checked === true,
                    )
                  }
                  disabled={
                    !vaultToDelete.isNoterManaged || isDeleting || isCommitting
                  }
                  className="mt-0.5"
                />
                <label
                  htmlFor="remove-convex-provision"
                  className="text-sm text-muted-foreground"
                >
                  Also remove Convex project/deployment
                  {!vaultToDelete.isNoterManaged ? (
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
                    onDeleteOptionChange(
                      "removeCloudflareProvision",
                      checked === true,
                    )
                  }
                  disabled={
                    !vaultToDelete.isNoterManaged || isDeleting || isCommitting
                  }
                  className="mt-0.5"
                />
                <label
                  htmlFor={removeCloudflareCheckboxId}
                  className="text-sm text-muted-foreground"
                >
                  {removeCloudflareLabel}
                  {!vaultToDelete.isNoterManaged ? (
                    <div className="text-xs text-muted-foreground">
                      Only available for infrastructure provisioned by Noter.
                    </div>
                  ) : null}
                </label>
              </div>
            ) : null}
            {deleteError ? (
              <div className="text-sm text-red-600">{deleteError}</div>
            ) : null}
            {commitError ? (
              <div className="text-sm text-red-600">{commitError}</div>
            ) : null}
            {didAttemptCommit && hasStagedChanges ? (
              <div className="text-sm text-muted-foreground">
                Some local changes are still uncommitted. You can retry commit
                or remove anyway.
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
            disabled={
              !vaultToDelete ||
              isDeleting ||
              isCommitting ||
              isCodespacesCleanupPending
            }
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
      </DialogContent>
    </Dialog>
  );
}

const PROVIDER_METADATA: Record<ProviderKey, ProviderMetadata> = {
  github: {
    label: "GitHub",
    oauthButtonLabel: "GitHub OAuth",
    popupName: "github-oauth",
    completionEventType: "github-oauth-complete",
    icon: <GitHubProviderLogo />,
    apiKeyProvider: "github",
  },
  convex: {
    label: "Convex",
    oauthButtonLabel: "Convex OAuth",
    popupName: "convex-oauth",
    completionEventType: "convex-oauth-complete",
    icon: <ConvexProviderLogo />,
    apiKeyProvider: "convex",
  },
  cloudflare: {
    label: "Cloudflare",
    oauthButtonLabel: "Cloudflare OAuth",
    popupName: "cloudflare-mcp-oauth",
    completionEventType: "cloudflare-mcp-oauth-complete",
    icon: <CloudflareProviderLogo />,
    apiKeyProvider: null,
  },
};

/**
 * Bridges provider OAuth popup callbacks back into the dashboard shell. Remove
 * this hook by replacing popup OAuth with redirect flow, or by routing callback
 * completion through provider connection invalidation instead of window
 * messages.
 */
function useProviderOAuthPopupCompletionReload({
  cloudflarePopupOriginRef,
  cloudflarePopupRef,
  convexPopupOriginRef,
  convexPopupRef,
  githubPopupOriginRef,
  githubPopupRef,
}: {
  cloudflarePopupOriginRef: MutableRefObject<string | null>;
  cloudflarePopupRef: MutableRefObject<Window | null>;
  convexPopupOriginRef: MutableRefObject<string | null>;
  convexPopupRef: MutableRefObject<Window | null>;
  githubPopupOriginRef: MutableRefObject<string | null>;
  githubPopupRef: MutableRefObject<Window | null>;
}) {
  useEffect(() => {
    const expectedOrigin = window.location.origin;
    const providerPopupConfig: Record<
      ProviderKey,
      {
        completionEventType: string;
        popupRef: MutableRefObject<Window | null>;
        popupOriginRef: MutableRefObject<string | null>;
      }
    > = {
      github: {
        completionEventType: PROVIDER_METADATA.github.completionEventType,
        popupRef: githubPopupRef,
        popupOriginRef: githubPopupOriginRef,
      },
      convex: {
        completionEventType: PROVIDER_METADATA.convex.completionEventType,
        popupRef: convexPopupRef,
        popupOriginRef: convexPopupOriginRef,
      },
      cloudflare: {
        completionEventType: PROVIDER_METADATA.cloudflare.completionEventType,
        popupRef: cloudflarePopupRef,
        popupOriginRef: cloudflarePopupOriginRef,
      },
    };
    const handler = (event: MessageEvent) => {
      if (!isRecord(event.data) || typeof event.data.type !== "string") {
        return;
      }

      for (const provider of PROVIDER_KEYS) {
        const popupConfig = providerPopupConfig[provider];
        if (event.data.type !== popupConfig.completionEventType) {
          continue;
        }
        if (event.source !== popupConfig.popupRef.current) {
          return;
        }
        if (
          event.origin !==
          (popupConfig.popupOriginRef.current ?? expectedOrigin)
        ) {
          return;
        }
        window.location.reload();
        return;
      }
    };

    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
    };
  }, [
    cloudflarePopupOriginRef,
    cloudflarePopupRef,
    convexPopupOriginRef,
    convexPopupRef,
    githubPopupOriginRef,
    githubPopupRef,
  ]);
}

type DashboardCloudflareConnection =
  (typeof api.users.getCloudflareConnectionStatus)["_returnType"];
type CloudflareTokenAutoCheckTrigger =
  | "focus"
  | "visibility"
  | "page_load"
  | "poll";

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
  setGithubRepositoryOwnerOptions: (
    owners: GitHubRepositoryOwnerOption[],
  ) => void;
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
            error instanceof Error
              ? error.message
              : "Failed to load GitHub owners.",
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

/**
 * Keeps Cloudflare MCP token health fresh while the dashboard is active. Remove
 * this hook by making token refresh a server-owned scheduler or connection
 * maintenance job and subscribing only to the resulting status.
 */
function useCloudflareMcpTokenAutoCheck({
  cloudflareConnection,
  refreshCloudflareMcpTokenIfNeeded,
  setCloudflarePollingPaused,
  setIsAutoCheckingCloudflareToken,
  userId,
}: {
  cloudflareConnection: DashboardCloudflareConnection | undefined;
  refreshCloudflareMcpTokenIfNeeded: (args: {
    force: false;
    trigger: CloudflareTokenAutoCheckTrigger;
  }) => Promise<unknown>;
  setCloudflarePollingPaused: (isPaused: boolean) => void;
  setIsAutoCheckingCloudflareToken: (isChecking: boolean) => void;
  userId: Id<"users"> | undefined;
}) {
  const cloudflareAutoCheckInFlightRef = useRef(false);

  useEffect(() => {
    const isCloudflareMcpConnected =
      cloudflareConnection?.connected === true &&
      cloudflareConnection.authMethod === "mcp_oauth";
    if (!isCloudflareMcpConnected) {
      setCloudflarePollingPaused(false);
      return;
    }

    const debounceKey = userId ?? "cloudflare-dashboard";
    const runAutoCheck = (trigger: CloudflareTokenAutoCheckTrigger) => {
      if (cloudflareAutoCheckInFlightRef.current) {
        return;
      }
      if (
        !claimRefreshDebounce(
          "cloudflare_token",
          debounceKey,
          CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS,
        )
      ) {
        return;
      }

      cloudflareAutoCheckInFlightRef.current = true;
      setIsAutoCheckingCloudflareToken(true);
      void refreshCloudflareMcpTokenIfNeeded({ trigger, force: false })
        .catch((error: unknown) => {
          console.error("Failed to auto-check Cloudflare token:", error);
        })
        .finally(() => {
          releaseRefreshDebounce("cloudflare_token", debounceKey);
          cloudflareAutoCheckInFlightRef.current = false;
          setIsAutoCheckingCloudflareToken(false);
        });
    };

    const handleFocus = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      setCloudflarePollingPaused(false);
      runAutoCheck("focus");
    };

    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible";
      setCloudflarePollingPaused(!isVisible);
      if (isVisible) {
        runAutoCheck("visibility");
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const isVisible = document.visibilityState === "visible";
    setCloudflarePollingPaused(!isVisible);
    if (isVisible) {
      runAutoCheck("page_load");
    }

    const pollId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (
        typeof cloudflareConnection.mcpTokenNextAutoCheckAt === "number" &&
        Date.now() < cloudflareConnection.mcpTokenNextAutoCheckAt
      ) {
        return;
      }
      runAutoCheck("poll");
    }, CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(pollId);
      cloudflareAutoCheckInFlightRef.current = false;
    };
  }, [
    cloudflareConnection?.authMethod,
    cloudflareConnection?.connected,
    cloudflareConnection?.mcpTokenNextAutoCheckAt,
    refreshCloudflareMcpTokenIfNeeded,
    setCloudflarePollingPaused,
    setIsAutoCheckingCloudflareToken,
    userId,
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
  productionDeploymentDashboardUrl?: string;
  stagedSummary?: StagedSummary;
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

function resolveSourceSetupResourceProvider(
  sourceSetup: VaultDashboardSourceSetup,
): "cloudflare" | "convex" | "github" | null {
  if (sourceSetup.status !== "failed" && sourceSetup.status !== "running") {
    return null;
  }

  switch (sourceSetup.step) {
    case "run_created":
    case "initialize_vault":
    case "validate_connections":
      return null;
    case "create_github_repo":
    case "fetch_github_repo":
    case "connect_github":
    case "create_vault":
    case "seed_starter":
    case "sync_tree":
    case "claim_infra":
      return "github";
    case "ensure_convex":
    case "ensure_convex_preview":
      return "convex";
    case "ensure_cloudflare":
    case "record_domains":
      return "cloudflare";
    case "finish":
      return null;
  }
  sourceSetup.step satisfies never;
  return null;
}

function buildVaultDashboardResourceRailState({
  githubRepositoryUrl,
  vault,
}: {
  githubRepositoryUrl: string;
  vault: VaultDashboardVault;
}): VaultResourceRailState {
  const canConfigureMissingResources = vault.state === "ready";
  const providerSetup = resolveVaultProviderSetupStatus(vault.providerSetup);
  const sourceSetupProvider = resolveSourceSetupResourceProvider(
    vault.sourceSetup,
  );
  let githubRow: VaultResourceRailRowState<"github">;
  if (vault.hasConnectedGitHubRepository) {
    githubRow = {
      provider: "github",
      status: "ready",
      value: vault.repositoryFullName,
      href: githubRepositoryUrl,
    };
  } else if (
    vault.sourceSetup.status === "failed" &&
    sourceSetupProvider === "github"
  ) {
    githubRow = {
      provider: "github",
      status: "failed",
      value: vault.repositoryFullName,
      statusText: vault.sourceSetup.message,
      actions: [{ kind: "retry", label: "Retry" }],
    };
  } else if (
    vault.sourceSetup.status === "running" &&
    sourceSetupProvider === "github"
  ) {
    githubRow = {
      provider: "github",
      status: "running",
      value: vault.repositoryFullName,
      statusText: formatVaultSourceSetupStep(vault.sourceSetup.step),
    };
  } else {
    githubRow = {
      provider: "github",
      status: "pending",
      value: vault.repositoryFullName,
    };
  }

  let convexRow: VaultResourceRailRowState<"convex">;
  if (vault.convexProjectSlug) {
    convexRow = {
      provider: "convex",
      status: "ready",
      value: vault.convexProjectSlug,
      href: vault.convexProjectSettingsDashboardUrl,
    };
  } else if (
    vault.sourceSetup.status === "failed" &&
    sourceSetupProvider === "convex"
  ) {
    convexRow = {
      provider: "convex",
      status: "failed",
      value: vault.ghRepoName,
      statusText: vault.sourceSetup.message,
      actions: [{ kind: "retry", label: "Retry" }],
    };
  } else if (
    vault.sourceSetup.status === "running" &&
    sourceSetupProvider === "convex"
  ) {
    convexRow = {
      provider: "convex",
      status: "running",
      value: vault.ghRepoName,
      statusText: formatVaultSourceSetupStep(vault.sourceSetup.step),
    };
  } else if (
    vault.providerSetup.status === "failed" &&
    vault.providerSetup.provider === "convex" &&
    providerSetup?.status === "failed"
  ) {
    convexRow = {
      provider: "convex",
      status: "failed",
      value: vault.ghRepoName,
      statusText: providerSetup.message,
      actions: [{ kind: "retry", label: "Retry" }],
    };
  } else if (
    vault.providerSetup.status === "running" &&
    vault.providerSetup.provider === "convex" &&
    providerSetup?.status === "running"
  ) {
    convexRow = {
      provider: "convex",
      status: "running",
      value: vault.ghRepoName,
      statusText: providerSetup.label,
    };
  } else if (!canConfigureMissingResources) {
    convexRow = {
      provider: "convex",
      status: "pending",
      value: vault.ghRepoName,
    };
  } else {
    convexRow = {
      provider: "convex",
      status: "action_required",
      actions: [
        { kind: "connect_existing", label: "Connect" },
        { kind: "create_new", label: "Create" },
      ],
    };
  }

  let cloudflareRow: VaultResourceRailRowState<"cloudflare">;
  if (vault.cloudflareWorkerName) {
    cloudflareRow = {
      provider: "cloudflare",
      status: "ready",
      value: vault.cloudflareWorkerName,
      href: vault.cloudflareProjectDashboardUrl,
    };
  } else if (
    vault.sourceSetup.status === "failed" &&
    sourceSetupProvider === "cloudflare"
  ) {
    cloudflareRow = {
      provider: "cloudflare",
      status: "failed",
      value: vault.ghRepoName,
      statusText: vault.sourceSetup.message,
      actions: [{ kind: "retry", label: "Retry" }],
    };
  } else if (
    vault.sourceSetup.status === "running" &&
    sourceSetupProvider === "cloudflare"
  ) {
    cloudflareRow = {
      provider: "cloudflare",
      status: "running",
      value: vault.ghRepoName,
      statusText: formatVaultSourceSetupStep(vault.sourceSetup.step),
    };
  } else if (
    vault.providerSetup.status === "failed" &&
    vault.providerSetup.provider === "cloudflare" &&
    providerSetup?.status === "failed"
  ) {
    cloudflareRow = {
      provider: "cloudflare",
      status: "failed",
      value: vault.ghRepoName,
      statusText: providerSetup.message,
      actions: [{ kind: "retry", label: "Retry" }],
    };
  } else if (
    vault.providerSetup.status === "running" &&
    vault.providerSetup.provider === "cloudflare" &&
    providerSetup?.status === "running"
  ) {
    cloudflareRow = {
      provider: "cloudflare",
      status: "running",
      value: vault.ghRepoName,
      statusText: providerSetup.label,
    };
  } else if (!canConfigureMissingResources) {
    cloudflareRow = {
      provider: "cloudflare",
      status: "pending",
      value: vault.ghRepoName,
    };
  } else {
    cloudflareRow = {
      provider: "cloudflare",
      status: "action_required",
      actions: [
        { kind: "connect_existing", label: "Connect" },
        { kind: "create_new", label: "Create Worker" },
      ],
    };
  }

  return {
    rows: [githubRow, convexRow, cloudflareRow],
  } satisfies VaultResourceRailState;
}

export function VaultBranchLinkContent({
  repositoryFullName,
  branch,
  productionDeploymentDashboardUrl,
}: {
  repositoryFullName: string;
  branch: VaultRemoteBranchListItem;
  productionDeploymentDashboardUrl?: string;
}) {
  const commitUrl = `https://github.com/${repositoryFullName}/commit/${branch.headCommitSha}`;
  const branchGithubUrl = buildGitHubBranchTreeUrl({
    repositoryFullName,
    branchName: branch.name,
  });
  const aheadBehindLabel = formatAheadBehindCounts(
    branch.aheadBy,
    branch.behindBy,
  );
  const hasPullRequestTitle =
    typeof branch.pullRequestTitle === "string" &&
    branch.pullRequestTitle.length > 0;
  const normalizedPullRequestLabels = normalizePullRequestLabels(
    branch.pullRequestLabels,
  );
  const hasPullRequestLink =
    typeof branch.pullRequestUrl === "string" &&
    branch.pullRequestUrl.length > 0;
  const pullRequestLabel =
    typeof branch.pullRequestNumber === "number"
      ? `PR #${branch.pullRequestNumber}`
      : "Pull request";
  const hasConsolidatedPullRequestLink =
    hasPullRequestTitle && hasPullRequestLink;
  const hasStandalonePullRequestLink =
    hasPullRequestLink && !hasConsolidatedPullRequestLink;
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
    hasPullRequestTitle
      ? "font-mono text-muted-foreground"
      : "text-muted-foreground",
    !hasPullRequestTitle && branch.isDefault && "font-medium text-foreground",
  );
  const branchEditRoute = buildVaultDashboardBranchEditRoute({
    repositoryFullName,
    branchName: branch.name,
  });
  const hasCurrentPreviewLink = hasCurrentCloudflareBranchPreview({
    pullRequestNumber: branch.pullRequestNumber,
    cloudflareBranchPreviewUrl: branch.cloudflareBranchPreviewUrl,
    cloudflarePreviewPullRequestNumber:
      branch.cloudflarePreviewPullRequestNumber,
  });
  const hasBuildFailureLogsLink = hasCurrentCloudflareBuildFailureLogs({
    pullRequestNumber: branch.pullRequestNumber,
    cloudflarePreviewLogsUrl: branch.cloudflarePreviewLogsUrl,
    cloudflarePreviewPullRequestNumber:
      branch.cloudflarePreviewPullRequestNumber,
    cloudflarePreviewStatus: branch.cloudflarePreviewStatus,
  });
  const hasProductionDeploymentLink =
    branch.isDefault && typeof productionDeploymentDashboardUrl === "string";
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
                  <PullRequestStateLogo
                    isDraft={branch.pullRequestIsDraft === true}
                  />
                </DashboardLinkIconSlot>
                <span className="min-w-0 break-words">
                  {pullRequestLabel} {branch.pullRequestTitle}
                </span>
              </a>
            ) : (
              <div className="flex min-h-9 max-w-full items-start gap-1.5 text-base font-medium leading-6 text-foreground">
                <DashboardLinkIconSlot className="mt-1">
                  <PullRequestStateLogo
                    isDraft={branch.pullRequestIsDraft === true}
                  />
                </DashboardLinkIconSlot>
                <span className="min-w-0 break-words">
                  {pullRequestLabel} {branch.pullRequestTitle}
                </span>
              </div>
            )
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
              <GitBranch
                aria-hidden="true"
                className="h-4 w-4"
                strokeWidth={1.75}
              />
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
                  <GitCommitHorizontal
                    aria-hidden="true"
                    className="h-5 w-5"
                    strokeWidth={2}
                  />
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
                      <PullRequestStateLogo
                        isDraft={branch.pullRequestIsDraft === true}
                      />
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
            {hasProductionDeploymentLink ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <a
                  href={productionDeploymentDashboardUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx(metadataLinkClassName, "gap-1.5")}
                  title="Open production Convex deployment dashboard"
                >
                  <DashboardLinkIconSlot>
                    <ConvexProviderLogo />
                  </DashboardLinkIconSlot>
                  <span>Production deploy</span>
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
  productionDeploymentDashboardUrl,
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
        productionDeploymentDashboardUrl={productionDeploymentDashboardUrl}
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
  productionDeploymentDashboardUrl?: string;
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
      <span>
        {isExpanded
          ? "Show less branches"
          : `Show ${hiddenBranchCount} more branches`}
      </span>
      <ChevronDownIcon
        className={isExpanded ? "rotate-180" : undefined}
        aria-hidden="true"
      />
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
  productionDeploymentDashboardUrl,
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
          productionDeploymentDashboardUrl={
            branch.isDefault ? productionDeploymentDashboardUrl : undefined
          }
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
  productionDeploymentDashboardUrl,
  repositoryFullName,
  vaultId,
  visibleRemoteBranches,
}: {
  filteredBranchCount: number;
  productionDeploymentDashboardUrl?: string;
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
          productionDeploymentDashboardUrl={productionDeploymentDashboardUrl}
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
      <span className="font-mono tabular-nums">
        {formatRelativeTimeUntil(cooldownUntil, now)}
      </span>
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
      title:
        vault.treeRefreshFailureMessage ??
        "GitHub API rate limited. Auto-refresh paused.",
    });
  }

  if (treeRefreshUiState.kind === "cooldown") {
    return renderVaultDashboardCooldownStatus({
      cooldownUntil: treeRefreshUiState.cooldownUntil,
      label: "Paused",
      now,
      title:
        vault.treeRefreshFailureMessage ??
        "Auto-refresh paused after a failed sync.",
    });
  }

  if (treeRefreshUiState.kind === "failed") {
    return (
      <span
        className="text-amber-700"
        title={
          vault.treeRefreshFailureMessage ??
          "Last sync failed. Showing cached state."
        }
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
  repositoryFullName,
  sourceSetup,
  vaultId,
}: {
  repositoryFullName: string;
  sourceSetup: Extract<
    VaultDashboardSourceSetup,
    { status: "failed" | "running" }
  >;
  vaultId: Id<"vaults">;
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
    >
      <VaultProvisioningLogTextarea
        repositoryFullName={repositoryFullName}
        vaultId={vaultId}
      />
    </VaultSetupProgressSection>
  );
}

type VaultSetupProgressSectionStatus = "failed" | "running";

export function VaultSetupProgressSection({
  children,
  label,
  message,
  status,
}: {
  children: ReactNode;
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
  repositoryFullName,
  vaultId,
}: {
  providerSetup: Extract<
    VaultDashboardProviderSetup,
    { status: "failed" | "running" }
  >;
  repositoryFullName: string;
  vaultId: Id<"vaults">;
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
    >
      <VaultProvisioningLogTextarea
        repositoryFullName={repositoryFullName}
        vaultId={vaultId}
      />
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
  deletion: Extract<
    VaultDashboardDeletion,
    { state: "deleting" | "delete_failed" }
  >;
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
        {deletion.message ||
          deletion.lastError ||
          `Delete failed during ${stepLabel}.`}
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
  themeColorSearch: LogoThemeColorSearchInput;
  openDeveloperToolsByVaultId: Partial<Record<Id<"vaults">, boolean>>;
  persistedVaultBranchFiltersByVaultId: Map<string, VaultBranchFiltersState>;
  deleteRepositoryFullName?: string;
  vaults: VaultDashboardVault[];
  onOpenDeveloperToolsChange: (vaultId: Id<"vaults">, isOpen: boolean) => void;
  onManualRepositoryRefresh: (vaultId: Id<"vaults">) => void;
  onRetryVaultDeletion: (runId: Id<"vaultDeletionRuns">) => void;
  onSaveVaultBranchFilters: (
    vaultId: Id<"vaults">,
    nextVaultBranchFilters: VaultBranchFiltersState,
  ) => void;
};

function VaultDashboardBody({
  developerToolsVisible,
  isRemovingVault,
  retryingDeletionRunId,
  now,
  themeColorSearch,
  openDeveloperToolsByVaultId,
  persistedVaultBranchFiltersByVaultId,
  deleteRepositoryFullName,
  vaults,
  onOpenDeveloperToolsChange,
  onManualRepositoryRefresh,
  onRetryVaultDeletion,
  onSaveVaultBranchFilters,
}: VaultDashboardBodyProps) {
  const deleteCardElementsRef = useRef(new Map<string, HTMLDivElement>());
  const lastScrolledDeleteRepositoryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!deleteRepositoryFullName) {
      lastScrolledDeleteRepositoryRef.current = null;
      return;
    }

    if (lastScrolledDeleteRepositoryRef.current === deleteRepositoryFullName) {
      return;
    }

    const deleteCardElement = deleteCardElementsRef.current.get(
      deleteRepositoryFullName,
    );
    if (!deleteCardElement) {
      return;
    }

    // Direct ?delete= loads resolve after vault data arrives, so anchor the
    // selected card once the target element exists.
    deleteCardElement.scrollIntoView({
      block: "start",
      inline: "nearest",
    });
    lastScrolledDeleteRepositoryRef.current = deleteRepositoryFullName;
  }, [deleteRepositoryFullName, vaults]);

  if (vaults.length === 0) {
    return <VaultDashboardEmptyState themeColorSearch={themeColorSearch} />;
  }

  return (
    <VaultDashboardRepositoryList>
      {vaults.map((vault) => {
        const deletion = vault.deletion;
        const isDeletingVault = deletion.state !== "not_deleting";
        const isReady = vault.state === "ready" && !isDeletingVault;
        const remoteBranches = vault.remoteBranches;
        const vaultBranchFilters =
          persistedVaultBranchFiltersByVaultId.get(vault._id) ??
          getDefaultVaultBranchFilters();
        const activeRemoteBranches = remoteBranches.filter(
          (branch) => branch.remoteState === "active",
        );
        const defaultBranch = activeRemoteBranches.find(
          (branch) => branch.isDefault,
        )?.name;
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
          developerToolsVisible &&
          (openDeveloperToolsByVaultId[vault._id] ?? false);
        const resourceRailState = buildVaultDashboardResourceRailState({
          githubRepositoryUrl,
          vault,
        });
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
        const sourceSetupSection =
          !isReady &&
          (vault.sourceSetup.status === "failed" ||
            vault.sourceSetup.status === "running") ? (
            <VaultSourceSetupSection
              repositoryFullName={vault.repositoryFullName}
              sourceSetup={vault.sourceSetup}
              vaultId={vault._id}
            />
          ) : undefined;
        const providerSetupStatus =
          isReady && vault.isNoterManaged
            ? resolveVaultProviderSetupStatus(vault.providerSetup)
            : null;
        const providerSetupSection =
          providerSetupStatus &&
          (vault.providerSetup.status === "failed" ||
            vault.providerSetup.status === "running") ? (
            <VaultProviderSetupSection
              providerSetup={vault.providerSetup}
              repositoryFullName={vault.repositoryFullName}
              vaultId={vault._id}
            />
          ) : undefined;
        const deleteBlockedSection =
          !isDeletingVault &&
          deleteRepositoryFullName === vault.repositoryFullName &&
          deletion.deleteAction.state === "disabled" ? (
            <VaultDeleteBlockedSection reason={deletion.deleteAction.reason} />
          ) : undefined;
        const deletionSection =
          deletion.state === "deleting" ||
          deletion.state === "delete_failed" ? (
            <VaultDeletionStatusSection
              deletion={deletion}
              isRetrying={retryingDeletionRunId === deletion.runId}
              onRetry={onRetryVaultDeletion}
            />
          ) : undefined;
        const setupSection =
          deletionSection ??
          deleteBlockedSection ??
          sourceSetupSection ??
          providerSetupSection;

        return (
          <div
            key={vault._id}
            ref={(element) => {
              if (element) {
                deleteCardElementsRef.current.set(
                  vault.repositoryFullName,
                  element,
                );
                return;
              }

              deleteCardElementsRef.current.delete(vault.repositoryFullName);
            }}
          >
            <VaultDashboardRepositoryCard
              isReady={isReady}
              repositoryOwner={vault.ghRepoOwner}
              repositoryName={vault.ghRepoName}
              titleHref={undefined}
              titleTarget={undefined}
              titleTitle={undefined}
              titleClassName={undefined}
              repositoryLinks={
                isDeletingVault ? undefined : (
                  <VaultResourceRail state={resourceRailState} />
                )
              }
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
                  <span className="shrink-0 text-xs font-normal text-destructive">
                    (failed)
                  </span>
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
                    filteredBranchCount={
                      branchSectionState.filteredRemoteBranches.length
                    }
                    filterOptions={branchSectionState.filterOptions}
                    filters={vaultBranchFilters}
                    hiddenBranchCount={branchSectionState.hiddenBranchCount}
                    onChangeFilters={(nextVaultBranchFilters) => {
                      onSaveVaultBranchFilters(
                        vault._id,
                        nextVaultBranchFilters,
                      );
                    }}
                    remoteBranchCount={remoteBranches.length}
                    expansion={
                      branchSectionState.hasBranchListOverflow
                        ? {
                            hiddenBranchCount:
                              branchSectionState.collapsedBranchCount,
                            isExpanded: vaultBranchFilters.branchesExpanded,
                            onToggle: () => {
                              onSaveVaultBranchFilters(vault._id, {
                                ...vaultBranchFilters,
                                branchesExpanded:
                                  !vaultBranchFilters.branchesExpanded,
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
                isReady &&
                branchSectionState.filteredRemoteBranches.length > 0 ? (
                  <VaultBranchSection
                    filteredBranchCount={
                      branchSectionState.filteredRemoteBranches.length
                    }
                    vaultId={vault._id}
                    repositoryFullName={vault.repositoryFullName}
                    visibleRemoteBranches={
                      branchSectionState.visibleRemoteBranches
                    }
                    productionDeploymentDashboardUrl={
                      vault.convexDeploymentDashboardUrl
                    }
                  />
                ) : undefined
              }
              developerToolsSection={
                isReady
                  ? {
                      open: developerToolsOpen,
                      visible: developerToolsVisible,
                      onOpenChange: (isOpen: boolean) => {
                        onOpenDeveloperToolsChange(vault._id, isOpen);
                      },
                      content: (
                        <>
                          {CODESPACES_ENABLED ? (
                            <CodespaceStatus
                              vaultId={vault._id}
                              repositoryFullName={vault.repositoryFullName}
                            />
                          ) : null}
                          {vault.isNoterManaged && (
                            <div className="space-y-2">
                              <div className="text-xs text-muted-foreground">
                                {formatProviderSetupDeveloperLabel(
                                  vault.providerSetup,
                                )}
                                {vault.cloudflareProductionUrl && (
                                  <a
                                    href={vault.cloudflareProductionUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className={`ml-2 font-mono break-all ${linkStyle}`}
                                  >
                                    {vault.cloudflareProductionUrl}
                                  </a>
                                )}
                              </div>
                              <VaultProvisioningLogTextarea
                                repositoryFullName={vault.repositoryFullName}
                                vaultId={vault._id}
                              />
                            </div>
                          )}
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
  return !(
    mode === "auto" &&
    availability.status === "taken" &&
    availability.suggestion
  );
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
  const [checkState, setCheckState] =
    useState<CreateResourceNameCheckState | null>(null);
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
          setCheckError(
            error instanceof Error
              ? error.message
              : "Could not check provider names.",
          );
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
          className={clsx(
            "ml-1 text-left text-blue-600 underline underline-offset-2",
            linkStyle,
          )}
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
  kind: "available" | "checking";
}) {
  return (
    <div
      className={clsx(
        "flex min-w-0 items-start gap-1.5 text-xs",
        kind === "available" && "text-green-600",
        kind === "checking" && "text-muted-foreground",
      )}
      role="status"
    >
      {kind === "available" ? (
        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
      )}
      <span className="min-w-0">{children}</span>
    </div>
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
    <button
      type="button"
      className={clsx("text-left", linkStyle)}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function CreateControlMessageSlot({
  children,
  size = "compact",
}: {
  children: ReactNode;
  size?: "compact" | "comfortable";
}) {
  const isEmpty =
    children === null ||
    children === undefined ||
    typeof children === "boolean" ||
    children === "";
  const sizeClassName = size === "comfortable" ? "min-h-5" : "min-h-4";

  return (
    <div
      className={clsx(
        "min-w-0",
        sizeClassName,
        isEmpty && "invisible pointer-events-none",
      )}
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
  const developerToolsVisible =
    rootRouteSearch[DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM] === true;
  const vaults = useQuery(api.vault.dashboard.getUserVaults);
  const now = useNow();
  const deleteVault = useAction(api.vault.actions.deleteVault);
  const retryDeleteVault = useAction(api.vault.actions.retryDeleteVault);
  const createRepository = useAction(api.vault.actions.createRepository);
  const checkCreateRepositoryResourceNames = useAction(
    api.vault.actions.checkCreateRepositoryResourceNames,
  );
  const listGithubRepositoryOwners = useAction(
    api.vault.actions.listRepositoryOwners,
  );
  const commitStaging = useAction(api.fileStagingActions.commitStaging);
  const getGithubOAuthUrl = useMutation(api.githubOAuth.getGithubOAuthUrl);
  const getConvexOAuthUrl = useMutation(api.convexOAuth.getConvexOAuthUrl);
  const getCloudflareMcpOAuthUrl = useAction(
    api.cloudflareMcpOAuth.getCloudflareMcpOAuthUrl,
  );
  const refreshCloudflareMcpTokenIfNeeded = useAction(
    api.users.refreshCloudflareMcpTokenIfNeeded,
  );
  const connectGithubWithApiKey = useAction(api.users.connectGithubWithApiKey);
  const connectConvexWithApiKey = useAction(api.users.connectConvexWithApiKey);
  const disconnectGithub = useMutation(api.users.disconnectGithub);
  const disconnectConvex = useMutation(api.users.disconnectConvex);
  const disconnectCloudflare = useMutation(api.users.disconnectCloudflare);
  const persistAccountPanelOpen = useMutation(
    api.dashboardSettings.setAccountPanelOpen,
  ).withOptimisticUpdate((localStore, args) => {
    const currentSettings = localStore.getQuery(
      api.dashboardSettings.getDashboardSettings,
      {},
    );
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
  const setProvidersPanelOpen = useMutation(
    api.dashboardSettings.setProvidersPanelOpen,
  ).withOptimisticUpdate((localStore, args) => {
    const currentSettings = localStore.getQuery(
      api.dashboardSettings.getDashboardSettings,
      {},
    );
    if (!currentSettings) {
      return;
    }
    localStore.setQuery(
      api.dashboardSettings.getDashboardSettings,
      {},
      {
        ...currentSettings,
        providersPanelOpen: args.isOpen,
      },
    );
  });
  const setEditorChatOpen = useMutation(
    api.dashboardSettings.setEditorChatOpen,
  ).withOptimisticUpdate((localStore, args) => {
    const currentSettings = localStore.getQuery(
      api.dashboardSettings.getDashboardSettings,
      {},
    );
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
  const cloudflareConnection = useConvexQuery(
    api.users.getCloudflareConnectionStatus,
  );
  const userVaultBranchFilters = useConvexQuery(
    api.vault.dashboard.getUserVaultBranchFilters,
  );
  const user = useConvexQuery(api.users.viewer);
  const authProviders = useConvexQuery(api.users.getViewerAuthProviders);
  const dashboardSettings = useConvexQuery(
    api.dashboardSettings.getDashboardSettings,
  );
  const { signOut } = useNoterAuthActions();
  const dashboardAccountPanelOpen = dashboardSettings?.accountPanelOpen;
  const dashboardGlobalChatOpen = dashboardSettings?.globalChatOpen;
  const dashboardProvidersPanelOpen = dashboardSettings?.providersPanelOpen;
  const deleteRepositoryFullName = rootRouteSearch.delete;
  const setVaultBranchFilters = useMutation(
    api.vault.dashboard.setVaultBranchFilters,
  ).withOptimisticUpdate((localStore, args) => {
    const currentFilters = localStore.getQuery(
      api.vault.dashboard.getUserVaultBranchFilters,
      {},
    );
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

    localStore.setQuery(
      api.vault.dashboard.getUserVaultBranchFilters,
      {},
      nextFilters,
    );
  });
  const githubPopupRef = useRef<Window | null>(null);
  const convexPopupRef = useRef<Window | null>(null);
  const cloudflarePopupRef = useRef<Window | null>(null);
  const githubPopupOriginRef = useRef<string | null>(null);
  const convexPopupOriginRef = useRef<string | null>(null);
  const cloudflarePopupOriginRef = useRef<string | null>(null);
  const preparedDeleteRepositoryRef = useRef<string | null>(null);
  // In-app delete icon clicks should close back to the dashboard entry that
  // existed before the modal; direct links should only replace the delete key.
  const previousDeleteRepositoryFullNameRef = useRef(deleteRepositoryFullName);
  const shouldPopDeleteHistoryRef = useRef(false);
  const providerRuntimeConfig: Record<ProviderKey, ProviderRuntimeConfig> = {
    github: {
      getOAuthUrl: () => getGithubOAuthUrl({}),
      disconnect: disconnectGithub,
      popupRef: githubPopupRef,
      popupOriginRef: githubPopupOriginRef,
    },
    convex: {
      getOAuthUrl: getConvexOAuthUrl,
      disconnect: disconnectConvex,
      popupRef: convexPopupRef,
      popupOriginRef: convexPopupOriginRef,
    },
    cloudflare: {
      getOAuthUrl: getCloudflareMcpOAuthUrl,
      disconnect: disconnectCloudflare,
      popupRef: cloudflarePopupRef,
      popupOriginRef: cloudflarePopupOriginRef,
    },
  };
  const dashboardLocalStore = useVaultDashboardLocalStore();
  const {
    cloudflarePollingPaused,
    cloudflareWorkerName,
    cloudflareWorkerNameMode,
    commitError,
    convexProjectName,
    convexProjectNameMode,
    createError,
    dashboardMountedAt,
    deleteError,
    didAttemptCommit,
    disconnectingProvider,
    isAutoCheckingCloudflareToken,
    isCheckingCloudflareToken,
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
    clearCreateError,
    markCommitAttempted,
    prepareDeleteDialog,
    resetCreateRepositoryName,
    resetDeleteDialogState,
    setCloudflarePollingPaused,
    setCloudflareWorkerName,
    setCommitError,
    setConvexProjectName,
    setCreateError,
    setDeleteError,
    setDeleteOption,
    setDeveloperToolsOpen,
    setDisconnectingProvider,
    setGithubRepositoryOwnerLoadError,
    setGithubRepositoryOwnerOptions,
    setGlobalChatAutoFocus,
    setGlobalChatBusy,
    setIsAutoCheckingCloudflareToken,
    setIsCheckingCloudflareToken,
    setIsCommitting,
    setIsCreating,
    setIsDeleting,
    setIsLoadingGithubRepositoryOwners,
    setIsSigningOut,
    setNewRepositoryName,
    setRetryingDeletionRunId,
    setSelectedGithubRepositoryOwner,
  } = dashboardLocalStore.actions;

  useProviderOAuthPopupCompletionReload({
    cloudflarePopupOriginRef,
    cloudflarePopupRef,
    convexPopupOriginRef,
    convexPopupRef,
    githubPopupOriginRef,
    githubPopupRef,
  });

  const { enqueueManualRepositoryRefresh } =
    useDashboardRepositoryRefreshDemand();

  useCloudflareMcpTokenAutoCheck({
    cloudflareConnection,
    refreshCloudflareMcpTokenIfNeeded,
    setCloudflarePollingPaused,
    setIsAutoCheckingCloudflareToken,
    userId: user?._id,
  });

  const deleteDialogVault =
    deleteRepositoryFullName && vaults
      ? (vaults.find(
          (vault) => vault.repositoryFullName === deleteRepositoryFullName,
        ) ?? null)
      : null;
  const canOpenDeleteDialog =
    deleteDialogVault?.deletion.state === "not_deleting" &&
    deleteDialogVault.deletion.deleteAction.state === "available";
  const vaultToDelete =
    deleteDialogVault && canOpenDeleteDialog
      ? buildVaultDeleteIntent(deleteDialogVault)
      : null;
  const stagedChangesCount = deleteDialogVault?.fileCount ?? 0;
  const connectedCodespacesCount = useConvexQuery(
    api.codespaces.mutations.getConnectedCodespacesCount,
    CODESPACES_ENABLED && vaultToDelete
      ? { vaultId: vaultToDelete.id }
      : "skip",
  );

  const clearDeleteSearchParam = useCallback(
    ({ preferHistoryBack }: { preferHistoryBack: boolean }) => {
      const shouldPopDeleteRoute =
        preferHistoryBack &&
        deleteRepositoryFullName &&
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
        search: (currentSearch) =>
          applySearchPatch(currentSearch, { delete: null }),
        state: true,
        to: ".",
      });
    },
    [deleteRepositoryFullName, navigate, router],
  );

  useEffect(() => {
    const previousDeleteRepositoryFullName =
      previousDeleteRepositoryFullNameRef.current;
    if (!previousDeleteRepositoryFullName && deleteRepositoryFullName) {
      shouldPopDeleteHistoryRef.current = true;
    }
    if (!deleteRepositoryFullName) {
      shouldPopDeleteHistoryRef.current = false;
    }
    previousDeleteRepositoryFullNameRef.current = deleteRepositoryFullName;

    if (!vaultToDelete) {
      if (preparedDeleteRepositoryRef.current) {
        preparedDeleteRepositoryRef.current = null;
        resetDeleteDialogState();
      }
      if (deleteRepositoryFullName && vaults && !deleteDialogVault) {
        clearDeleteSearchParam({ preferHistoryBack: false });
      }
      return;
    }

    if (
      preparedDeleteRepositoryRef.current === vaultToDelete.repositoryFullName
    ) {
      return;
    }

    // The URL owns which vault is targeted; local state only seeds editable
    // cleanup options when that routed target changes.
    prepareDeleteDialog({ target: vaultToDelete });
    preparedDeleteRepositoryRef.current = vaultToDelete.repositoryFullName;
  }, [
    clearDeleteSearchParam,
    deleteRepositoryFullName,
    prepareDeleteDialog,
    resetDeleteDialogState,
    deleteDialogVault,
    vaultToDelete,
    vaults,
  ]);

  const handleConnect = async (provider: ProviderKey) => {
    const providerConfig = providerRuntimeConfig[provider];
    const providerMetadata = PROVIDER_METADATA[provider];
    if (createError) {
      clearCreateError();
    }
    try {
      const oauthUrl =
        provider === "github"
          ? await getGithubOAuthUrl({
              returnToPath: location.href,
            })
          : await providerConfig.getOAuthUrl();
      if (isInIframe()) {
        providerConfig.popupOriginRef.current =
          getRedirectOrigin(oauthUrl) ?? window.location.origin;
        providerConfig.popupRef.current =
          provider === "github"
            ? openGithubOAuthPopup(oauthUrl)
            : window.open(
                oauthUrl,
                providerMetadata.popupName,
                "width=600,height=700,popup=true",
              );
        if (providerConfig.popupRef.current) {
          return;
        }
      }
      window.location.assign(oauthUrl);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : `Failed to start ${providerMetadata.label} OAuth`,
      );
    }
  };

  const handleDisconnect = async (provider: ProviderKey) => {
    const providerConfig = providerRuntimeConfig[provider];
    const providerMetadata = PROVIDER_METADATA[provider];
    if (disconnectingProvider) return;
    setDisconnectingProvider(provider);
    if (createError) {
      clearCreateError();
    }
    try {
      await providerConfig.disconnect();
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : `Failed to disconnect ${providerMetadata.label}`,
      );
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const handleCheckCloudflareToken = async () => {
    if (isCheckingCloudflareToken) {
      return;
    }
    setIsCheckingCloudflareToken(true);
    if (createError) {
      clearCreateError();
    }
    try {
      await refreshCloudflareMcpTokenIfNeeded({
        trigger: "manual",
        force: true,
      });
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Failed to check Cloudflare token",
      );
    } finally {
      setIsCheckingCloudflareToken(false);
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
        removeConvexProvision:
          vaultToDelete.isNoterManaged && vaultToDelete.hasConvexProvision
            ? removeConvexProvision
            : false,
        removeCloudflareProvision:
          vaultToDelete.isNoterManaged && vaultToDelete.hasCloudflareProvision
            ? removeCloudflareProvision
            : false,
      });
      resetDeleteDialogState();
      clearDeleteSearchParam({ preferHistoryBack: true });
    } catch (error) {
      console.error("Failed to remove vault:", error);
      setDeleteError(
        error instanceof Error ? error.message : "Failed to remove vault",
      );
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
        description:
          error instanceof Error ? error.message : "Please try again.",
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
      setCommitError(
        error instanceof Error ? error.message : "Failed to commit changes",
      );
    } finally {
      markCommitAttempted();
      setIsCommitting(false);
    }
  };

  const handleCreateRepository = async () => {
    const repoName = newRepositoryName.trim();
    if (!repoName || isCreating) return;
    if (!hasRequiredCreateConnections) {
      setCreateError(
        `Connect GitHub, Convex, and ${requiredCloudflareConnectionLabel} before creating an app.`,
      );
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
        githubRepositoryNameAvailability?.message ??
          "GitHub repository name is not available.",
      );
      return;
    }
    if (isConvexProjectNameAvailabilityBlocking) {
      setCreateError(
        convexProjectNameAvailability?.message ??
          "Convex project name is not available.",
      );
      return;
    }
    if (isCloudflareWorkerNameAvailabilityBlocking) {
      setCreateError(
        cloudflareWorkerNameAvailability?.message ??
          "Cloudflare Worker name is not available.",
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
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create app",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateRepositoryKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      void handleCreateRepository();
    }
  };

  const githubConnected = githubConnection?.connected === true;
  const convexConnected = convexConnection?.connected === true;
  const cloudflareConnected = cloudflareConnection?.connected === true;
  const cloudflareAuthMethod = cloudflareConnection?.authMethod;
  const requiredCloudflareConnectionLabel = "Cloudflare";
  const cloudflareMcpTokenStatus = cloudflareConnection?.mcpTokenStatus;
  const cloudflareMcpTokenExpiresAt = cloudflareConnection?.mcpTokenExpiresAt;
  const cloudflareMcpTokenCheckedAt = cloudflareConnection?.mcpTokenCheckedAt;
  const cloudflareMcpTokenError = cloudflareConnection?.mcpTokenError;
  const cloudflareMcpTokenNextAutoCheckAt =
    cloudflareConnection?.mcpTokenNextAutoCheckAt;
  const cloudflareRefreshWindowStartsAt =
    typeof cloudflareMcpTokenExpiresAt === "number"
      ? cloudflareMcpTokenExpiresAt - CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS
      : undefined;
  // Keep the create warning quiet until this page load has observed a fresh
  // token-health check, so a stale invalid status does not flash on startup.
  const isAwaitingInitialCloudflareTokenCheck =
    cloudflareConnection?.connected === true &&
    cloudflareConnection.authMethod === "mcp_oauth" &&
    (typeof cloudflareMcpTokenCheckedAt !== "number" ||
      cloudflareMcpTokenCheckedAt < dashboardMountedAt);
  const showCloudflareCreateWarning =
    cloudflareConnected &&
    !isAwaitingInitialCloudflareTokenCheck &&
    !isCheckingCloudflareToken &&
    !isAutoCheckingCloudflareToken &&
    (cloudflareMcpTokenStatus === "invalid" ||
      cloudflareMcpTokenStatus === "expired");
  const hasRequiredCreateConnections = Boolean(
    githubConnected && convexConnected && cloudflareConnected,
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
  const selectedGithubRepositoryOwnerName =
    selectedGithubRepositoryOwner.trim();
  const shouldCheckResourceNames = Boolean(
    hasRequiredCreateConnections &&
    selectedGithubRepositoryOwnerName &&
    createRepositoryName,
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
    createResourceNameCheck?.key === resourceNameCheckKey
      ? createResourceNameCheck.result
      : null;
  const githubRepositoryNameAvailability =
    currentResourceNameCheck?.github ?? null;
  const convexProjectNameAvailability =
    currentResourceNameCheck?.convex ?? null;
  const cloudflareWorkerNameAvailability =
    currentResourceNameCheck?.cloudflare ?? null;
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
  const convexProjectNameValidation = validateAppResourceName(
    resolvedConvexProjectName,
    "convex",
  );
  const cloudflareWorkerNameValidation = validateAppResourceName(
    resolvedCloudflareWorkerName,
    "cloudflare",
  );
  const isConvexProjectNameAvailabilityBlocking =
    isCreateResourceNameAvailabilityBlocking(
      convexProjectNameMode,
      convexProjectNameAvailability,
    );
  const isCloudflareWorkerNameAvailabilityBlocking =
    isCreateResourceNameAvailabilityBlocking(
      cloudflareWorkerNameMode,
      cloudflareWorkerNameAvailability,
    );
  const isGitHubRepositoryNameBlocking =
    isGitHubRepositoryNameAvailabilityBlocking(
      githubRepositoryNameAvailability,
    );
  const isCreateResourceNameCheckPending = Boolean(
    shouldCheckResourceNames &&
    (isCheckingCreateResourceNames || !currentResourceNameCheck),
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
  const formatAuthMethod = (
    method: "oauth" | "mcp_oauth" | "api_key" | "device_auth" | undefined,
  ) => {
    if (method === "api_key") return "API key";
    if (method === "device_auth") return "Device auth";
    if (method === "oauth") return "OAuth";
    if (method === "mcp_oauth") return "OAuth";
    return "Unknown";
  };
  const githubStatus = githubConnected
    ? `Connected as ${githubConnection.username ?? "GitHub user"} (${formatAuthMethod(githubConnection.authMethod)})`
    : "Not connected";
  const convexStatus = convexConnected
    ? `Connected to ${convexConnection.teamSlug ?? convexConnection.teamId ?? "Convex team"} (${formatAuthMethod(convexConnection.authMethod)})`
    : "Not connected";
  const cloudflareMcpTokenTimeStatus =
    cloudflareConnection?.authMethod === "mcp_oauth"
      ? cloudflareMcpTokenStatus === "valid" ||
        cloudflareMcpTokenStatus === "expiring_soon"
        ? typeof cloudflareMcpTokenExpiresAt === "number"
          ? `Expires ${formatRelativeTimeUntil(cloudflareMcpTokenExpiresAt, now)}.`
          : ""
        : cloudflareMcpTokenStatus === "expired"
          ? typeof cloudflareMcpTokenExpiresAt === "number"
            ? `Expired ${formatRelativeTimeAgo(cloudflareMcpTokenExpiresAt, now)}.`
            : ""
          : typeof cloudflareMcpTokenCheckedAt === "number"
            ? `Last checked ${formatRelativeTimeAgo(cloudflareMcpTokenCheckedAt, now)}.`
            : ""
      : "";
  const cloudflareSchedulerStatus =
    cloudflareAuthMethod === "mcp_oauth"
      ? isCheckingCloudflareToken || isAutoCheckingCloudflareToken
        ? "Checking..."
        : cloudflarePollingPaused
          ? "Auto-check paused (tab hidden)."
          : typeof cloudflareMcpTokenNextAutoCheckAt === "number"
            ? typeof cloudflareRefreshWindowStartsAt === "number" &&
              now < cloudflareRefreshWindowStartsAt
              ? `Auto-refresh starts ${formatRelativeTimeUntil(cloudflareRefreshWindowStartsAt, now)}.`
              : `Auto-refresh ${formatRelativeTimeUntil(cloudflareMcpTokenNextAutoCheckAt, now)}.`
            : ""
      : "";
  const cloudflareMcpTokenErrorStatus =
    cloudflareAuthMethod === "mcp_oauth" && cloudflareMcpTokenError
      ? `Error: ${cloudflareMcpTokenError}`
      : "";
  const cloudflareStatus = cloudflareConnected
    ? cloudflareAuthMethod === "mcp_oauth"
      ? [
          "Connected (OAuth).",
          `Token ${formatMcpTokenStatusLabel(cloudflareMcpTokenStatus)}.`,
          cloudflareMcpTokenTimeStatus,
          cloudflareSchedulerStatus,
          cloudflareMcpTokenErrorStatus,
        ]
          .filter((part) => part.length > 0)
          .join(" ")
      : `Connected (${formatAuthMethod(cloudflareAuthMethod)})`
    : "Not connected";
  const providerConnectionState: Record<
    ProviderKey,
    { connected: boolean; status: string; showTokenCheck: boolean }
  > = {
    github: {
      connected: githubConnected,
      status: githubStatus,
      showTokenCheck: false,
    },
    convex: {
      connected: convexConnected,
      status: convexStatus,
      showTokenCheck: false,
    },
    cloudflare: {
      connected: cloudflareConnected,
      status: cloudflareStatus,
      showTokenCheck:
        cloudflareConnected && cloudflareAuthMethod === "mcp_oauth",
    },
  };
  const userDisplayName = user?.name ?? user?.email ?? user?.githubUsername;
  const accountEmail =
    user?.email ?? user?.githubUsername ?? user?.name ?? null;
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
            <span className="ml-1 text-muted-foreground">
              {manualResetContent}
            </span>
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
            <span className="ml-1 text-muted-foreground">
              {manualResetContent}
            </span>
          )}
        </CreateResourceNameFeedback>
      );
    }

    if (isCreateResourceNameCheckPending) {
      return (
        <CreateResourceNameStatus kind="checking">
          Checking {label}...
        </CreateResourceNameStatus>
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
            <span className="ml-1 text-muted-foreground">
              {manualResetContent}
            </span>
          )}
        </CreateResourceNameStatus>
      );
    }

    if (
      mode === "auto" &&
      availability.status === "taken" &&
      availability.suggestion
    ) {
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
          <span className="ml-1 text-muted-foreground">
            {manualResetContent}
          </span>
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

    if (isCreateResourceNameCheckPending) {
      return (
        <CreateResourceNameStatus kind="checking">
          Checking GitHub repository...
        </CreateResourceNameStatus>
      );
    }

    if (!githubRepositoryNameAvailability) {
      return null;
    }

    if (githubRepositoryNameAvailability.status === "available") {
      return (
        <CreateResourceNameStatus kind="available">
          GitHub repository name is available.
        </CreateResourceNameStatus>
      );
    }

    return (
      <CreateResourceNameFeedback
        message={
          githubRepositoryNameAvailability.message ??
          "GitHub repository name is not available."
        }
        suggestion={githubRepositoryNameAvailability.suggestion}
        onUseSuggestion={setNewRepositoryName}
      />
    );
  };
  const createPlaceholder = "GitHub repo name";
  const createButtonLabel = isCreating ? "Creating app..." : "New App";
  const canEditProviderResourceNames = createRepositoryName.length > 0;
  const providerResourceNameInputDisabled =
    !hasRequiredCreateConnections ||
    isCreating ||
    !canEditProviderResourceNames;
  const ownerSelectPlaceholder = isLoadingGithubRepositoryOwners
    ? "Loading GitHub owners..."
    : "GitHub owner";
  const createControlFooterMessages =
    createError ||
    !canCreateRepo ||
    githubRepositoryOwnerLoadError ||
    showCloudflareCreateWarning ? (
      <div className="flex flex-col gap-2">
        {createError && (
          <div className="text-sm text-red-600">{createError}</div>
        )}
        {!canCreateRepo && (
          <div className="text-xs text-muted-foreground">
            {hasRequiredCreateConnections
              ? "Choose a GitHub owner to create an app."
              : `Connect GitHub, Convex, and ${requiredCloudflareConnectionLabel} to create an app.`}
          </div>
        )}
        {githubRepositoryOwnerLoadError && (
          <div className="text-xs text-red-600">
            {githubRepositoryOwnerLoadError}
          </div>
        )}
        {showCloudflareCreateWarning && (
          <div className="text-xs text-amber-700">
            Cloudflare token is invalid or expired. Reconnect Cloudflare.
          </div>
        )}
      </div>
    ) : null;
  const { openApiKeyDialog, apiKeyDialog } = useApiKeyConnectDialog({
    connectGithubWithApiKey,
    connectConvexWithApiKey,
  });
  const createControl = (
    <div className="vault-dashboard-sidebar-inset flex w-full flex-col items-stretch gap-2 py-3">
      {githubConnected && (
        <Select
          value={selectedGithubRepositoryOwner}
          onValueChange={setSelectedGithubRepositoryOwner}
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
          <SelectContent>
            {githubRepositoryOwnerOptions.map((owner) => (
              <SelectItem key={owner.login} value={owner.login}>
                {owner.login}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <CreateProviderNameInput
        placeholder={createPlaceholder}
        value={newRepositoryName}
        onChange={setNewRepositoryName}
        onKeyDown={handleCreateRepositoryKeyDown}
        icon={<GitHubProviderLogo />}
        disabled={!hasRequiredCreateConnections || isCreating}
      />
      <CreateControlMessageSlot>
        {renderGitHubRepositoryNameSupport()}
      </CreateControlMessageSlot>
      <div
        className={clsx(
          "flex w-full flex-col items-stretch gap-2",
          !canEditProviderResourceNames && "invisible pointer-events-none",
        )}
        aria-hidden={canEditProviderResourceNames ? undefined : true}
      >
        <CreateProviderNameInput
          placeholder="Convex project name"
          value={resolvedConvexProjectName}
          onChange={(value) => {
            setConvexProjectName(value, "manual");
          }}
          onBlur={() => {
            if (
              convexProjectNameMode === "manual" &&
              !convexProjectName.trim()
            ) {
              setConvexProjectName("", "auto");
            }
          }}
          icon={<ConvexProviderLogo />}
          disabled={providerResourceNameInputDisabled}
          onKeyDown={handleCreateRepositoryKeyDown}
        />
        <CreateControlMessageSlot>
          {renderCreateResourceNameSupport({
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
        </CreateControlMessageSlot>
        <CreateProviderNameInput
          placeholder="Cloudflare Worker name"
          value={resolvedCloudflareWorkerName}
          onChange={(value) => {
            setCloudflareWorkerName(value, "manual");
          }}
          onBlur={() => {
            if (
              cloudflareWorkerNameMode === "manual" &&
              !cloudflareWorkerName.trim()
            ) {
              setCloudflareWorkerName("", "auto");
            }
          }}
          icon={<CloudflareProviderLogo />}
          disabled={providerResourceNameInputDisabled}
          onKeyDown={handleCreateRepositoryKeyDown}
        />
        <CreateControlMessageSlot>
          {renderCreateResourceNameSupport({
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
        </CreateControlMessageSlot>
      </div>
      <Button
        className="w-full"
        onClick={() => {
          void handleCreateRepository();
        }}
        disabled={
          isCreating ||
          newRepositoryName.trim().length === 0 ||
          !canCreateRepo ||
          hasBlockingCreateResourceName
        }
      >
        {createButtonLabel}
      </Button>
      {githubConnected ? (
        <Button
          variant="outline"
          className="h-auto min-h-8 w-full whitespace-normal py-2"
          asChild
        >
          <Link to="/add">
            <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">
              Connect existing app
            </span>
          </Link>
        </Button>
      ) : (
        <Button
          variant="outline"
          className="h-auto min-h-8 w-full whitespace-normal py-2"
          disabled
        >
          <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">
            Connect existing app
          </span>
        </Button>
      )}
      <CreateControlMessageSlot size="comfortable">
        {createControlFooterMessages}
      </CreateControlMessageSlot>
    </div>
  );

  const resolvedProvidersPanelOpen = dashboardProvidersPanelOpen ?? false;
  const resolvedAccountPanelOpen = dashboardAccountPanelOpen ?? false;
  const resolvedGlobalChatOpen = dashboardGlobalChatOpen ?? false;

  const handleAccountPanelOpenChange = (isOpen: boolean) => {
    void persistAccountPanelOpen({ isOpen }).catch((error: unknown) => {
      console.error("Failed to persist account panel state:", error);
    });
  };

  const handleProvidersPanelOpenChange = (isOpen: boolean) => {
    void setProvidersPanelOpen({ isOpen }).catch((error: unknown) => {
      console.error("Failed to persist providers panel state:", error);
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
          description:
            error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsSigningOut(false);
      });
  };

  const handleGlobalChatOpenChange = (isOpen: boolean) => {
    setGlobalChatAutoFocus(isOpen);
    void setEditorChatOpen({ isOpen, scope: "global" }).catch(
      (error: unknown) => {
        console.error("Failed to persist global chat state:", error);
        setGlobalChatAutoFocus(false);
      },
    );
  };

  const providerRows = PROVIDER_KEYS.map((provider) => {
    const providerMetadata = PROVIDER_METADATA[provider];
    const providerState = providerConnectionState[provider];
    const apiKeyProvider = providerMetadata.apiKeyProvider;
    const actions = providerState.connected
      ? providerState.showTokenCheck
        ? [
            {
              key: "check-token",
              label: "Check token",
              onClick: () => {
                void handleCheckCloudflareToken();
              },
              disabled:
                disconnectingProvider !== null ||
                isCheckingCloudflareToken ||
                isAutoCheckingCloudflareToken,
              isPending: isCheckingCloudflareToken,
              pendingLabel: "Checking...",
            },
            {
              key: "disconnect",
              label: "Disconnect",
              onClick: () => {
                void handleDisconnect(provider);
              },
              disabled:
                disconnectingProvider !== null ||
                isCheckingCloudflareToken ||
                isAutoCheckingCloudflareToken,
              isPending: disconnectingProvider === provider,
              pendingLabel: "Disconnecting...",
            },
          ]
        : [
            {
              key: "disconnect",
              label: "Disconnect",
              onClick: () => {
                void handleDisconnect(provider);
              },
              disabled: disconnectingProvider !== null,
              isPending: disconnectingProvider === provider,
              pendingLabel: "Disconnecting...",
            },
          ]
      : [
          {
            key: "oauth",
            label: providerMetadata.oauthButtonLabel,
            onClick: () => {
              void handleConnect(provider);
            },
            disabled: disconnectingProvider !== null,
          },
          ...(apiKeyProvider
            ? [
                {
                  key: "api-key",
                  label: "Use API key",
                  onClick: () => openApiKeyDialog(apiKeyProvider),
                  disabled: disconnectingProvider !== null,
                },
              ]
            : []),
        ];

    return {
      key: provider,
      icon: providerMetadata.icon,
      label: providerMetadata.label,
      status: providerState.status,
      actions,
    } satisfies VaultDashboardProviderRowViewModel;
  });

  if (!vaults) {
    return null;
  }

  const persistedVaultBranchFiltersByVaultId = new Map<
    string,
    VaultBranchFiltersState
  >(
    (userVaultBranchFilters ?? []).map((vaultBranchFilter) => [
      vaultBranchFilter.vaultId,
      normalizeVaultBranchFilters(vaultBranchFilter),
    ]),
  );

  const saveVaultBranchFilters = async (
    vaultId: Id<"vaults">,
    nextVaultBranchFilters: VaultBranchFiltersState,
  ) => {
    const normalizedVaultBranchFilters = normalizeVaultBranchFilters(
      nextVaultBranchFilters,
    );

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
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleVaultDeveloperToolsOpenChange = (
    vaultId: Id<"vaults">,
    isOpen: boolean,
  ) => {
    setDeveloperToolsOpen(vaultId, isOpen);
  };

  const handleVaultBranchFiltersChange = (
    vaultId: Id<"vaults">,
    nextVaultBranchFilters: VaultBranchFiltersState,
  ) => {
    void saveVaultBranchFilters(vaultId, nextVaultBranchFilters);
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
      <VaultDashboardProvidersSection
        open={resolvedProvidersPanelOpen}
        onOpenChange={handleProvidersPanelOpenChange}
        providerRows={providerRows}
      />
      {createControl}
      <div className="mt-auto">
        <AppSidebarMetaSection showLandingPreviewLink side="right" />
      </div>
    </VaultDashboardSidebarContent>
  );
  const dashboardBody = (
    <VaultDashboardBody
      developerToolsVisible={developerToolsVisible}
      isRemovingVault={isDeleting || isCommitting}
      retryingDeletionRunId={retryingDeletionRunId}
      now={now}
      themeColorSearch={rootRouteSearch}
      openDeveloperToolsByVaultId={openDeveloperToolsByVaultId}
      persistedVaultBranchFiltersByVaultId={
        persistedVaultBranchFiltersByVaultId
      }
      deleteRepositoryFullName={deleteRepositoryFullName}
      vaults={vaults}
      onOpenDeveloperToolsChange={handleVaultDeveloperToolsOpenChange}
      onManualRepositoryRefresh={enqueueManualRepositoryRefresh}
      onRetryVaultDeletion={(runId) => {
        void handleRetryVaultDeletion(runId);
      }}
      onSaveVaultBranchFilters={handleVaultBranchFiltersChange}
    />
  );

  return (
    <PublicLandingLogoLinkProvider>
      <PersistedSidebarProvider
        defaultState={DASHBOARD_SIDEBAR_DEFAULT_STATE}
        shortcutPaneSide="right"
        workspaceKey="dashboard"
      >
        <WorkspaceLayoutV2FullPage
          right={{
            header: null,
            content: sidebarContent,
          }}
          main={{
            header: null,
            content: dashboardBody,
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
        />
      </PersistedSidebarProvider>

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
      {apiKeyDialog}
    </PublicLandingLogoLinkProvider>
  );
}
