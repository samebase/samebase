import { api } from "../../convex/_generated/api";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { useApiKeyConnectDialog, type ApiKeyProvider } from "@/components/ApiKeyConnectDialog";
import { AppDialogContent } from "@/components/AppDialogContent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { isInIframe } from "@/authClient";
import { useNow } from "@/hooks/useNow";
import { formatRelativeTimeAgo, formatRelativeTimeUntil } from "@/lib/formatRelativeTime";
import { openGithubOAuthPopup } from "@/lib/githubOAuthFlow";
import { claimRefreshDebounce, releaseRefreshDebounce } from "@/lib/refreshDebounce";
import {
  CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS,
  CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS,
} from "../../shared/cloudflareTokenRefresh";
import { Loader2 } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactElement,
} from "react";
import type { Id } from "../../convex/_generated/dataModel";

const PROVIDER_KEYS = ["github", "convex", "cloudflare"] as const;

type ProviderKey = (typeof PROVIDER_KEYS)[number];
type ProviderAction = {
  disabled?: boolean;
  isPending?: boolean;
  key: string;
  label: string;
  onClick: () => void;
  pendingLabel?: string;
};
type ProviderRow = {
  actions: readonly ProviderAction[];
  icon: ReactElement;
  key: ProviderKey;
  label: string;
  status: string;
};
type ProviderMetadata = {
  apiKeyProvider: ApiKeyProvider | null;
  completionEventType: string;
  icon: ReactElement;
  label: string;
  oauthButtonLabel: string;
  popupName: string;
};
type ProviderRuntimeConfig = {
  disconnect: () => Promise<unknown>;
  getOAuthUrl: () => Promise<string>;
  popupOriginRef: MutableRefObject<string | null>;
  popupRef: MutableRefObject<Window | null>;
};
type CloudflareAccountOption = {
  accountId: string;
  accountName: string;
};
type CloudflareAccountDialogState = {
  error: string | null;
  isLoadingAccounts: boolean;
  isOpen: boolean;
  isSubmitting: boolean;
  options: CloudflareAccountOption[];
  selectedAccountId: string;
};
type CloudflareConnection = (typeof api.users.getCloudflareConnectionStatus)["_returnType"];
type CloudflareTokenAutoCheckTrigger = "focus" | "visibility" | "page_load" | "poll";

const PROVIDER_METADATA: Record<ProviderKey, ProviderMetadata> = {
  github: {
    apiKeyProvider: "github",
    completionEventType: "github-oauth-complete",
    icon: <GitHubProviderLogo />,
    label: "GitHub",
    oauthButtonLabel: "GitHub OAuth",
    popupName: "github-oauth",
  },
  convex: {
    apiKeyProvider: "convex",
    completionEventType: "convex-oauth-complete",
    icon: <ConvexProviderLogo />,
    label: "Convex",
    oauthButtonLabel: "Convex OAuth",
    popupName: "convex-oauth",
  },
  cloudflare: {
    apiKeyProvider: null,
    completionEventType: "cloudflare-mcp-oauth-complete",
    icon: <CloudflareProviderLogo />,
    label: "Cloudflare",
    oauthButtonLabel: "Cloudflare OAuth",
    popupName: "cloudflare-mcp-oauth",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getRedirectOrigin(oauthUrl: string): string | null {
  try {
    const url = new URL(oauthUrl);
    const redirect = url.searchParams.get("redirect_uri");
    if (!redirect) return null;
    return new URL(redirect).origin;
  } catch {
    return null;
  }
}

function formatAuthMethod(
  method: "oauth" | "mcp_oauth" | "api_key" | "device_auth" | undefined,
): string {
  if (method === "api_key") return "API key";
  if (method === "device_auth") return "Device auth";
  if (method === "oauth") return "OAuth";
  if (method === "mcp_oauth") return "OAuth";
  return "Unknown";
}

function formatMcpTokenStatusLabel(
  status: "valid" | "expiring_soon" | "expired" | "invalid" | "unknown" | undefined,
): string {
  if (status === "valid") return "Valid";
  if (status === "expiring_soon") return "Expiring soon";
  if (status === "expired") return "Expired";
  if (status === "invalid") return "Invalid";
  return "Unknown";
}

function compareCloudflareAccountOptions(
  left: CloudflareAccountOption,
  right: CloudflareAccountOption,
) {
  return (
    left.accountName.localeCompare(right.accountName) ||
    left.accountId.localeCompare(right.accountId)
  );
}

/**
 * Popup OAuth still returns through a window message. The Providers route owns
 * connection state now, so it reloads itself after a verified popup completion.
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
        popupOriginRef: MutableRefObject<string | null>;
        popupRef: MutableRefObject<Window | null>;
      }
    > = {
      github: {
        completionEventType: PROVIDER_METADATA.github.completionEventType,
        popupOriginRef: githubPopupOriginRef,
        popupRef: githubPopupRef,
      },
      convex: {
        completionEventType: PROVIDER_METADATA.convex.completionEventType,
        popupOriginRef: convexPopupOriginRef,
        popupRef: convexPopupRef,
      },
      cloudflare: {
        completionEventType: PROVIDER_METADATA.cloudflare.completionEventType,
        popupOriginRef: cloudflarePopupOriginRef,
        popupRef: cloudflarePopupRef,
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
        if (event.origin !== (popupConfig.popupOriginRef.current ?? expectedOrigin)) {
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

/**
 * Keeps Cloudflare MCP token health fresh while the Providers route is active.
 * The backend lock still prevents duplicate refreshes across tabs.
 */
function useCloudflareMcpTokenAutoCheck({
  cloudflareConnection,
  refreshCloudflareMcpTokenIfNeeded,
  setCloudflarePollingPaused,
  setIsAutoCheckingCloudflareToken,
  userId,
}: {
  cloudflareConnection: CloudflareConnection | undefined;
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
      cloudflareConnection?.connected && cloudflareConnection.authMethod === "mcp_oauth";
    if (!isCloudflareMcpConnected) {
      setCloudflarePollingPaused(false);
      return;
    }

    const debounceKey = userId ?? "cloudflare-providers";
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

function CloudflareAccountDialog({
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
  const sortedAccounts = [...accounts].sort(compareCloudflareAccountOptions);
  const submitDisabled = isLoading || isSubmitting || !selectedAccountId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>Cloudflare Account</DialogTitle>
          <DialogDescription>
            Choose the Cloudflare account Noter should use by default for new apps.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select
            value={selectedAccountId}
            onValueChange={onAccountChange}
            disabled={isLoading || isSubmitting}
          >
            <SelectTrigger aria-label="Cloudflare account" className="w-full">
              <SelectValue placeholder={isLoading ? "Loading accounts..." : "Choose an account"} />
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

export function ProvidersPage() {
  const now = useNow();
  const user = useQuery(api.users.viewer);
  const githubConnection = useQuery(api.users.getGithubConnectionStatus);
  const convexConnection = useQuery(api.users.getConvexConnectionStatus);
  const cloudflareConnection = useQuery(api.users.getCloudflareConnectionStatus);
  const getGithubOAuthUrl = useMutation(api.githubOAuth.getGithubOAuthUrl);
  const getConvexOAuthUrl = useMutation(api.convexOAuth.getConvexOAuthUrl);
  const getCloudflareMcpOAuthUrl = useAction(api.cloudflareMcpOAuth.getCloudflareMcpOAuthUrl);
  const refreshCloudflareMcpTokenIfNeeded = useAction(api.users.refreshCloudflareMcpTokenIfNeeded);
  const connectGithubWithApiKey = useAction(api.users.connectGithubWithApiKey);
  const connectConvexWithApiKey = useAction(api.users.connectConvexWithApiKey);
  const disconnectGithub = useMutation(api.users.disconnectGithub);
  const disconnectConvex = useMutation(api.users.disconnectConvex);
  const disconnectCloudflare = useMutation(api.users.disconnectCloudflare);
  const listCloudflareAccounts = useAction(api.vault.cloudflare.listAccounts);
  const selectCloudflareDefaultAccount = useAction(api.vault.cloudflare.selectDefaultAccount);
  const githubPopupRef = useRef<Window | null>(null);
  const githubPopupOriginRef = useRef<string | null>(null);
  const convexPopupRef = useRef<Window | null>(null);
  const convexPopupOriginRef = useRef<string | null>(null);
  const cloudflarePopupRef = useRef<Window | null>(null);
  const cloudflarePopupOriginRef = useRef<string | null>(null);
  const cloudflareAccountDialogRequestIdRef = useRef(0);
  const [connectingProvider, setConnectingProvider] = useState<ProviderKey | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<ProviderKey | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [isCheckingCloudflareToken, setIsCheckingCloudflareToken] = useState(false);
  const [isAutoCheckingCloudflareToken, setIsAutoCheckingCloudflareToken] = useState(false);
  const [cloudflarePollingPaused, setCloudflarePollingPaused] = useState(
    () => typeof document !== "undefined" && document.visibilityState !== "visible",
  );
  const [cloudflareAccountDialog, setCloudflareAccountDialog] =
    useState<CloudflareAccountDialogState>({
      error: null,
      isLoadingAccounts: false,
      isOpen: false,
      isSubmitting: false,
      options: [],
      selectedAccountId: "",
    });

  const providerRuntimeConfig: Record<ProviderKey, ProviderRuntimeConfig> = {
    github: {
      getOAuthUrl: () => getGithubOAuthUrl({ returnToPath: window.location.pathname }),
      disconnect: disconnectGithub,
      popupOriginRef: githubPopupOriginRef,
      popupRef: githubPopupRef,
    },
    convex: {
      getOAuthUrl: getConvexOAuthUrl,
      disconnect: disconnectConvex,
      popupOriginRef: convexPopupOriginRef,
      popupRef: convexPopupRef,
    },
    cloudflare: {
      getOAuthUrl: getCloudflareMcpOAuthUrl,
      disconnect: disconnectCloudflare,
      popupOriginRef: cloudflarePopupOriginRef,
      popupRef: cloudflarePopupRef,
    },
  };

  useProviderOAuthPopupCompletionReload({
    cloudflarePopupOriginRef,
    cloudflarePopupRef,
    convexPopupOriginRef,
    convexPopupRef,
    githubPopupOriginRef,
    githubPopupRef,
  });

  useCloudflareMcpTokenAutoCheck({
    cloudflareConnection,
    refreshCloudflareMcpTokenIfNeeded,
    setCloudflarePollingPaused,
    setIsAutoCheckingCloudflareToken,
    userId: user?._id,
  });

  const { openApiKeyDialog, apiKeyDialog } = useApiKeyConnectDialog({
    connectGithubWithApiKey,
    connectConvexWithApiKey,
  });

  const loadCloudflareAccountDialogResources = useCallback(
    async (preferredAccountId: string | undefined) => {
      const requestId = cloudflareAccountDialogRequestIdRef.current + 1;
      cloudflareAccountDialogRequestIdRef.current = requestId;
      setCloudflareAccountDialog((state) => ({
        ...state,
        error: null,
        isLoadingAccounts: true,
      }));
      try {
        const accounts = await listCloudflareAccounts({});
        if (cloudflareAccountDialogRequestIdRef.current !== requestId) {
          return;
        }
        if (accounts.length === 0) {
          setCloudflareAccountDialog((state) => ({
            ...state,
            error: "No Cloudflare accounts are available.",
            isLoadingAccounts: false,
            options: [],
            selectedAccountId: "",
          }));
          return;
        }

        const selectedAccount =
          accounts.find((account) => account.accountId === preferredAccountId) ?? accounts[0];
        setCloudflareAccountDialog((state) => ({
          ...state,
          error: null,
          isLoadingAccounts: false,
          options: accounts,
          selectedAccountId: selectedAccount.accountId,
        }));
      } catch (error) {
        if (cloudflareAccountDialogRequestIdRef.current !== requestId) {
          return;
        }
        setCloudflareAccountDialog((state) => ({
          ...state,
          error: error instanceof Error ? error.message : "Could not load Cloudflare accounts.",
          isLoadingAccounts: false,
        }));
      }
    },
    [listCloudflareAccounts],
  );

  const handleConnect = async (provider: ProviderKey) => {
    const providerConfig = providerRuntimeConfig[provider];
    const providerMetadata = PROVIDER_METADATA[provider];
    if (connectingProvider) {
      return;
    }

    setConnectingProvider(provider);
    setProviderError(null);
    try {
      const oauthUrl = await providerConfig.getOAuthUrl();
      if (isInIframe()) {
        providerConfig.popupOriginRef.current =
          getRedirectOrigin(oauthUrl) ?? window.location.origin;
        providerConfig.popupRef.current =
          provider === "github"
            ? openGithubOAuthPopup(oauthUrl)
            : window.open(oauthUrl, providerMetadata.popupName, "width=600,height=700,popup=true");
        if (providerConfig.popupRef.current) {
          return;
        }
      }
      window.location.assign(oauthUrl);
    } catch (error) {
      setProviderError(
        error instanceof Error ? error.message : `Failed to start ${providerMetadata.label} OAuth`,
      );
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleDisconnect = async (provider: ProviderKey) => {
    const providerConfig = providerRuntimeConfig[provider];
    const providerMetadata = PROVIDER_METADATA[provider];
    if (disconnectingProvider) {
      return;
    }

    setDisconnectingProvider(provider);
    setProviderError(null);
    try {
      await providerConfig.disconnect();
    } catch (error) {
      setProviderError(
        error instanceof Error ? error.message : `Failed to disconnect ${providerMetadata.label}`,
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
    setProviderError(null);
    try {
      await refreshCloudflareMcpTokenIfNeeded({
        trigger: "manual",
        force: true,
      });
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Failed to check Cloudflare token");
    } finally {
      setIsCheckingCloudflareToken(false);
    }
  };

  const handleOpenCloudflareAccountDialog = () => {
    setCloudflareAccountDialog((state) => ({ ...state, isOpen: true }));
    void loadCloudflareAccountDialogResources(cloudflareConnection?.accountId);
  };

  const handleCloudflareAccountDialogOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      cloudflareAccountDialogRequestIdRef.current += 1;
    }
    setCloudflareAccountDialog((state) => ({ ...state, isOpen }));
  };

  const handleSubmitCloudflareAccount = async () => {
    if (cloudflareAccountDialog.isSubmitting || !cloudflareAccountDialog.selectedAccountId) {
      return;
    }
    setCloudflareAccountDialog((state) => ({
      ...state,
      error: null,
      isSubmitting: true,
    }));
    try {
      await selectCloudflareDefaultAccount({
        accountId: cloudflareAccountDialog.selectedAccountId,
      });
      setProviderError(null);
      handleCloudflareAccountDialogOpenChange(false);
    } catch (error) {
      setCloudflareAccountDialog((state) => ({
        ...state,
        error: error instanceof Error ? error.message : "Could not save Cloudflare account.",
      }));
    } finally {
      setCloudflareAccountDialog((state) => ({
        ...state,
        isSubmitting: false,
      }));
    }
  };

  const githubConnected = githubConnection?.connected === true;
  const convexConnected = convexConnection?.connected === true;
  const cloudflareConnected = cloudflareConnection?.connected === true;
  const cloudflareAccountSelectionRequired = cloudflareConnected && !cloudflareConnection.accountId;
  const cloudflareAuthMethod = cloudflareConnection?.authMethod;
  const cloudflareMcpTokenStatus = cloudflareConnection?.mcpTokenStatus;
  const cloudflareMcpTokenExpiresAt = cloudflareConnection?.mcpTokenExpiresAt;
  const cloudflareMcpTokenCheckedAt = cloudflareConnection?.mcpTokenCheckedAt;
  const cloudflareMcpTokenError = cloudflareConnection?.mcpTokenError;
  const cloudflareMcpTokenNextAutoCheckAt = cloudflareConnection?.mcpTokenNextAutoCheckAt;
  const cloudflareRefreshWindowStartsAt =
    typeof cloudflareMcpTokenExpiresAt === "number"
      ? cloudflareMcpTokenExpiresAt - CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS
      : undefined;
  const githubStatus = githubConnected
    ? `Connected as ${githubConnection.username ?? "GitHub user"} (${formatAuthMethod(githubConnection.authMethod)})`
    : "Not connected";
  const convexStatus = convexConnected
    ? `Connected to ${convexConnection.teamSlug ?? "Convex"} (${formatAuthMethod(convexConnection.authMethod)})`
    : "Not connected";
  const cloudflareMcpTokenTimeStatus =
    cloudflareAuthMethod === "mcp_oauth"
      ? cloudflareMcpTokenStatus === "valid" || cloudflareMcpTokenStatus === "expiring_soon"
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
  const cloudflareAccountStatus = cloudflareAccountSelectionRequired
    ? "Choose account."
    : cloudflareConnection?.accountName
      ? `Account ${cloudflareConnection.accountName}.`
      : "";
  const cloudflareStatus = cloudflareConnected
    ? cloudflareAuthMethod === "mcp_oauth"
      ? [
          "Connected (OAuth).",
          cloudflareAccountStatus,
          `Token ${formatMcpTokenStatusLabel(cloudflareMcpTokenStatus)}.`,
          cloudflareMcpTokenTimeStatus,
          cloudflareSchedulerStatus,
          cloudflareMcpTokenErrorStatus,
        ]
          .filter((part) => part.length > 0)
          .join(" ")
      : [`Connected (${formatAuthMethod(cloudflareAuthMethod)}).`, cloudflareAccountStatus]
          .filter((part) => part.length > 0)
          .join(" ")
    : "Not connected";

  const providerConnectionState: Record<
    ProviderKey,
    { connected: boolean; showTokenCheck: boolean; status: string }
  > = {
    github: {
      connected: githubConnected,
      showTokenCheck: false,
      status: githubStatus,
    },
    convex: {
      connected: convexConnected,
      showTokenCheck: false,
      status: convexStatus,
    },
    cloudflare: {
      connected: cloudflareConnected,
      showTokenCheck: cloudflareConnected && cloudflareAuthMethod === "mcp_oauth",
      status: cloudflareStatus,
    },
  };

  const providerRows: ProviderRow[] = PROVIDER_KEYS.map((provider) => {
    const providerMetadata = PROVIDER_METADATA[provider];
    const providerState = providerConnectionState[provider];
    const apiKeyProvider = providerMetadata.apiKeyProvider;
    const actions = providerState.connected
      ? [
          ...(provider === "cloudflare"
            ? [
                {
                  key: "select-account",
                  label: cloudflareAccountSelectionRequired ? "Select account" : "Manage account",
                  onClick: handleOpenCloudflareAccountDialog,
                  disabled:
                    disconnectingProvider !== null ||
                    isCheckingCloudflareToken ||
                    isAutoCheckingCloudflareToken,
                },
              ]
            : []),
          ...(providerState.showTokenCheck
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
              ]
            : []),
          {
            key: "disconnect",
            label: "Disconnect",
            onClick: () => {
              void handleDisconnect(provider);
            },
            disabled:
              disconnectingProvider !== null ||
              (providerState.showTokenCheck &&
                (isCheckingCloudflareToken || isAutoCheckingCloudflareToken)),
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
            disabled: disconnectingProvider !== null || connectingProvider !== null,
            isPending: connectingProvider === provider,
            pendingLabel: "Connecting...",
          },
          ...(apiKeyProvider
            ? [
                {
                  key: "api-key",
                  label: "Use API key",
                  onClick: () => openApiKeyDialog(apiKeyProvider),
                  disabled: disconnectingProvider !== null || connectingProvider !== null,
                },
              ]
            : []),
        ];

    return {
      actions,
      icon: providerMetadata.icon,
      key: provider,
      label: providerMetadata.label,
      status: providerState.status,
    };
  });

  return (
    <AppWorkspaceRouteChrome right={null}>
      <main className="min-h-full px-4 py-6 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-normal">Providers</h1>
          </div>
          {providerError ? <div className="text-sm text-red-600">{providerError}</div> : null}
          <div className="divide-y rounded-md border">
            {providerRows.map((providerRow) => (
              <section
                key={providerRow.key}
                data-provider-key={providerRow.key}
                data-testid="providers-page-provider-row"
                className="flex flex-wrap items-start gap-4 p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                  {providerRow.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-medium">{providerRow.label}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                    {providerRow.status}
                  </p>
                </div>
                <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2">
                  {providerRow.actions.map((action) => (
                    <Button
                      key={action.key}
                      variant="outline"
                      size="sm"
                      className="h-auto min-h-8 max-w-full whitespace-normal py-2 text-left"
                      onClick={action.onClick}
                      disabled={action.disabled}
                    >
                      {action.isPending ? (
                        <>
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          {action.pendingLabel ?? action.label}
                        </>
                      ) : (
                        action.label
                      )}
                    </Button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
      <CloudflareAccountDialog
        accounts={cloudflareAccountDialog.options}
        error={cloudflareAccountDialog.error}
        isLoading={cloudflareAccountDialog.isLoadingAccounts}
        isSubmitting={cloudflareAccountDialog.isSubmitting}
        onAccountChange={(accountId) => {
          setCloudflareAccountDialog((state) => ({
            ...state,
            error: null,
            selectedAccountId: accountId,
          }));
        }}
        onOpenChange={handleCloudflareAccountDialogOpenChange}
        onSubmit={() => {
          void handleSubmitCloudflareAccount();
        }}
        open={cloudflareAccountDialog.isOpen}
        selectedAccountId={cloudflareAccountDialog.selectedAccountId}
      />
      {apiKeyDialog}
    </AppWorkspaceRouteChrome>
  );
}
