import { isInIframe } from "@/authClient";
import { useApiKeyConnectDialog, type ApiKeyProvider } from "@/components/ApiKeyConnectDialog";
import { Button } from "@/components/ui/button";
import { VaultDashboardCloudflareAccountDialog } from "@/components/vault-dashboard/VaultDashboardCloudflareAccountDialog";
import { type CloudflareAccountOption } from "@/components/vault-dashboard/vaultDashboardCloudflareAccountOptions";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { useNow } from "@/hooks/useNow";
import { formatRelativeTimeAgo, formatRelativeTimeUntil } from "@/lib/formatRelativeTime";
import { openGithubOAuthPopup } from "@/lib/githubOAuthFlow";
import { claimRefreshDebounce, releaseRefreshDebounce } from "@/lib/refreshDebounce";
import { isRecord } from "@samebase/dependent";
import { useLocation } from "@tanstack/react-router";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
} from "react";
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
type ProviderConnectionActionViewModel = {
  disabled?: boolean;
  href?: string;
  isPending?: boolean;
  key: string;
  label: string;
  onClick?: () => void;
  pendingLabel?: string;
  target?: "_blank";
};
type ProviderConnectionRowViewModel = {
  actions: readonly ProviderConnectionActionViewModel[];
  details?: ReactNode;
  icon: ReactNode;
  key: string;
  label: string;
  status: string;
};
type AppGithubProviderSummary = (typeof api.users.getGithubProviderSummary)["_returnType"];
type AppGithubConnectionHealth = (typeof api.users.checkGithubConnectionHealth)["_returnType"];
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

function formatGithubScopeStatus(status: "granted" | "missing" | "unknown") {
  if (status === "granted") return "Granted";
  if (status === "missing") return "Missing";
  return "Unknown";
}

function formatGithubCheckStatus(status: "ok" | "error" | "unknown") {
  if (status === "ok") return "OK";
  if (status === "error") return "Needs attention";
  return "Not checked";
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

function GitHubConnectionDetails({
  error,
  health,
  isChecking,
  now,
  summary,
}: {
  error: string | null;
  health: AppGithubConnectionHealth | null;
  isChecking: boolean;
  now: number;
  summary: AppGithubProviderSummary | undefined;
}) {
  if (summary?.connected !== true) {
    return null;
  }

  const isOAuth = summary.authMethod === "oauth";
  const grantedScopes =
    health && health.grantedScopes.length > 0 ? health.grantedScopes.join(", ") : null;
  const requiredScopeStatus = health
    ? health.requiredScopes
        .map((scope) => `${scope.scope} ${formatGithubScopeStatus(scope.status)}`)
        .join("; ")
    : summary.requiredScopes.map((scope) => `${scope.scope} Not checked`).join("; ");

  return (
    <div className="space-y-1 text-xs leading-5 text-muted-foreground">
      {isOAuth ? (
        <>
          <div>
            OAuth scopes requested: {summary.requiredScopes.map((scope) => scope.scope).join(", ")}
          </div>
          <div>Granted scopes: {grantedScopes ?? (health ? "None reported" : "Not checked")}</div>
          <div>Required access: {requiredScopeStatus}</div>
          <div>
            Need more org access? Reauthorize revokes the current GitHub grant before opening OAuth
            again; closing the OAuth window leaves GitHub disconnected until you reconnect.
          </div>
        </>
      ) : (
        <>
          <div>Repository access is checked with live GitHub requests.</div>
          {grantedScopes ? <div>Reported token scopes: {grantedScopes}</div> : null}
        </>
      )}
      {health ? (
        <>
          {health.checks.map((check) => (
            <div key={check.key}>
              {check.label}: {formatGithubCheckStatus(check.status)}
              {check.message ? ` - ${check.message}` : ""}
            </div>
          ))}
          <div>Last checked {formatRelativeTimeAgo(health.checkedAt, now)}.</div>
        </>
      ) : (
        <div>{isChecking ? "Checking GitHub access..." : "Live checks not run yet."}</div>
      )}
      {error ? <div>Error: {error}</div> : null}
    </div>
  );
}

function GitHubDisconnectedDetails({ notice }: { notice: string }) {
  return <div className="space-y-1 text-xs leading-5 text-muted-foreground">{notice}</div>;
}

function ProviderConnectionRows({
  providerRows,
}: {
  providerRows: readonly ProviderConnectionRowViewModel[];
}) {
  return (
    <div data-testid="provider-connections-panel" className="space-y-5">
      {providerRows.map((providerRow) => (
        <div
          key={providerRow.key}
          data-provider-key={providerRow.key}
          data-testid="provider-connection-row"
          className="flex flex-wrap items-start gap-3 border-b border-border/50 pb-5 last:border-b-0"
        >
          <div className="flex h-5 w-5 shrink-0 items-center justify-center">
            {providerRow.icon}
          </div>
          <div className="min-w-0 flex-1 basis-80">
            <div className="text-sm font-medium">{providerRow.label}</div>
            <div
              className="min-w-0 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]"
              title={providerRow.status}
            >
              {providerRow.status}
            </div>
            {providerRow.details ? <div className="mt-2">{providerRow.details}</div> : null}
          </div>
          {providerRow.actions.length > 0 ? (
            <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 self-start">
              {providerRow.actions.map((action) => {
                const label = action.isPending
                  ? (action.pendingLabel ?? action.label)
                  : action.label;
                const contents = action.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    {label}
                  </>
                ) : (
                  label
                );

                return action.href && !action.disabled ? (
                  <Button
                    key={action.key}
                    variant="outline"
                    size="sm"
                    asChild
                    className="h-auto max-w-full whitespace-normal py-2 text-left"
                  >
                    <a
                      href={action.href}
                      target={action.target}
                      rel={action.target === "_blank" ? "noreferrer" : undefined}
                      onClick={action.onClick}
                    >
                      {contents}
                    </a>
                  </Button>
                ) : (
                  <Button
                    key={action.key}
                    variant="outline"
                    size="sm"
                    onClick={action.onClick}
                    className="h-auto max-w-full whitespace-normal py-2 text-left"
                    disabled={action.disabled}
                  >
                    {contents}
                  </Button>
                );
              })}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function useProviderOAuthPopupCompletionReload({
  cloudflarePopupOriginRef,
  cloudflarePopupRef,
  convexPopupOriginRef,
  convexPopupRef,
  githubPopupOriginRef,
  githubPopupRef,
  onProviderComplete,
}: {
  cloudflarePopupOriginRef: MutableRefObject<string | null>;
  cloudflarePopupRef: MutableRefObject<Window | null>;
  convexPopupOriginRef: MutableRefObject<string | null>;
  convexPopupRef: MutableRefObject<Window | null>;
  githubPopupOriginRef: MutableRefObject<string | null>;
  githubPopupRef: MutableRefObject<Window | null>;
  onProviderComplete: (provider: ProviderKey) => void;
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
        onProviderComplete(provider);
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
    onProviderComplete,
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

    const debounceKey = userId ?? "cloudflare-providers-page";
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

export function ProviderConnectionsPage() {
  const location = useLocation();
  const getGithubOAuthUrl = useMutation(api.githubOAuth.getGithubOAuthUrl);
  const reauthorizeGithubOAuth = useAction(api.githubOAuth.reauthorizeGithubOAuth);
  const getConvexOAuthUrl = useMutation(api.convexOAuth.getConvexOAuthUrl);
  const getCloudflareMcpOAuthUrl = useAction(api.cloudflareMcpOAuth.getCloudflareMcpOAuthUrl);
  const checkGithubConnectionHealth = useAction(api.users.checkGithubConnectionHealth);
  const refreshCloudflareMcpTokenIfNeeded = useAction(api.users.refreshCloudflareMcpTokenIfNeeded);
  const listCloudflareAccounts = useAction(api.vault.cloudflare.listAccounts);
  const selectCloudflareDefaultAccount = useAction(api.vault.cloudflare.selectDefaultAccount);
  const connectGithubWithApiKey = useAction(api.users.connectGithubWithApiKey);
  const connectConvexWithApiKey = useAction(api.users.connectConvexWithApiKey);
  const disconnectGithub = useMutation(api.users.disconnectGithub);
  const disconnectConvex = useMutation(api.users.disconnectConvex);
  const disconnectCloudflare = useMutation(api.users.disconnectCloudflare);
  const githubProviderSummary = useConvexQuery(api.users.getGithubProviderSummary);
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus);
  const cloudflareConnection = useConvexQuery(api.users.getCloudflareConnectionStatus);
  const user = useConvexQuery(api.users.viewer);
  const githubPopupRef = useRef<Window | null>(null);
  const convexPopupRef = useRef<Window | null>(null);
  const cloudflarePopupRef = useRef<Window | null>(null);
  const githubPopupOriginRef = useRef<string | null>(null);
  const convexPopupOriginRef = useRef<string | null>(null);
  const cloudflarePopupOriginRef = useRef<string | null>(null);
  const cloudflareAccountDialogRequestIdRef = useRef(0);
  const githubReauthorizePopupCloseTimerRef = useRef<number | null>(null);
  const [cloudflarePollingPaused, setCloudflarePollingPaused] = useState(
    () => typeof document !== "undefined" && document.visibilityState !== "visible",
  );
  const [disconnectingProvider, setDisconnectingProvider] = useState<ProviderKey | null>(null);
  const [githubHealth, setGithubHealth] = useState<AppGithubConnectionHealth | null>(null);
  const [githubHealthError, setGithubHealthError] = useState<string | null>(null);
  const [githubDisconnectedNotice, setGithubDisconnectedNotice] = useState<string | null>(null);
  const [isCheckingGithubAccess, setIsCheckingGithubAccess] = useState(false);
  const [isReauthorizingGithub, setIsReauthorizingGithub] = useState(false);
  const [isAutoCheckingCloudflareToken, setIsAutoCheckingCloudflareToken] = useState(false);
  const [isCheckingCloudflareToken, setIsCheckingCloudflareToken] = useState(false);
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
  const githubConnected = githubProviderSummary?.connected === true;
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
        ? `Connected as ${githubProviderSummary.username ?? "GitHub user"} (${formatAuthMethod(githubProviderSummary.authMethod)})`
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
  const { openApiKeyDialog, apiKeyDialog } = useApiKeyConnectDialog({
    connectConvexWithApiKey,
    connectGithubWithApiKey,
  });

  const clearGithubReauthorizePopupCloseTimer = useCallback(() => {
    if (githubReauthorizePopupCloseTimerRef.current === null) {
      return;
    }
    window.clearInterval(githubReauthorizePopupCloseTimerRef.current);
    githubReauthorizePopupCloseTimerRef.current = null;
  }, []);

  const handleProviderOAuthPopupCompletion = useCallback(
    (provider: ProviderKey) => {
      if (provider !== "github") {
        return;
      }
      clearGithubReauthorizePopupCloseTimer();
      setGithubDisconnectedNotice(null);
      setIsReauthorizingGithub(false);
    },
    [clearGithubReauthorizePopupCloseTimer],
  );

  useProviderOAuthPopupCompletionReload({
    cloudflarePopupOriginRef,
    cloudflarePopupRef,
    convexPopupOriginRef,
    convexPopupRef,
    githubPopupOriginRef,
    githubPopupRef,
    onProviderComplete: handleProviderOAuthPopupCompletion,
  });
  useCloudflareMcpTokenAutoCheck({
    cloudflareConnection,
    refreshCloudflareMcpTokenIfNeeded,
    setCloudflarePollingPaused,
    setIsAutoCheckingCloudflareToken,
    userId: user?._id,
  });

  useEffect(() => {
    return () => {
      clearGithubReauthorizePopupCloseTimer();
    };
  }, [clearGithubReauthorizePopupCloseTimer]);

  const watchGithubReauthorizePopupClose = (popup: Window) => {
    clearGithubReauthorizePopupCloseTimer();
    githubReauthorizePopupCloseTimerRef.current = window.setInterval(() => {
      if (!popup.closed) {
        return;
      }
      clearGithubReauthorizePopupCloseTimer();
      githubPopupRef.current = null;
      githubPopupOriginRef.current = null;
      setGithubHealth(null);
      setGithubHealthError(null);
      setGithubDisconnectedNotice("GitHub was disconnected. Finish reauthorizing to reconnect.");
      setIsReauthorizingGithub(false);
    }, 500);
  };

  const runGithubHealthCheck = useCallback(async () => {
    if (isCheckingGithubAccess) {
      return;
    }

    setGithubHealthError(null);
    setIsCheckingGithubAccess(true);
    try {
      setGithubHealth(await checkGithubConnectionHealth({}));
    } catch (error) {
      setGithubHealthError(
        error instanceof Error ? error.message : "Could not check GitHub access.",
      );
    } finally {
      setIsCheckingGithubAccess(false);
    }
  }, [checkGithubConnectionHealth, isCheckingGithubAccess]);

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
    if (provider === "github") {
      setGithubDisconnectedNotice(null);
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

  const handleReauthorizeGithub = async () => {
    if (isReauthorizingGithub) {
      return;
    }

    setGithubHealthError(null);
    setGithubDisconnectedNotice(null);
    setIsReauthorizingGithub(true);
    try {
      const oauthUrl = await reauthorizeGithubOAuth({
        returnToPath: location.href,
      });
      if (isInIframe()) {
        githubPopupOriginRef.current = getRedirectOrigin(oauthUrl) ?? window.location.origin;
        githubPopupRef.current = openGithubOAuthPopup(oauthUrl);
        if (githubPopupRef.current) {
          watchGithubReauthorizePopupClose(githubPopupRef.current);
          return;
        }
      }
      window.location.assign(oauthUrl);
    } catch (error) {
      setGithubHealthError(
        error instanceof Error ? error.message : "Could not reauthorize GitHub.",
      );
      setIsReauthorizingGithub(false);
    }
  };

  const handleDisconnect = async (provider: ProviderKey) => {
    const providerConfig = providerRuntimeConfig[provider];
    const providerMetadata = PROVIDER_METADATA[provider];
    if (disconnectingProvider) return;
    setDisconnectingProvider(provider);
    try {
      await providerConfig.disconnect();
      if (provider === "github") {
        clearGithubReauthorizePopupCloseTimer();
        setGithubHealth(null);
        setGithubHealthError(null);
        setGithubDisconnectedNotice(null);
        setIsCheckingGithubAccess(false);
        setIsReauthorizingGithub(false);
      }
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

  const providerRows = PROVIDER_KEYS.map((provider) => {
    const providerMetadata = PROVIDER_METADATA[provider];
    const providerState = providerConnectionState[provider];
    const apiKeyProvider = providerMetadata.apiKeyProvider;
    const githubActionsDisabled =
      disconnectingProvider !== null || isCheckingGithubAccess || isReauthorizingGithub;
    const actions = providerState.connected
      ? [
          ...(provider === "github"
            ? [
                {
                  disabled: githubActionsDisabled,
                  isPending: isCheckingGithubAccess,
                  key: "check-github-access",
                  label: "Check access",
                  onClick: () => {
                    void runGithubHealthCheck();
                  },
                  pendingLabel: "Checking...",
                },
              ]
            : []),
          ...(provider === "github" && githubProviderSummary?.manageUrl
            ? [
                {
                  disabled: githubActionsDisabled,
                  href: githubProviderSummary.manageUrl,
                  key: "manage-github-access",
                  label: "Manage access",
                  target: "_blank" as const,
                },
              ]
            : []),
          ...(provider === "github" && githubProviderSummary?.reauthorizeAvailable
            ? [
                {
                  disabled: githubActionsDisabled,
                  isPending: isReauthorizingGithub,
                  key: "reauthorize-github",
                  label: "Reauthorize",
                  onClick: () => {
                    void handleReauthorizeGithub();
                  },
                  pendingLabel: "Reauthorizing...",
                },
              ]
            : []),
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
              (provider === "github" && (isCheckingGithubAccess || isReauthorizingGithub)) ||
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
            disabled:
              disconnectingProvider !== null || (provider === "github" && isReauthorizingGithub),
            key: "oauth",
            label: providerMetadata.oauthButtonLabel,
            onClick: () => {
              void handleConnect(provider);
            },
          },
          ...(apiKeyProvider
            ? [
                {
                  disabled:
                    disconnectingProvider !== null ||
                    (provider === "github" && isReauthorizingGithub),
                  key: "api-key",
                  label: "Use API key",
                  onClick: () => openApiKeyDialog(apiKeyProvider),
                },
              ]
            : []),
        ];

    return {
      actions,
      details:
        provider === "github" ? (
          githubProviderSummary?.connected === true ? (
            <GitHubConnectionDetails
              error={githubHealthError}
              health={githubHealth}
              isChecking={isCheckingGithubAccess}
              now={now}
              summary={githubProviderSummary}
            />
          ) : githubDisconnectedNotice ? (
            <GitHubDisconnectedDetails notice={githubDisconnectedNotice} />
          ) : undefined
        ) : undefined,
      icon: providerMetadata.icon,
      key: provider,
      label: providerMetadata.label,
      status: providerState.status,
    } satisfies ProviderConnectionRowViewModel;
  });

  return (
    <div
      data-testid="provider-connections-page"
      className="container flex min-h-0 flex-1 flex-col py-6"
    >
      <div className="mb-6 flex-shrink-0">
        <h1 className="text-xl font-semibold sm:text-2xl">Providers</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl">
          <ProviderConnectionRows providerRows={providerRows} />
        </div>
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
    </div>
  );
}
