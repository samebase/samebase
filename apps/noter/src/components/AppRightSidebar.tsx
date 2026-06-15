import { isInIframe, useNoterAuthActions } from "@/authClient";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import {
  PublicLandingAccountLoadingSection,
  PublicLandingAccountSection,
} from "@/components/PublicLandingAccountSection";
import { PublicLandingPasswordAuthControls } from "@/components/PublicLandingAuthControls";
import { useApiKeyConnectDialog, type ApiKeyProvider } from "@/components/ApiKeyConnectDialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import {
  VaultDashboardAccountSection,
  VaultDashboardProvidersSection,
  VaultDashboardSidebarContent,
  type VaultDashboardProviderRowViewModel,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import { VaultDashboardCloudflareAccountDialog } from "@/components/vault-dashboard/VaultDashboardCloudflareAccountDialog";
import { type CloudflareAccountOption } from "@/components/vault-dashboard/vaultDashboardCloudflareAccountOptions";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { useNow } from "@/hooks/useNow";
import { CONNECT_REPO_ROUTE } from "@/lib/connectRepoRoute";
import { useAppAuthPresentation } from "@/lib/appAuthPresentationState";
import { formatAuthProviderLabel } from "@/lib/authProviderLabel";
import { formatRelativeTimeAgo, formatRelativeTimeUntil } from "@/lib/formatRelativeTime";
import { openGithubOAuthPopup } from "@/lib/githubOAuthFlow";
import { NEW_APP_ROUTE } from "@/lib/newAppRoute";
import { claimRefreshDebounce, releaseRefreshDebounce } from "@/lib/refreshDebounce";
import { isRecord } from "@noter-md/dependent";
import { Link, useLocation } from "@tanstack/react-router";
import { clsx } from "clsx";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";
import { useEffect, useRef, useState, type MutableRefObject, type ReactElement } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS,
  CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS,
} from "../../shared/cloudflareTokenRefresh";

const PROVIDER_KEYS = ["github", "convex", "cloudflare"] as const;

type ProviderKey = (typeof PROVIDER_KEYS)[number];
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
type AppCloudflareConnection = (typeof api.users.getCloudflareConnectionStatus)["_returnType"];
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

const formatMcpTokenStatusLabel = (
  status: "valid" | "expiring_soon" | "expired" | "invalid" | "unknown" | undefined,
): string => {
  if (status === "valid") return "Valid";
  if (status === "expiring_soon") return "Expiring soon";
  if (status === "expired") return "Expired";
  if (status === "invalid") return "Invalid";
  return "Unknown";
};

function formatAuthMethod(method: "oauth" | "mcp_oauth" | "api_key" | "device_auth" | undefined) {
  if (method === "api_key") return "API key";
  if (method === "device_auth") return "Device auth";
  if (method === "oauth") return "OAuth";
  if (method === "mcp_oauth") return "OAuth";
  return "Unknown";
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

function useCloudflareMcpTokenAutoCheck({
  cloudflareConnection,
  refreshCloudflareMcpTokenIfNeeded,
  setCloudflarePollingPaused,
  setIsAutoCheckingCloudflareToken,
  userId,
}: {
  cloudflareConnection: AppCloudflareConnection | undefined;
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
      cloudflareConnection?.connected === true && cloudflareConnection.authMethod === "mcp_oauth";
    if (!isCloudflareMcpConnected) {
      setCloudflarePollingPaused(false);
      return;
    }

    const debounceKey = userId ?? "cloudflare-app-sidebar";
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

function PublicAppRightSidebarContent() {
  return (
    <VaultDashboardSidebarContent>
      <PublicLandingAccountSection />
      <PublicLandingPasswordAuthControls />
      <div className="mt-auto">
        <AppSidebarMetaSection linkAlignment="left" />
      </div>
    </VaultDashboardSidebarContent>
  );
}

function TemporaryAuthenticatedAppRightSidebarContent() {
  const { signOut } = useNoterAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const handleSignOut = () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    void signOut()
      .catch((error: unknown) => {
        toast({
          description: error instanceof Error ? error.message : "Please try again.",
          title: "Could not sign out",
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsSigningOut(false);
      });
  };

  return (
    <VaultDashboardSidebarContent>
      <VaultDashboardAccountSection
        displayName="Account"
        email="Signed in"
        isSignOutPending={isSigningOut}
        onOpenChange={() => {}}
        onSignOut={handleSignOut}
        open={false}
        providerLabel={null}
        signOutDisabled={false}
      />
      <div className="mt-auto">
        <AppSidebarMetaSection linkAlignment="left" />
      </div>
    </VaultDashboardSidebarContent>
  );
}

function AuthenticatedAppRightSidebarContent() {
  const location = useLocation();
  const getGithubOAuthUrl = useMutation(api.githubOAuth.getGithubOAuthUrl);
  const getConvexOAuthUrl = useMutation(api.convexOAuth.getConvexOAuthUrl);
  const getCloudflareMcpOAuthUrl = useAction(api.cloudflareMcpOAuth.getCloudflareMcpOAuthUrl);
  const refreshCloudflareMcpTokenIfNeeded = useAction(api.users.refreshCloudflareMcpTokenIfNeeded);
  const listCloudflareAccounts = useAction(api.vault.cloudflare.listAccounts);
  const selectCloudflareDefaultAccount = useAction(api.vault.cloudflare.selectDefaultAccount);
  const connectGithubWithApiKey = useAction(api.users.connectGithubWithApiKey);
  const connectConvexWithApiKey = useAction(api.users.connectConvexWithApiKey);
  const disconnectGithub = useMutation(api.users.disconnectGithub);
  const disconnectConvex = useMutation(api.users.disconnectConvex);
  const disconnectCloudflare = useMutation(api.users.disconnectCloudflare);
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
  const setProvidersPanelOpen = useMutation(
    api.dashboardSettings.setProvidersPanelOpen,
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
        providersPanelOpen: args.isOpen,
      },
    );
  });
  const githubConnection = useConvexQuery(api.users.getGithubConnectionStatus);
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus);
  const cloudflareConnection = useConvexQuery(api.users.getCloudflareConnectionStatus);
  const user = useConvexQuery(api.users.viewer);
  const authProviders = useConvexQuery(api.users.getViewerAuthProviders);
  const dashboardSettings = useConvexQuery(api.dashboardSettings.getDashboardSettings);
  const { signOut } = useNoterAuthActions();
  const githubPopupRef = useRef<Window | null>(null);
  const convexPopupRef = useRef<Window | null>(null);
  const cloudflarePopupRef = useRef<Window | null>(null);
  const githubPopupOriginRef = useRef<string | null>(null);
  const convexPopupOriginRef = useRef<string | null>(null);
  const cloudflarePopupOriginRef = useRef<string | null>(null);
  const cloudflareAccountDialogRequestIdRef = useRef(0);
  const [cloudflarePollingPaused, setCloudflarePollingPaused] = useState(
    () => typeof document !== "undefined" && document.visibilityState !== "visible",
  );
  const [disconnectingProvider, setDisconnectingProvider] = useState<ProviderKey | null>(null);
  const [isAutoCheckingCloudflareToken, setIsAutoCheckingCloudflareToken] = useState(false);
  const [isCheckingCloudflareToken, setIsCheckingCloudflareToken] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [cloudflareAccountDialog, setCloudflareAccountDialog] = useState<{
    error: string | null;
    isLoadingAccounts: boolean;
    isOpen: boolean;
    isSubmitting: boolean;
    options: CloudflareAccountOption[];
    selectedAccountId: string;
  }>({
    error: null,
    isLoadingAccounts: false,
    isOpen: false,
    isSubmitting: false,
    options: [],
    selectedAccountId: "",
  });
  const providerRuntimeConfig: Record<ProviderKey, ProviderRuntimeConfig> = {
    github: {
      disconnect: disconnectGithub,
      getOAuthUrl: () => getGithubOAuthUrl({}),
      popupOriginRef: githubPopupOriginRef,
      popupRef: githubPopupRef,
    },
    convex: {
      disconnect: disconnectConvex,
      getOAuthUrl: getConvexOAuthUrl,
      popupOriginRef: convexPopupOriginRef,
      popupRef: convexPopupRef,
    },
    cloudflare: {
      disconnect: disconnectCloudflare,
      getOAuthUrl: getCloudflareMcpOAuthUrl,
      popupOriginRef: cloudflarePopupOriginRef,
      popupRef: cloudflarePopupRef,
    },
  };
  const githubConnected = githubConnection?.connected === true;
  const convexConnected = convexConnection?.connected === true;
  const cloudflareConnected = cloudflareConnection?.connected === true;
  const cloudflareAccountSelectionRequired =
    cloudflareConnection?.connected === true && !cloudflareConnection.accountId;
  const cloudflareAuthMethod = cloudflareConnection?.authMethod;
  const cloudflareMcpTokenStatus = cloudflareConnection?.mcpTokenStatus;
  const cloudflareMcpTokenExpiresAt = cloudflareConnection?.mcpTokenExpiresAt;
  const cloudflareMcpTokenCheckedAt = cloudflareConnection?.mcpTokenCheckedAt;
  const cloudflareMcpTokenError = cloudflareConnection?.mcpTokenError;
  const cloudflareMcpTokenNextAutoCheckAt = cloudflareConnection?.mcpTokenNextAutoCheckAt;
  const now = useNow();
  const cloudflareRefreshWindowStartsAt =
    typeof cloudflareMcpTokenExpiresAt === "number"
      ? cloudflareMcpTokenExpiresAt - CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS
      : undefined;
  const cloudflareMcpTokenTimeStatus =
    cloudflareConnection?.authMethod === "mcp_oauth"
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
  const providerConnectionState: Record<
    ProviderKey,
    { connected: boolean; showTokenCheck: boolean; status: string }
  > = {
    github: {
      connected: githubConnected,
      showTokenCheck: false,
      status: githubConnected
        ? `Connected as ${githubConnection.username ?? "GitHub user"} (${formatAuthMethod(githubConnection.authMethod)})`
        : "Not connected",
    },
    convex: {
      connected: convexConnected,
      showTokenCheck: false,
      status: convexConnected
        ? `Connected to ${convexConnection.teamSlug ?? "Convex"} (${formatAuthMethod(convexConnection.authMethod)})`
        : "Not connected",
    },
    cloudflare: {
      connected: cloudflareConnected,
      showTokenCheck: cloudflareConnected && cloudflareAuthMethod === "mcp_oauth",
      status: cloudflareConnected
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
        : "Not connected",
    },
  };
  const accountEmail = user?.email ?? user?.githubUsername ?? user?.name ?? "Signed in";
  const accountDisplayName = user?.name ?? user?.email ?? user?.githubUsername ?? "Account";
  const accountProviderLabel = authProviders?.primaryProvider
    ? formatAuthProviderLabel(authProviders.primaryProvider)
    : null;
  const resolvedProvidersPanelOpen = dashboardSettings?.providersPanelOpen ?? false;
  const resolvedAccountPanelOpen = dashboardSettings?.accountPanelOpen ?? false;
  const { openApiKeyDialog, apiKeyDialog } = useApiKeyConnectDialog({
    connectConvexWithApiKey,
    connectGithubWithApiKey,
  });

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

  const loadCloudflareAccountDialogResources = async (preferredAccountId: string | undefined) => {
    const requestId = cloudflareAccountDialogRequestIdRef.current + 1;
    cloudflareAccountDialogRequestIdRef.current = requestId;
    setCloudflareAccountDialog((current) => ({
      ...current,
      error: null,
      isLoadingAccounts: true,
    }));
    try {
      const accounts = await listCloudflareAccounts({});
      if (cloudflareAccountDialogRequestIdRef.current !== requestId) {
        return;
      }
      if (accounts.length === 0) {
        setCloudflareAccountDialog((current) => ({
          ...current,
          error: "No Cloudflare accounts are available.",
          isLoadingAccounts: false,
          options: [],
          selectedAccountId: "",
        }));
        return;
      }

      const selectedAccount =
        accounts.find((account) => account.accountId === preferredAccountId) ?? accounts[0];
      setCloudflareAccountDialog((current) => ({
        ...current,
        isLoadingAccounts: false,
        options: accounts,
        selectedAccountId: selectedAccount.accountId,
      }));
    } catch (error) {
      if (cloudflareAccountDialogRequestIdRef.current !== requestId) {
        return;
      }
      setCloudflareAccountDialog((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Could not load Cloudflare accounts.",
        isLoadingAccounts: false,
      }));
    }
  };

  const handleConnect = async (provider: ProviderKey) => {
    const providerConfig = providerRuntimeConfig[provider];
    const providerMetadata = PROVIDER_METADATA[provider];
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
            : window.open(oauthUrl, providerMetadata.popupName, "width=600,height=700,popup=true");
        if (providerConfig.popupRef.current) {
          return;
        }
      }
      window.location.assign(oauthUrl);
    } catch (error) {
      console.error(`Failed to start ${providerMetadata.label} OAuth:`, error);
    }
  };

  const handleDisconnect = async (provider: ProviderKey) => {
    const providerConfig = providerRuntimeConfig[provider];
    const providerMetadata = PROVIDER_METADATA[provider];
    if (disconnectingProvider) return;
    setDisconnectingProvider(provider);
    try {
      await providerConfig.disconnect();
    } catch (error) {
      console.error(`Failed to disconnect ${providerMetadata.label}:`, error);
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const handleCheckCloudflareToken = async () => {
    if (isCheckingCloudflareToken) {
      return;
    }
    setIsCheckingCloudflareToken(true);
    try {
      await refreshCloudflareMcpTokenIfNeeded({
        force: true,
        trigger: "manual",
      });
    } catch (error) {
      console.error("Failed to check Cloudflare token:", error);
    } finally {
      setIsCheckingCloudflareToken(false);
    }
  };

  const handleCloudflareAccountDialogOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      cloudflareAccountDialogRequestIdRef.current += 1;
    }
    setCloudflareAccountDialog((current) => ({ ...current, isOpen }));
  };

  const handleSubmitCloudflareAccount = async () => {
    if (cloudflareAccountDialog.isSubmitting || !cloudflareAccountDialog.selectedAccountId) {
      return;
    }
    setCloudflareAccountDialog((current) => ({ ...current, error: null, isSubmitting: true }));
    try {
      await selectCloudflareDefaultAccount({
        accountId: cloudflareAccountDialog.selectedAccountId,
      });
      handleCloudflareAccountDialogOpenChange(false);
    } catch (error) {
      setCloudflareAccountDialog((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Could not save Cloudflare account.",
      }));
    } finally {
      setCloudflareAccountDialog((current) => ({ ...current, isSubmitting: false }));
    }
  };

  const handleSignOut = () => {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    void signOut()
      .catch((error: unknown) => {
        toast({
          description: error instanceof Error ? error.message : "Please try again.",
          title: "Could not sign out",
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsSigningOut(false);
      });
  };

  const providerRows = PROVIDER_KEYS.map((provider) => {
    const providerMetadata = PROVIDER_METADATA[provider];
    const providerState = providerConnectionState[provider];
    const apiKeyProvider = providerMetadata.apiKeyProvider;
    const actions = providerState.connected
      ? [
          ...(provider === "cloudflare"
            ? [
                {
                  disabled:
                    disconnectingProvider !== null ||
                    isCheckingCloudflareToken ||
                    isAutoCheckingCloudflareToken,
                  key: "select-account",
                  label: cloudflareAccountSelectionRequired ? "Select account" : "Manage account",
                  onClick: () => {
                    setCloudflareAccountDialog((current) => ({ ...current, isOpen: true }));
                    void loadCloudflareAccountDialogResources(cloudflareConnection?.accountId);
                  },
                },
              ]
            : []),
          ...(providerState.showTokenCheck
            ? [
                {
                  disabled:
                    disconnectingProvider !== null ||
                    isCheckingCloudflareToken ||
                    isAutoCheckingCloudflareToken,
                  isPending: isCheckingCloudflareToken,
                  key: "check-token",
                  label: "Check token",
                  onClick: () => {
                    void handleCheckCloudflareToken();
                  },
                  pendingLabel: "Checking...",
                },
              ]
            : []),
          {
            disabled:
              disconnectingProvider !== null ||
              (providerState.showTokenCheck &&
                (isCheckingCloudflareToken || isAutoCheckingCloudflareToken)),
            isPending: disconnectingProvider === provider,
            key: "disconnect",
            label: "Disconnect",
            onClick: () => {
              void handleDisconnect(provider);
            },
            pendingLabel: "Disconnecting...",
          },
        ]
      : [
          {
            disabled: disconnectingProvider !== null,
            key: "oauth",
            label: providerMetadata.oauthButtonLabel,
            onClick: () => {
              void handleConnect(provider);
            },
          },
          ...(apiKeyProvider
            ? [
                {
                  disabled: disconnectingProvider !== null,
                  key: "api-key",
                  label: "Use API key",
                  onClick: () => openApiKeyDialog(apiKeyProvider),
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
    } satisfies VaultDashboardProviderRowViewModel;
  });

  return (
    <VaultDashboardSidebarContent>
      {user ? (
        <VaultDashboardAccountSection
          displayName={accountDisplayName}
          email={accountEmail}
          isSignOutPending={isSigningOut}
          onOpenChange={(isOpen) => {
            void persistAccountPanelOpen({ isOpen }).catch((error: unknown) => {
              console.error("Failed to persist account panel state:", error);
            });
          }}
          onSignOut={handleSignOut}
          open={resolvedAccountPanelOpen}
          providerLabel={accountProviderLabel}
          signOutDisabled={false}
        />
      ) : (
        <PublicLandingAccountLoadingSection />
      )}
      <VaultDashboardProvidersSection
        onOpenChange={(isOpen) => {
          void setProvidersPanelOpen({ isOpen }).catch((error: unknown) => {
            console.error("Failed to persist providers panel state:", error);
          });
        }}
        open={resolvedProvidersPanelOpen}
        providerRows={providerRows}
      />
      <div className="vault-dashboard-sidebar-inset flex w-full flex-col items-stretch gap-2 py-3">
        <Button className="w-full" asChild>
          <Link to={NEW_APP_ROUTE}>New App</Link>
        </Button>
        {githubConnected ? (
          <Link
            className={clsx(
              buttonVariants({ variant: "outline" }),
              "h-auto min-h-8 w-full whitespace-normal py-2",
            )}
            to={CONNECT_REPO_ROUTE}
          >
            <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">
              Connect existing app
            </span>
          </Link>
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
      </div>
      <div className="mt-auto">
        <AppSidebarMetaSection linkAlignment="left" />
      </div>
      <VaultDashboardCloudflareAccountDialog
        accounts={cloudflareAccountDialog.options}
        error={cloudflareAccountDialog.error}
        isLoading={cloudflareAccountDialog.isLoadingAccounts}
        isSubmitting={cloudflareAccountDialog.isSubmitting}
        onAccountChange={(accountId) => {
          setCloudflareAccountDialog((current) => ({
            ...current,
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
    </VaultDashboardSidebarContent>
  );
}

export function AppRightSidebarContent() {
  const authPresentation = useAppAuthPresentation();

  if (authPresentation.kind === "confirmedAuthenticated") {
    return <AuthenticatedAppRightSidebarContent />;
  }

  if (authPresentation.kind === "temporaryAuthenticated") {
    return <TemporaryAuthenticatedAppRightSidebarContent />;
  }

  return <PublicAppRightSidebarContent />;
}
