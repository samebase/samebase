import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  GitHubLogoIcon,
  TrashIcon,
  UpdateIcon,
  ChevronDownIcon,
  LightningBoltIcon,
  GlobeIcon,
} from "@radix-ui/react-icons";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { linkStyle } from "./styles";
import { clsx } from "clsx";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import {
  formatRelativeTimeAgo,
  formatRelativeTimeUntil,
} from "@/lib/formatRelativeTime";
import {
  CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS,
  CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS,
} from "../../shared/cloudflareTokenRefresh";
import type { DaytonaSnapshotStatus } from "@/lib/daytonaSnapshot";
import {
  claimRefreshDebounce,
  releaseRefreshDebounce,
} from "@/lib/treeRefreshDebounce";
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
  type ComponentType,
  type MutableRefObject,
} from "react";
import { isInIframe } from "@/authClient";
import { UserMenu } from "@/components/UserMenu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import { CodespaceStatus } from "@/components/CodespaceStatus";
import { DaytonaSnapshotBanner } from "@/components/DaytonaSnapshotBanner";
import { DaytonaWorkspaceButton } from "@/components/DaytonaWorkspaceButton";
import { VaultSyncStatus } from "@/components/VaultSyncStatus";
import { DaytonaSnapshotList } from "@/components/DaytonaSnapshotList";
import { EditedFilesCategoriesPopover } from "@/components/EditedFilesCategories";
import {
  useApiKeyConnectDialog,
  type ApiKeyProvider,
} from "@/components/ApiKeyConnectDialog";
import type { Id } from "../../convex/_generated/dataModel";
import { buildVaultCodespaceChatRoute } from "@/lib/vaultRoutes";

const formatInfraState = (
  infraState: "not_started" | "provisioning" | "ready" | "failed" | "partial",
) => {
  if (infraState === "not_started") return "Not started";
  if (infraState === "provisioning") return "Provisioning";
  if (infraState === "ready") return "Ready";
  if (infraState === "failed") return "Failed";
  return "Partial";
};

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

const getInfraActionLabel = (
  infraState: "not_started" | "provisioning" | "ready" | "failed" | "partial",
) => {
  if (infraState === "not_started") return "Provision infra";
  if (infraState === "failed" || infraState === "partial") return "Retry infra";
  return null;
};

type DaytonaResourceFlags = {
  daytonaSandboxId?: string | null;
  daytonaSnapshotName?: string | null;
  daytonaPrebuildLogsSnapshot?: string | null;
  daytonaCurrentSnapshotName?: string | null;
  daytonaCurrentSnapshotStatus?: DaytonaSnapshotStatus | null;
};

const hasDaytonaResourcesForVault = (
  vault: DaytonaResourceFlags | null | undefined,
) =>
  Boolean(
    vault?.daytonaSandboxId ||
      vault?.daytonaSnapshotName ||
      vault?.daytonaPrebuildLogsSnapshot ||
      vault?.daytonaCurrentSnapshotName,
  );

type CreateTemplate = "app" | "agent";
const CREATE_HOSTING_PROVIDERS = ["cloudflare", "netlify"] as const;
type CreateHostingProvider = (typeof CREATE_HOSTING_PROVIDERS)[number];

const isCreateTemplate = (value: string): value is CreateTemplate =>
  value === "app" || value === "agent";
const isCreateHostingProvider = (
  value: string,
): value is CreateHostingProvider =>
  CREATE_HOSTING_PROVIDERS.some((provider) => provider === value);
const CREATE_HOSTING_PROVIDER_LABEL: Record<CreateHostingProvider, string> = {
  netlify: "Netlify",
  cloudflare: "Cloudflare",
};

const DASHBOARD_REFRESH_CONCURRENCY = 3;
type RefreshTrigger = "focus" | "page_load";
const PROVIDER_KEYS = ["github", "convex", "netlify", "cloudflare"] as const;
type ProviderKey = (typeof PROVIDER_KEYS)[number];
type ProviderMetadata = {
  label: string;
  oauthButtonLabel: string;
  popupName: string;
  completionEventType: string;
  icon: ComponentType<{ className?: string }>;
  apiKeyProvider: ApiKeyProvider | null;
};
type ProviderRuntimeConfig = {
  getOAuthUrl: () => Promise<string>;
  disconnect: () => Promise<unknown>;
  popupRef: MutableRefObject<Window | null>;
  popupOriginRef: MutableRefObject<string | null>;
};
const PROVIDER_METADATA: Record<ProviderKey, ProviderMetadata> = {
  github: {
    label: "GitHub",
    oauthButtonLabel: "GitHub OAuth",
    popupName: "github-oauth",
    completionEventType: "github-oauth-complete",
    icon: GitHubLogoIcon,
    apiKeyProvider: "github",
  },
  convex: {
    label: "Convex",
    oauthButtonLabel: "Convex OAuth",
    popupName: "convex-oauth",
    completionEventType: "convex-oauth-complete",
    icon: LightningBoltIcon,
    apiKeyProvider: "convex",
  },
  netlify: {
    label: "Netlify",
    oauthButtonLabel: "Netlify OAuth",
    popupName: "netlify-oauth",
    completionEventType: "netlify-oauth-complete",
    icon: GlobeIcon,
    apiKeyProvider: "netlify",
  },
  cloudflare: {
    label: "Cloudflare",
    oauthButtonLabel: "Cloudflare MCP OAuth",
    popupName: "cloudflare-mcp-oauth",
    completionEventType: "cloudflare-mcp-oauth-complete",
    icon: GlobeIcon,
    apiKeyProvider: null,
  },
};

function VaultBranchLinkRow({
  vaultId,
  repositoryFullName,
  branchName,
  isDefault,
  stagedSummary,
}: {
  vaultId: Id<"vaults">;
  repositoryFullName: string;
  branchName: string;
  isDefault: boolean;
  stagedSummary?: {
    modified: number;
    deleted: number;
    new: number;
    renamed: number;
    renamedAndModified: number;
    total: number;
  };
}) {
  const hasStagedChanges = (stagedSummary?.total ?? 0) > 0;
  const branchPath = encodeURIComponent(branchName);
  const branchRoute = `/vault/${repositoryFullName}/${branchPath}`;

  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-2 py-2 last:border-b-0">
      <Link
        to={branchRoute}
        className={clsx(
          "min-w-0 flex-1 truncate text-sm text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current",
          isDefault && "font-medium text-foreground",
        )}
      >
        {branchName}
      </Link>
      {hasStagedChanges ? (
        <div className="shrink-0">
          <EditedFilesCategoriesPopover
            vaultId={vaultId}
            repositoryFullName={repositoryFullName}
            branch={branchName}
            summaryCounts={stagedSummary}
          />
        </div>
      ) : (
        <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">
          0
        </span>
      )}
    </div>
  );
}

function VaultBranchList({
  vaultId,
  repositoryFullName,
  remoteBranches,
}: {
  vaultId: Id<"vaults">;
  repositoryFullName: string;
  remoteBranches: Array<{
    name: string;
    isDefault: boolean;
    remoteState: "active" | "deleted_upstream";
  }>;
}) {
  const stagedSummaries =
    useQuery(api.fileStaging.listStagedFilesBranchSummaries, {
      vaultId,
    }) ?? [];
  const summaryByBranch = new Map(
    stagedSummaries.map((summary) => [summary.branch, summary.counts]),
  );

  return (
    <div className="overflow-hidden rounded-md border border-border/60 bg-muted/20">
      {remoteBranches.map((branch) => (
        <VaultBranchLinkRow
          key={branch.name}
          vaultId={vaultId}
          repositoryFullName={repositoryFullName}
          branchName={branch.name}
          isDefault={branch.isDefault}
          stagedSummary={summaryByBranch.get(branch.name)}
        />
      ))}
    </div>
  );
}

export function VaultDashboard() {
  const vaults = useQuery(api.vault.getUserVaults);
  const now = useNow();
  const deleteVault = useAction(api.vaultActions.deleteVault);
  const createRepository = useAction(api.vaultActions.createRepository);
  const retryInfrastructureProvisioning = useAction(
    api.vaultActions.retryInfrastructureProvisioning,
  );
  const commitStaging = useAction(api.fileStagingActions.commitStaging);
  const refreshTree = useAction(api.github.refreshRepositoryTree);
  const getGithubOAuthUrl = useMutation(api.githubOAuth.getGithubOAuthUrl);
  const getConvexOAuthUrl = useMutation(api.convexOAuth.getConvexOAuthUrl);
  const getNetlifyOAuthUrl = useMutation(api.netlifyOAuth.getNetlifyOAuthUrl);
  const getCloudflareMcpOAuthUrl = useAction(
    api.cloudflareMcpOAuth.getCloudflareMcpOAuthUrl,
  );
  const refreshCloudflareMcpTokenIfNeeded = useAction(
    api.users.refreshCloudflareMcpTokenIfNeeded,
  );
  const connectGithubWithApiKey = useAction(api.users.connectGithubWithApiKey);
  const connectConvexWithApiKey = useAction(api.users.connectConvexWithApiKey);
  const connectNetlifyWithApiKey = useAction(
    api.users.connectNetlifyWithApiKey,
  );
  const disconnectGithub = useMutation(api.users.disconnectGithub);
  const disconnectConvex = useMutation(api.users.disconnectConvex);
  const disconnectNetlify = useMutation(api.users.disconnectNetlify);
  const disconnectCloudflare = useMutation(api.users.disconnectCloudflare);
  const setProvidersPanelOpen = useMutation(
    api.dashboardSettings.setProvidersPanelOpen,
  );
  const githubConnection = useConvexQuery(api.users.getGithubConnectionStatus);
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus);
  const netlifyConnection = useConvexQuery(
    api.users.getNetlifyConnectionStatus,
  );
  const cloudflareConnection = useConvexQuery(
    api.users.getCloudflareConnectionStatus,
  );
  const user = useConvexQuery(api.users.viewer);
  const dashboardSettings = useConvexQuery(
    api.dashboardSettings.getDashboardSettings,
  );
  const dashboardProvidersPanelOpen = dashboardSettings?.providersPanelOpen;
  const githubPopupRef = useRef<Window | null>(null);
  const convexPopupRef = useRef<Window | null>(null);
  const netlifyPopupRef = useRef<Window | null>(null);
  const cloudflarePopupRef = useRef<Window | null>(null);
  const githubPopupOriginRef = useRef<string | null>(null);
  const convexPopupOriginRef = useRef<string | null>(null);
  const netlifyPopupOriginRef = useRef<string | null>(null);
  const cloudflarePopupOriginRef = useRef<string | null>(null);
  const providerRuntimeConfig: Record<ProviderKey, ProviderRuntimeConfig> = {
    github: {
      getOAuthUrl: getGithubOAuthUrl,
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
    netlify: {
      getOAuthUrl: getNetlifyOAuthUrl,
      disconnect: disconnectNetlify,
      popupRef: netlifyPopupRef,
      popupOriginRef: netlifyPopupOriginRef,
    },
    cloudflare: {
      getOAuthUrl: getCloudflareMcpOAuthUrl,
      disconnect: disconnectCloudflare,
      popupRef: cloudflarePopupRef,
      popupOriginRef: cloudflarePopupOriginRef,
    },
  };
  const [vaultToDelete, setVaultToDelete] = useState<{
    id: Id<"vaults">;
    repositoryFullName: string;
    isNoterManaged: boolean;
    hasConvexProvision: boolean;
    hasHostingProvision: boolean;
    hostingProvider?: CreateHostingProvider;
  } | null>(null);
  const [removeGithubRepo, setRemoveGithubRepo] = useState(false);
  const [removeCodespaces, setRemoveCodespaces] = useState(false);
  const [removeConvexProvision, setRemoveConvexProvision] = useState(false);
  const [removeHostingProvision, setRemoveHostingProvision] = useState(false);
  const [removeDaytonaResources, setRemoveDaytonaResources] = useState(false);
  const [newRepositoryName, setNewRepositoryName] = useState("");
  const [createTemplate, setCreateTemplate] = useState<CreateTemplate>("app");
  const [createHostingProvider, setCreateHostingProvider] =
    useState<CreateHostingProvider>("cloudflare");
  const [disconnectingProvider, setDisconnectingProvider] =
    useState<ProviderKey | null>(null);
  const [isCheckingCloudflareToken, setIsCheckingCloudflareToken] =
    useState(false);
  const [isAutoCheckingCloudflareToken, setIsAutoCheckingCloudflareToken] =
    useState(false);
  const [cloudflarePollingPaused, setCloudflarePollingPaused] = useState(
    typeof document !== "undefined"
      ? document.visibilityState !== "visible"
      : false,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [didAttemptCommit, setDidAttemptCommit] = useState(false);
  const [retryingVaultId, setRetryingVaultId] = useState<Id<"vaults"> | null>(
    null,
  );
  const [openDeveloperToolsByVaultId, setOpenDeveloperToolsByVaultId] =
    useState<Partial<Record<Id<"vaults">, boolean>>>({});
  const [providersPanelOpen, setProvidersPanelOpenState] = useState<
    boolean | null
  >(null);
  const providersPanelPendingRef = useRef<boolean | null>(null);
  const cloudflareAutoCheckInFlightRef = useRef(false);

  useEffect(() => {
    if (dashboardProvidersPanelOpen === undefined) {
      return;
    }
    const serverValue = dashboardProvidersPanelOpen;
    if (providersPanelPendingRef.current !== null) {
      if (providersPanelPendingRef.current === serverValue) {
        providersPanelPendingRef.current = null;
      } else {
        return;
      }
    }
    setProvidersPanelOpenState(serverValue);
  }, [dashboardProvidersPanelOpen]);

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
      netlify: {
        completionEventType: PROVIDER_METADATA.netlify.completionEventType,
        popupRef: netlifyPopupRef,
        popupOriginRef: netlifyPopupOriginRef,
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
  }, []);

  const refreshVaultTreesIfNeeded = useCallback(
    (trigger: RefreshTrigger = "focus") => {
      if (!vaults || vaults.length === 0) {
        return;
      }

      const readyVaults = vaults.filter((vault) => vault.state === "ready");
      const vaultsToRefresh = readyVaults.filter((vault) =>
        claimRefreshDebounce("dashboard", vault.repositoryFullName),
      );

      if (vaultsToRefresh.length === 0) {
        return;
      }

      void (async () => {
        for (
          let index = 0;
          index < vaultsToRefresh.length;
          index += DASHBOARD_REFRESH_CONCURRENCY
        ) {
          const batch = vaultsToRefresh.slice(
            index,
            index + DASHBOARD_REFRESH_CONCURRENCY,
          );

          await Promise.all(
            batch.map(async (vault) => {
              await refreshTree({
                owner: vault.ghRepoOwner,
                repo: vault.ghRepoName,
                trigger,
              }).catch((error: unknown) => {
                console.error(
                  "Failed to refresh repository tree from dashboard:",
                  error,
                );
                releaseRefreshDebounce("dashboard", vault.repositoryFullName);
              });
            }),
          );
        }
      })();
    },
    [refreshTree, vaults],
  );

  useEffect(() => {
    if (!vaults || vaults.length === 0) {
      return;
    }

    const handleFocus = () => {
      refreshVaultTreesIfNeeded();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshVaultTreesIfNeeded();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (document.visibilityState === "visible") {
      refreshVaultTreesIfNeeded("page_load");
    }

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshVaultTreesIfNeeded, vaults]);

  useEffect(() => {
    const isCloudflareMcpConnected =
      cloudflareConnection?.connected === true &&
      cloudflareConnection.authMethod === "mcp_oauth";
    if (!isCloudflareMcpConnected) {
      setCloudflarePollingPaused(false);
      return;
    }

    const debounceKey = user?._id ?? "cloudflare-dashboard";
    const runAutoCheck = (
      trigger: "focus" | "visibility" | "page_load" | "poll",
    ) => {
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
    user?._id,
  ]);

  const selectedVault =
    vaultToDelete && vaults
      ? vaults.find(
          (vault: (typeof vaults)[0]) => vault._id === vaultToDelete.id,
        ) ?? null
      : null;
  const stagedChangesCount = selectedVault?.fileCount ?? 0;
  const hasStagedChanges = stagedChangesCount > 0;
  const hasDaytonaResources = hasDaytonaResourcesForVault(selectedVault);
  const removeHostingCheckboxId =
    vaultToDelete?.hostingProvider === "cloudflare"
      ? "remove-cloudflare-provision"
      : vaultToDelete?.hostingProvider === "netlify"
        ? "remove-netlify-provision"
        : "remove-hosting-provision";
  const removeHostingLabel =
    vaultToDelete?.hostingProvider === "cloudflare"
      ? "Also remove Cloudflare Pages project"
      : vaultToDelete?.hostingProvider === "netlify"
        ? "Also remove Netlify site"
        : "Also remove hosting provider resources";
  const resetDeleteDialogState = () => {
    setVaultToDelete(null);
    setRemoveGithubRepo(false);
    setRemoveCodespaces(false);
    setRemoveConvexProvision(false);
    setRemoveHostingProvision(false);
    setRemoveDaytonaResources(false);
    setCommitError(null);
    setDeleteError(null);
    setDidAttemptCommit(false);
  };

  const connectedCodespacesCount = useConvexQuery(
    api.codespacesMutations.getConnectedCodespacesCount,
    vaultToDelete ? { vaultId: vaultToDelete.id } : "skip",
  );

  const handleConnect = async (provider: ProviderKey) => {
    const providerConfig = providerRuntimeConfig[provider];
    const providerMetadata = PROVIDER_METADATA[provider];
    if (createError) {
      setCreateError(null);
    }
    try {
      const oauthUrl = await providerConfig.getOAuthUrl();
      if (isInIframe()) {
        providerConfig.popupOriginRef.current =
          getRedirectOrigin(oauthUrl) ?? window.location.origin;
        providerConfig.popupRef.current = window.open(
          oauthUrl,
          providerMetadata.popupName,
          "width=600,height=700,popup=true",
        );
        return;
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
      setCreateError(null);
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
      setCreateError(null);
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
    if (!vaultToDelete || isDeleting || isCommitting) return;
    setDeleteError(null);

    try {
      setIsDeleting(true);
      await deleteVault({
        vaultId: vaultToDelete.id,
        removeCodespaces:
          connectedCodespacesCount === 0 ? true : removeCodespaces,
        removeGithubRepo: vaultToDelete.isNoterManaged
          ? removeGithubRepo
          : false,
        removeConvexProvision:
          vaultToDelete.isNoterManaged && vaultToDelete.hasConvexProvision
            ? removeConvexProvision
            : false,
        removeHostingProvision:
          vaultToDelete.isNoterManaged && vaultToDelete.hasHostingProvision
            ? removeHostingProvision
            : false,
        removeDaytonaResources,
      });
      resetDeleteDialogState();
    } catch (error) {
      console.error("Failed to remove vault:", error);
      setDeleteError(
        error instanceof Error ? error.message : "Failed to remove vault",
      );
    } finally {
      setIsDeleting(false);
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
      setDidAttemptCommit(true);
      setIsCommitting(false);
    }
  };

  const handleCreateRepository = async () => {
    const repoName = newRepositoryName.trim();
    if (!repoName || isCreating) return;
    if (!canCreateRepo) {
      setCreateError(
        `Connect GitHub, Convex, and ${requiredHostingConnectionLabel} before creating ${createTemplateArticle}.`,
      );
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      await createRepository({
        name: repoName,
        private: true,
        templateType: createTemplate,
        hostingProvider: createHostingProvider,
      });
      setNewRepositoryName("");
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : `Failed to create ${createTemplate}`,
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleRetryInfrastructure = async (vaultId: Id<"vaults">) => {
    if (retryingVaultId === vaultId) {
      return;
    }
    setRetryingVaultId(vaultId);
    try {
      await retryInfrastructureProvisioning({ vaultId });
    } catch (error) {
      console.error("Failed to retry infrastructure provisioning:", error);
    } finally {
      setRetryingVaultId(null);
    }
  };

  const githubConnected = githubConnection?.connected === true;
  const convexConnected = convexConnection?.connected === true;
  const netlifyConnected = netlifyConnection?.connected === true;
  const cloudflareConnected = cloudflareConnection?.connected === true;
  useEffect(() => {
    const selectedConnected =
      createHostingProvider === "netlify"
        ? netlifyConnected
        : cloudflareConnected;
    if (selectedConnected) {
      return;
    }

    const fallbackHostingProvider = cloudflareConnected
      ? "cloudflare"
      : netlifyConnected
        ? "netlify"
        : null;
    if (
      fallbackHostingProvider &&
      fallbackHostingProvider !== createHostingProvider
    ) {
      setCreateHostingProvider(fallbackHostingProvider);
    }
  }, [cloudflareConnected, createHostingProvider, netlifyConnected]);

  const hostingConnectionByProvider: Record<CreateHostingProvider, boolean> = {
    cloudflare: cloudflareConnected,
    netlify: netlifyConnected,
  };
  const connectedHostingProviders = CREATE_HOSTING_PROVIDERS.filter(
    (provider) => hostingConnectionByProvider[provider],
  );
  const createHostingProviderOptions =
    connectedHostingProviders.length > 0
      ? connectedHostingProviders.includes(createHostingProvider)
        ? connectedHostingProviders
        : [...connectedHostingProviders, createHostingProvider]
      : CREATE_HOSTING_PROVIDERS;
  const isHostingProviderConnected = (provider: CreateHostingProvider) =>
    hostingConnectionByProvider[provider];
  const requiredHostingConnectionLabel =
    CREATE_HOSTING_PROVIDER_LABEL[createHostingProvider];
  const requiredHostingConnected =
    hostingConnectionByProvider[createHostingProvider];
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
  const showCloudflareCreateWarning =
    createHostingProvider === "cloudflare" &&
    cloudflareConnected &&
    (cloudflareMcpTokenStatus === "invalid" ||
      cloudflareMcpTokenStatus === "expired");
  const canCreateRepo = Boolean(
    githubConnected && convexConnected && requiredHostingConnected,
  );
  const formatAuthMethod = (
    method: "oauth" | "mcp_oauth" | "api_key" | undefined,
  ) => {
    if (method === "api_key") return "API key";
    if (method === "oauth") return "OAuth";
    if (method === "mcp_oauth") return "MCP OAuth";
    return "Unknown";
  };
  const githubStatus = githubConnected
    ? `Connected as ${githubConnection.username ?? "GitHub user"} (${formatAuthMethod(githubConnection.authMethod)})`
    : "Not connected";
  const convexStatus = convexConnected
    ? `Connected to ${convexConnection.teamSlug ?? convexConnection.teamId ?? "Convex team"} (${formatAuthMethod(convexConnection.authMethod)})`
    : "Not connected";
  const netlifyStatus = netlifyConnected
    ? `Connected to ${netlifyConnection.teamSlug ?? netlifyConnection.teamId ?? "Netlify team"} (${formatAuthMethod(netlifyConnection.authMethod)})`
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
  const cloudflareAuthMethod = cloudflareConnection?.authMethod;
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
          "Connected (MCP OAuth).",
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
    netlify: {
      connected: netlifyConnected,
      status: netlifyStatus,
      showTokenCheck: false,
    },
    cloudflare: {
      connected: cloudflareConnected,
      status: cloudflareStatus,
      showTokenCheck:
        cloudflareConnected && cloudflareAuthMethod === "mcp_oauth",
    },
  };
  const userDisplayName =
    user?.name ?? user?.email ?? user?.githubUsername ?? "...";
  const userMenu = user ? <UserMenu>{userDisplayName}</UserMenu> : null;
  const createTemplateLabel = createTemplate === "app" ? "App" : "Agent";
  const createTemplateArticle =
    createTemplate === "app" ? "an app" : "an agent";
  const createHostingProviderLabel =
    CREATE_HOSTING_PROVIDER_LABEL[createHostingProvider];
  const createPlaceholder = `New ${createTemplate} name`;
  const createButtonLabel = isCreating
    ? `Creating ${createTemplate}...`
    : `New ${createTemplate}`;
  const { openApiKeyDialog, apiKeyDialog } = useApiKeyConnectDialog({
    connectGithubWithApiKey,
    connectConvexWithApiKey,
    connectNetlifyWithApiKey,
  });
  const createControl = (
    <div className="flex flex-col items-start gap-2">
      <ButtonGroup className="w-full sm:w-[480px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2" variant="outline">
              {createTemplateLabel}
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={createTemplate}
              onValueChange={(value) => {
                if (!isCreateTemplate(value)) return;
                setCreateTemplate(value);
                if (createError) {
                  setCreateError(null);
                }
              }}
            >
              <DropdownMenuRadioItem value="app">App</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="agent">Agent</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2" variant="outline">
              {createHostingProviderLabel}
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={createHostingProvider}
              onValueChange={(value) => {
                if (!isCreateHostingProvider(value)) return;
                setCreateHostingProvider(value);
                if (createError) {
                  setCreateError(null);
                }
              }}
            >
              {createHostingProviderOptions.map((provider) => (
                <DropdownMenuRadioItem
                  key={provider}
                  value={provider}
                  disabled={!isHostingProviderConnected(provider)}
                >
                  {CREATE_HOSTING_PROVIDER_LABEL[provider]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Input
          placeholder={createPlaceholder}
          value={newRepositoryName}
          onChange={(e) => {
            setNewRepositoryName(e.target.value);
            if (createError) {
              setCreateError(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void handleCreateRepository();
            }
          }}
          className="flex-1"
          disabled={!canCreateRepo}
        />
        <Button
          onClick={() => {
            void handleCreateRepository();
          }}
          disabled={
            isCreating ||
            newRepositoryName.trim().length === 0 ||
            !canCreateRepo
          }
        >
          {createButtonLabel}
        </Button>
        <ButtonGroupSeparator className="bg-primary-foreground/30" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="px-2" aria-label="More actions">
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {githubConnected ? (
              <DropdownMenuItem asChild>
                <Link to="/add">Connect existing repo</Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled>
                Connect existing repo
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      {createError && <div className="text-sm text-red-600">{createError}</div>}
      {!canCreateRepo && (
        <div className="text-xs text-muted-foreground">
          {`Connect GitHub, Convex, and ${requiredHostingConnectionLabel} to create apps or agents.`}
        </div>
      )}
      {showCloudflareCreateWarning && (
        <div className="text-xs text-amber-700">
          Cloudflare token is invalid or expired. Reconnect Cloudflare.
        </div>
      )}
    </div>
  );

  const resolvedProvidersPanelOpen =
    providersPanelOpen ?? dashboardSettings?.providersPanelOpen ?? false;

  const handleProvidersPanelOpenChange = (isOpen: boolean) => {
    setProvidersPanelOpenState(isOpen);
    providersPanelPendingRef.current = isOpen;
    void setProvidersPanelOpen({ isOpen }).catch((error: unknown) => {
      console.error("Failed to persist providers panel state:", error);
      providersPanelPendingRef.current = null;
      setProvidersPanelOpenState(
        dashboardSettings?.providersPanelOpen ?? false,
      );
    });
  };

  const connectionPanel = (
    <div className="rounded-lg border border-border bg-background p-4">
      <Collapsible
        className="space-y-3"
        open={resolvedProvidersPanelOpen}
        onOpenChange={handleProvidersPanelOpenChange}
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto w-full justify-between px-0 text-sm font-medium hover:bg-transparent [&[data-state=open]>svg]:rotate-180"
          >
            <span>Providers</span>
            <ChevronDownIcon className="h-4 w-4 transition-transform" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3">
            {PROVIDER_KEYS.map((provider) => {
              const providerMetadata = PROVIDER_METADATA[provider];
              const providerState = providerConnectionState[provider];
              const Icon = providerMetadata.icon;
              const apiKeyProvider = providerMetadata.apiKeyProvider;
              return (
                <div
                  key={provider}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <div className="text-left">
                      <div className="text-sm font-medium">
                        {providerMetadata.label}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {providerState.status}
                      </div>
                    </div>
                  </div>
                  {providerState.connected ? (
                    providerState.showTokenCheck ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCheckCloudflareToken()}
                          disabled={
                            disconnectingProvider !== null ||
                            isCheckingCloudflareToken ||
                            isAutoCheckingCloudflareToken
                          }
                        >
                          {isCheckingCloudflareToken ? (
                            <>
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              Checking...
                            </>
                          ) : (
                            "Check token"
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDisconnect(provider)}
                          disabled={
                            disconnectingProvider !== null ||
                            isCheckingCloudflareToken ||
                            isAutoCheckingCloudflareToken
                          }
                        >
                          {disconnectingProvider === provider ? (
                            <>
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              Disconnecting...
                            </>
                          ) : (
                            "Disconnect"
                          )}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDisconnect(provider)}
                        disabled={disconnectingProvider !== null}
                      >
                        {disconnectingProvider === provider ? (
                          <>
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            Disconnecting...
                          </>
                        ) : (
                          "Disconnect"
                        )}
                      </Button>
                    )
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleConnect(provider)}
                        disabled={disconnectingProvider !== null}
                      >
                        {providerMetadata.oauthButtonLabel}
                      </Button>
                      {apiKeyProvider ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openApiKeyDialog(apiKeyProvider)}
                          disabled={disconnectingProvider !== null}
                        >
                          Use API key
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );

  if (!vaults) {
    return null;
  }

  if (vaults.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="container py-6 max-w-2xl mx-auto">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Button variant="outline" asChild>
              <Link to="/pricing">Pricing</Link>
            </Button>
            {userMenu}
          </div>
          <div className="text-center space-y-6">
            <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center">
              <GitHubLogoIcon className="h-12 w-12 text-muted-foreground" />
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-bold">Create your first project</h1>
              <p className="text-lg text-muted-foreground">
                Start with a new project or connect an existing repository to
                edit files directly in your browser.
              </p>
            </div>

            <div className="space-y-4">
              {connectionPanel}
              <div className="flex justify-center">{createControl}</div>
            </div>
          </div>
        </div>
        {apiKeyDialog}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="container py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2">
            <GitHubLogoIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            <h1 className="text-xl sm:text-2xl font-semibold">Your Vaults</h1>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            {createControl}
            <Button variant="outline" asChild>
              <Link to="/pricing">Pricing</Link>
            </Button>
            {userMenu}
          </div>
        </div>
        <div className="mb-6">{connectionPanel}</div>

        <div className="space-y-2">
          {vaults.map((vault: (typeof vaults)[0]) => {
            const isReady = vault.state === "ready";
            const remoteBranches = vault.remoteBranches.filter(
              (branch) => branch.remoteState === "active",
            );
            const defaultBranch = remoteBranches.find(
              (branch) => branch.isDefault,
            )?.name;
            const primaryBranch = defaultBranch ?? remoteBranches[0]?.name;
            const primaryBranchPath = primaryBranch
              ? encodeURIComponent(primaryBranch)
              : null;
            const defaultRoute = primaryBranchPath
              ? `/vault/${vault.repositoryFullName}/${primaryBranchPath}`
              : `/vault/${vault.repositoryFullName}`;
            const chatRoute = primaryBranch
              ? buildVaultCodespaceChatRoute({
                  repositoryFullName: vault.repositoryFullName,
                  branch: primaryBranch,
                })
              : null;
            const githubRepositoryUrl = `https://github.com/${vault.ghRepoOwner}/${vault.ghRepoName}`;
            const developerToolsOpen =
              openDeveloperToolsByVaultId[vault._id] ?? false;
            const infraActionLabel = vault.isNoterManaged
              ? getInfraActionLabel(vault.infraState)
              : null;
            return (
              <div
                key={vault._id}
                className={clsx(
                  "flex flex-col gap-3 p-4 border rounded-lg sm:flex-row sm:items-center sm:justify-between sm:gap-0",
                  !isReady && "bg-muted/30 opacity-75",
                )}
              >
                <div className="flex flex-col gap-3 flex-1 min-w-0 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-col items-start">
                      <a
                        href={githubRepositoryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex min-w-0 flex-col items-start ${linkStyle}`}
                        title={`Open ${vault.repositoryFullName} on GitHub`}
                      >
                        <span className="text-sm text-muted-foreground">
                          {vault.ghRepoOwner}/
                        </span>

                        <h3 className="font-semibold">
                          <span className="flex items-center gap-2 min-w-0">
                            {!isReady && (
                              <UpdateIcon className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                            )}
                            <span className="min-w-0 truncate">
                              {vault.ghRepoName}
                            </span>
                            {!isReady && (
                              <span className="text-xs text-muted-foreground font-normal shrink-0">
                                (setting up...)
                              </span>
                            )}
                          </span>
                        </h3>
                      </a>
                    </div>

                    {isReady && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                          Branches
                        </p>
                        <VaultBranchList
                          vaultId={vault._id}
                          repositoryFullName={vault.repositoryFullName}
                          remoteBranches={remoteBranches}
                        />
                      </div>
                    )}

                    {isReady && primaryBranch && (
                      <DaytonaSnapshotBanner
                        branch={primaryBranch}
                        commitSha={vault.commitSHA}
                        snapshotName={vault.daytonaCurrentSnapshotName}
                        snapshotStatus={vault.daytonaCurrentSnapshotStatus}
                        lastError={vault.daytonaCurrentSnapshotLastError}
                      />
                    )}

                    {isReady && (
                      <Collapsible
                        className="space-y-1.5"
                        open={developerToolsOpen}
                        onOpenChange={(isOpen: boolean) => {
                          setOpenDeveloperToolsByVaultId((prev) => ({
                            ...prev,
                            [vault._id]: isOpen,
                          }));
                        }}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto gap-1 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground [&[data-state=open]>svg]:rotate-180"
                          >
                            Developer tools
                            <ChevronDownIcon className="h-3.5 w-3.5 transition-transform" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1.5">
                          <CodespaceStatus
                            vaultId={vault._id}
                            repositoryFullName={vault.repositoryFullName}
                          />
                          {primaryBranch && (
                            <DaytonaWorkspaceButton
                              vaultId={vault._id}
                              branch={primaryBranch}
                              sandboxId={vault.daytonaSandboxId}
                              sandboxName={vault.daytonaSandboxName}
                              commitSha={vault.commitSHA}
                              snapshotStatus={
                                vault.daytonaCurrentSnapshotStatus
                              }
                              snapshotName={vault.daytonaCurrentSnapshotName}
                              snapshotError={
                                vault.daytonaCurrentSnapshotLastError
                              }
                            />
                          )}
                          <DaytonaSnapshotList vaultId={vault._id} />
                          {vault.isNoterManaged && (
                            <div className="text-xs text-muted-foreground">
                              Infra: {formatInfraState(vault.infraState)}
                              {vault.infraProductionUrl && (
                                <a
                                  href={vault.infraProductionUrl}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className={`ml-2 font-mono break-all ${linkStyle}`}
                                >
                                  {vault.infraProductionUrl}
                                </a>
                              )}
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                </div>

                <div className="flex w-full flex-col items-end gap-2 sm:ml-2 sm:w-auto">
                  {isReady && primaryBranch && (
                    <VaultSyncStatus
                      vaultId={vault._id}
                      repositoryFullName={vault.repositoryFullName}
                      branch={primaryBranch}
                      owner={vault.ghRepoOwner}
                      repoName={vault.ghRepoName}
                      now={now}
                      commitSha={vault.commitSHA}
                      treeRefreshStartedAt={vault.treeRefreshStartedAt}
                      lastTreeRefreshAt={vault.lastTreeRefreshAt}
                      stagedFilesCount={vault.fileCount}
                      showChecks={false}
                      className="w-full justify-end sm:w-auto"
                    />
                  )}
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
                    {isReady ? (
                      <>
                        <Button asChild variant="secondary" size="sm">
                          <Link to={defaultRoute}>{primaryBranch}</Link>
                        </Button>
                        {developerToolsOpen && chatRoute && (
                          <Button asChild variant="outline" size="sm">
                            <Link to={chatRoute}>Chat</Link>
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button variant="secondary" size="sm" disabled>
                          {primaryBranch}
                        </Button>
                      </>
                    )}
                    {infraActionLabel && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void handleRetryInfrastructure(vault._id);
                        }}
                        disabled={retryingVaultId === vault._id}
                      >
                        {retryingVaultId === vault._id ? (
                          <>
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            Retrying...
                          </>
                        ) : (
                          infraActionLabel
                        )}
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove vault ${vault.repositoryFullName}`}
                      onClick={() => {
                        setVaultToDelete({
                          id: vault._id,
                          repositoryFullName: vault.repositoryFullName,
                          isNoterManaged: vault.isNoterManaged,
                          hasConvexProvision: vault.hasConvexProvision,
                          hasHostingProvision: vault.hasHostingProvision,
                          hostingProvider: vault.hostingProvider,
                        });
                        setRemoveGithubRepo(vault.isNoterManaged);
                        setRemoveCodespaces(true);
                        setRemoveConvexProvision(
                          vault.isNoterManaged && vault.hasConvexProvision,
                        );
                        setRemoveHostingProvision(
                          vault.isNoterManaged && vault.hasHostingProvision,
                        );
                        setRemoveDaytonaResources(
                          hasDaytonaResourcesForVault(vault),
                        );
                        setCommitError(null);
                        setDeleteError(null);
                        setDidAttemptCommit(false);
                      }}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <TrashIcon className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Confirmation Dialog */}
        <Dialog
          open={!!vaultToDelete}
          onOpenChange={() => {
            if (isDeleting || isCommitting) return;
            resetDeleteDialogState();
          }}
        >
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
            {vaultToDelete && (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="remove-github-repo"
                    checked={removeGithubRepo}
                    onCheckedChange={(checked) =>
                      setRemoveGithubRepo(checked === true)
                    }
                    disabled={
                      !vaultToDelete.isNoterManaged ||
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
                    {!vaultToDelete.isNoterManaged && (
                      <div className="text-xs text-muted-foreground">
                        Only available for repositories created in Noter.
                      </div>
                    )}
                  </label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="remove-codespaces"
                    checked={
                      connectedCodespacesCount === 0 ? true : removeCodespaces
                    }
                    onCheckedChange={(checked) =>
                      setRemoveCodespaces(checked === true)
                    }
                    disabled={
                      connectedCodespacesCount === 0 ||
                      isDeleting ||
                      isCommitting
                    }
                    className="mt-0.5"
                  />
                  <label
                    htmlFor="remove-codespaces"
                    className="text-sm text-muted-foreground"
                  >
                    Also remove all Codespaces
                    {connectedCodespacesCount === undefined
                      ? null
                      : ` (${connectedCodespacesCount} connected)`}
                  </label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="remove-daytona-resources"
                    checked={removeDaytonaResources}
                    onCheckedChange={(checked) =>
                      setRemoveDaytonaResources(checked === true)
                    }
                    disabled={isDeleting || isCommitting}
                    className="mt-0.5"
                  />
                  <label
                    htmlFor="remove-daytona-resources"
                    className="text-sm text-muted-foreground"
                  >
                    Also remove Daytona sandboxes and snapshots
                    {!hasDaytonaResources && (
                      <div className="text-xs text-muted-foreground">
                        We will try to remove any Daytona resources tied to this
                        vault.
                      </div>
                    )}
                  </label>
                </div>
                {vaultToDelete.hasConvexProvision && (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="remove-convex-provision"
                      checked={removeConvexProvision}
                      onCheckedChange={(checked) =>
                        setRemoveConvexProvision(checked === true)
                      }
                      disabled={
                        !vaultToDelete.isNoterManaged ||
                        isDeleting ||
                        isCommitting
                      }
                      className="mt-0.5"
                    />
                    <label
                      htmlFor="remove-convex-provision"
                      className="text-sm text-muted-foreground"
                    >
                      Also remove Convex project/deployment
                      {!vaultToDelete.isNoterManaged && (
                        <div className="text-xs text-muted-foreground">
                          Only available for infrastructure provisioned by
                          Noter.
                        </div>
                      )}
                    </label>
                  </div>
                )}
                {vaultToDelete.hasHostingProvision && (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id={removeHostingCheckboxId}
                      checked={removeHostingProvision}
                      onCheckedChange={(checked) =>
                        setRemoveHostingProvision(checked === true)
                      }
                      disabled={
                        !vaultToDelete.isNoterManaged ||
                        isDeleting ||
                        isCommitting
                      }
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={removeHostingCheckboxId}
                      className="text-sm text-muted-foreground"
                    >
                      {removeHostingLabel}
                      {!vaultToDelete.isNoterManaged && (
                        <div className="text-xs text-muted-foreground">
                          Only available for infrastructure provisioned by
                          Noter.
                        </div>
                      )}
                    </label>
                  </div>
                )}
                {deleteError && (
                  <div className="text-sm text-red-600">{deleteError}</div>
                )}
                {commitError && (
                  <div className="text-sm text-red-600">{commitError}</div>
                )}
                {didAttemptCommit && hasStagedChanges && (
                  <div className="text-sm text-muted-foreground">
                    Some local changes are still uncommitted. You can retry
                    commit or remove anyway.
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  if (isDeleting || isCommitting) return;
                  resetDeleteDialogState();
                }}
                disabled={isDeleting || isCommitting}
              >
                Cancel
              </Button>
              {vaultToDelete && hasStagedChanges && (
                <Button
                  variant="outline"
                  onClick={() => {
                    void handleCommitBeforeRemove();
                  }}
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
              )}
              <Button
                variant="destructive"
                onClick={() => {
                  void handleRemoveVault();
                }}
                disabled={isDeleting || isCommitting}
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
        {apiKeyDialog}
      </div>
    </div>
  );
}
