import { isInIframe } from "@/authClient";
import { useApiKeyConnectDialog } from "@/components/ApiKeyConnectDialog";
import { AuthorizationErrorNotice } from "@/components/AuthorizationErrorNotice";
import type { ViewerOrganization } from "@/lib/organizationContext";
import { Button } from "@/components/ui/button";
import { VaultDashboardCloudflareAccountDialog } from "@/components/vault-dashboard/VaultDashboardCloudflareAccountDialog";
import { type CloudflareAccountOption } from "@/components/vault-dashboard/vaultDashboardCloudflareAccountOptions";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNow } from "@/hooks/useNow";
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { readAuthorizationCompletionReturnTo } from "@/lib/authorizationCompletionMessage";
import { getCurrentRootRelativeUrl } from "@/lib/currentRootRelativeUrl";
import { claimRefreshDebounce, releaseRefreshDebounce } from "@/lib/refreshDebounce";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";
import { ExternalLink, Loader2, MoreHorizontal } from "lucide-react";
import {
  Fragment,
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
import { CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS } from "../../shared/cloudflareTokenRefresh";
import type { AuthorizationError } from "../../shared/authorizationError";
import { formatAuthorizationErrorMessage } from "@/lib/authorizationErrorMessage";

const PROVIDER_KEYS = ["convex", "cloudflare"] as const;
const PROVIDER_ACCESS_STALE_TIME_MS = 60 * 1000;

type ProviderKey = (typeof PROVIDER_KEYS)[number];
type ProviderMetadata = {
  completionEventTypes: readonly string[];
  icon: ReactElement;
  label: string;
  oauthButtonLabel: string;
  popupName: string;
};
type ProviderRuntimeConfig = {
  disconnect: () => Promise<ProviderDisconnectResult>;
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
  variant?: "destructive";
};
type ProviderConnectionRowViewModel = {
  actions: readonly ProviderConnectionActionViewModel[];
  details?: ReactNode;
  icon: ReactNode;
  key: string;
  label: string;
  menuActions?: readonly ProviderConnectionActionViewModel[];
  status: ReactNode;
};
type AppConvexConnection = (typeof api.users.getConvexConnectionStatus)["_returnType"];
type AppConvexConnectionAccess =
  (typeof api.convexProviderAccess.checkConvexConnectionAccess)["_returnType"];
type AppCloudflareConnection = (typeof api.users.getCloudflareConnectionStatus)["_returnType"];
type AppCloudflareConnectionAccess =
  (typeof api.cloudflareProviderAccess.checkCloudflareConnectionAccess)["_returnType"];
type ProviderDisconnectResult = (typeof api.users.disconnectConvex)["_returnType"];
type CloudflareTokenAutoCheckTrigger = "focus" | "visibility" | "poll";
type CloudflareAccountDialogState = {
  error: string | null;
  isLoadingAccounts: boolean;
  isOpen: boolean;
  isSubmitting: boolean;
  options: CloudflareAccountOption[];
  selectedAccountId: string;
};
export type ProviderConnectionsPageConnectionState = {
  cloudflareAccess: AppCloudflareConnectionAccess | null;
  cloudflareConnection: AppCloudflareConnection | undefined;
  convexAccess: AppConvexConnectionAccess | null;
  convexConnection: AppConvexConnection | undefined;
  now: number;
};
type ProviderConnectionsPageViewProps = ProviderConnectionsPageConnectionState & {
  apiKeyDialog: ReactNode;
  authorizationErrorMessage: ReactNode;
  canRefresh: boolean;
  cloudflareAccountDialog: CloudflareAccountDialogState;
  disconnectingProvider: ProviderKey | null;
  cloudflareAccessError: boolean;
  convexAccessError: boolean;
  isAutoCheckingCloudflareToken: boolean;
  isCheckingCloudflareAccess: boolean;
  isCheckingConvexAccess: boolean;
  isRefreshing: boolean;
  organization: ViewerOrganization;
  onCloudflareAccountChange: (accountId: string) => void;
  onCloudflareAccountOpenChange: (isOpen: boolean) => void;
  onCloudflareAccountSubmit: () => void;
  onConnect: (provider: ProviderKey) => void;
  onDisconnect: (provider: ProviderKey) => void;
  onOpenApiKeyDialog: () => void;
  onOpenCloudflareAccountDialog: (accountId: string | undefined) => void;
  onRefresh: () => void;
  providerDisconnectNotice: string | null;
};

const PROVIDER_METADATA: Record<ProviderKey, ProviderMetadata> = {
  convex: {
    completionEventTypes: ["convex-oauth-complete"],
    icon: <ConvexProviderLogo />,
    label: "Convex",
    oauthButtonLabel: "Convex OAuth",
    popupName: "convex-oauth",
  },
  cloudflare: {
    completionEventTypes: ["cloudflare-oauth-complete", "cloudflare-mcp-oauth-complete"],
    icon: <CloudflareProviderLogo />,
    label: "Cloudflare",
    oauthButtonLabel: "Cloudflare OAuth",
    popupName: "cloudflare-oauth",
  },
};

function formatAuthMethod(method: "oauth" | "mcp_oauth" | "api_key" | undefined) {
  if (method === "api_key") return "API key";
  if (method === "oauth") return "OAuth";
  if (method === "mcp_oauth") return "OAuth";
  return "Unknown";
}

function getCloudflareManageAccessUrl(authMethod: "oauth" | "mcp_oauth" | "api_key" | undefined) {
  if (authMethod === "api_key") {
    return "https://dash.cloudflare.com/profile/api-tokens";
  }
  return "https://dash.cloudflare.com/?to=%2Fprofile%2Faccess-management%2Fauthorization";
}

function getConvexManageAccessUrl(teamSlug: string | undefined, authMethod: "oauth" | "api_key") {
  const normalizedTeamSlug = teamSlug?.trim();
  if (!normalizedTeamSlug) {
    return undefined;
  }
  const settingsPath = authMethod === "oauth" ? "applications" : "access-tokens";
  return `https://dashboard.convex.dev/t/${encodeURIComponent(normalizedTeamSlug)}/settings/${settingsPath}`;
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

function getConvexTeamUrl(teamSlug: string | undefined) {
  const normalizedTeamSlug = teamSlug?.trim();
  return normalizedTeamSlug
    ? `https://dashboard.convex.dev/t/${encodeURIComponent(normalizedTeamSlug)}`
    : undefined;
}

function getCloudflareAccountUrl(accountId: string) {
  const normalizedAccountId = accountId.trim();
  return normalizedAccountId
    ? `https://dash.cloudflare.com/${encodeURIComponent(normalizedAccountId)}`
    : undefined;
}

function ProviderTargetStatus({
  authMethod,
  href,
  kind,
  name,
  state,
}: {
  authMethod: "oauth" | "mcp_oauth" | "api_key" | undefined;
  href?: string;
  kind: "Team" | "Account";
  name: string;
  state?: "Disconnected";
}) {
  const accessibleName =
    kind === "Team"
      ? `Open Convex team ${name} in a new tab`
      : `Open Cloudflare account ${name} in a new tab`;
  const target = href ? (
    <a
      aria-label={accessibleName}
      className="inline-flex max-w-full items-start gap-1 font-semibold text-foreground underline underline-offset-4"
      href={href}
      rel="noreferrer noopener"
      target="_blank"
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
      <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
    </a>
  ) : (
    <span className="font-semibold text-foreground">{name}</span>
  );

  return (
    <div className="min-w-0">
      <div className="min-w-0 text-base leading-5">{target}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {kind} · {state ?? formatAuthMethod(authMethod)}
      </div>
    </div>
  );
}

function ProviderHealthSummary({
  access,
  isChecking,
  now,
}: {
  access:
    | Pick<AppConvexConnectionAccess, "checkedAt" | "checks" | "connected">
    | Pick<AppCloudflareConnectionAccess, "checkedAt" | "checks" | "connected">
    | null;
  isChecking: boolean;
  now: number;
}) {
  if (access === null) {
    if (isChecking) {
      return <div className="text-muted-foreground">Checking access...</div>;
    }
    return <div className="text-muted-foreground">Access status unavailable.</div>;
  }

  const checkedAgo = formatRelativeTimeAgo(access.checkedAt, now);
  if (isChecking) {
    return <div className="text-muted-foreground">Refreshing · Checked {checkedAgo}</div>;
  }
  if (!access.connected || access.checks.some((check) => check.status === "error")) {
    return (
      <div className="font-medium text-foreground">Needs attention · Checked {checkedAgo}</div>
    );
  }
  if (access.checks.some((check) => check.status === "unknown")) {
    return <div className="text-muted-foreground">Partially checked · Checked {checkedAgo}</div>;
  }
  return <div className="text-emerald-700">Read checks passed · Checked {checkedAgo}</div>;
}

function getConvexRemediation(authMethod: "oauth" | "api_key"): string {
  return authMethod === "oauth"
    ? "Reauthorize Convex, then refresh."
    : "Update the Convex token, then refresh.";
}

function getCloudflareRemediation(
  key: AppCloudflareConnectionAccess["checks"][number]["key"],
): string {
  switch (key) {
    case "token":
      return "Reconnect Cloudflare.";
    case "accounts":
      return "Reconnect Cloudflare with access to this account.";
    case "workers":
      return "Reconnect Cloudflare with Workers access.";
    case "workers_builds":
      return "Reconnect Cloudflare with Workers Builds access.";
    default:
      key satisfies never;
      return "Reconnect Cloudflare, then refresh.";
  }
}

function ConvexConnectionDetails({
  access,
  authMethod,
  error,
  isChecking,
  now,
}: {
  access: AppConvexConnectionAccess | null;
  authMethod: "oauth" | "api_key";
  error: boolean;
  isChecking: boolean;
  now: number;
}) {
  const hasFailedChecks = access?.checks.some((check) => check.status === "error") ?? false;
  const disconnected = access !== null && !access.connected;

  return (
    <div className="space-y-2 text-sm leading-5">
      <div className="text-sm text-foreground">
        <span className="font-medium">Scope:</span> Projects and deployments in this team
      </div>
      <ProviderHealthSummary access={access} isChecking={isChecking} now={now} />
      {error ? (
        <AuthorizationErrorNotice>
          Could not refresh Convex access. Try again.
        </AuthorizationErrorNotice>
      ) : disconnected ? (
        <AuthorizationErrorNotice>{getConvexRemediation(authMethod)}</AuthorizationErrorNotice>
      ) : hasFailedChecks ? (
        <AuthorizationErrorNotice>{getConvexRemediation(authMethod)}</AuthorizationErrorNotice>
      ) : null}
    </div>
  );
}

function CloudflareConnectionDetails({
  access,
  error,
  isChecking,
  now,
}: {
  access: AppCloudflareConnectionAccess | null;
  error: boolean;
  isChecking: boolean;
  now: number;
}) {
  const failedChecks = access?.checks.filter((check) => check.status === "error") ?? [];
  const disconnected = access !== null && !access.connected;

  return (
    <div className="space-y-2 text-sm leading-5">
      <div className="text-sm text-foreground">
        <span className="font-medium">Scope:</span> Account details, Workers, and Workers Builds in
        this account
      </div>
      <ProviderHealthSummary access={access} isChecking={isChecking} now={now} />
      {error ? (
        <AuthorizationErrorNotice>
          Could not refresh Cloudflare access. Try again.
        </AuthorizationErrorNotice>
      ) : disconnected ? (
        <AuthorizationErrorNotice>Reconnect Cloudflare, then refresh.</AuthorizationErrorNotice>
      ) : failedChecks.length > 0 ? (
        <AuthorizationErrorNotice>
          <div className="space-y-1">
            {failedChecks.map((check) => (
              <div key={check.key}>
                <span className="font-medium">{check.label}:</span>{" "}
                {getCloudflareRemediation(check.key)}
              </div>
            ))}
          </div>
        </AuthorizationErrorNotice>
      ) : null}
    </div>
  );
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
            <div className="mt-1 min-w-0 [overflow-wrap:anywhere]">{providerRow.status}</div>
            {providerRow.details ? <div className="mt-2">{providerRow.details}</div> : null}
          </div>
          <div className="ml-auto flex min-w-0 flex-wrap items-start justify-end gap-2">
            {providerRow.actions.length > 0 ? (
              <ConnectionActions actions={providerRow.actions} />
            ) : null}
            {providerRow.menuActions && providerRow.menuActions.length > 0 ? (
              <ConnectionActionsMenu actions={providerRow.menuActions} label={providerRow.label} />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConnectionActions({ actions }: { actions: readonly ProviderConnectionActionViewModel[] }) {
  return (
    <div className="flex min-w-0 flex-wrap justify-end gap-2 self-start">
      {actions.map((action) => {
        const label = action.isPending ? (action.pendingLabel ?? action.label) : action.label;
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
              target="_blank"
              rel="noreferrer noopener"
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
  );
}

function ConnectionActionsMenu({
  actions,
  label,
}: {
  actions: readonly ProviderConnectionActionViewModel[];
  label: string;
}) {
  const destructiveActionIndex = actions.findIndex((action) => action.variant === "destructive");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild nativeButton>
        <Button
          aria-label={`${label} actions`}
          disabled={actions.every((action) => action.disabled)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-none shadow-none">
        {actions.map((action, index) => {
          const label = action.isPending ? (action.pendingLabel ?? action.label) : action.label;
          const contents = (
            <>
              {action.isPending ? <Loader2 className="animate-spin" /> : null}
              <span>{label}</span>
              {action.href ? <ExternalLink className="ml-auto" /> : null}
            </>
          );
          const item = action.href ? (
            <DropdownMenuItem asChild disabled={action.disabled} variant={action.variant}>
              <a href={action.href} rel="noreferrer noopener" target="_blank">
                {contents}
              </a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={action.disabled}
              onSelect={action.onClick}
              variant={action.variant}
            >
              {contents}
            </DropdownMenuItem>
          );

          return (
            <Fragment key={action.key}>
              {index === destructiveActionIndex && index > 0 ? <DropdownMenuSeparator /> : null}
              {item}
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProviderConnectionsPageView({
  apiKeyDialog,
  authorizationErrorMessage,
  canRefresh,
  cloudflareAccess,
  cloudflareAccessError,
  cloudflareAccountDialog,
  cloudflareConnection,
  convexAccess,
  convexAccessError,
  convexConnection,
  disconnectingProvider,
  isAutoCheckingCloudflareToken,
  isCheckingCloudflareAccess,
  isCheckingConvexAccess,
  isRefreshing,
  now,
  organization,
  onCloudflareAccountChange,
  onCloudflareAccountOpenChange,
  onCloudflareAccountSubmit,
  onConnect,
  onDisconnect,
  onOpenApiKeyDialog,
  onOpenCloudflareAccountDialog,
  onRefresh,
  providerDisconnectNotice,
}: ProviderConnectionsPageViewProps) {
  const canManageOrganization = organization.role === "owner";
  const convexConnectActions: ProviderConnectionActionViewModel[] = canManageOrganization
    ? [
        {
          disabled: disconnectingProvider !== null,
          key: "oauth",
          label: PROVIDER_METADATA.convex.oauthButtonLabel,
          onClick: () => onConnect("convex"),
        },
        {
          disabled: disconnectingProvider !== null,
          key: "api-key",
          label: "Use API key",
          onClick: onOpenApiKeyDialog,
        },
      ]
    : [];
  let convexProviderRow: ProviderConnectionRowViewModel = {
    actions: [],
    icon: PROVIDER_METADATA.convex.icon,
    key: "convex",
    label: PROVIDER_METADATA.convex.label,
    status: "Loading...",
  };
  if (convexConnection?.state === "not_configured") {
    convexProviderRow = {
      ...convexProviderRow,
      actions: convexConnectActions,
      status: "No team configured.",
    };
  } else if (convexConnection?.state === "disconnected") {
    convexProviderRow = {
      ...convexProviderRow,
      actions: convexConnectActions,
      status: (
        <ProviderTargetStatus
          authMethod={undefined}
          href={getConvexTeamUrl(convexConnection.teamSlug)}
          kind="Team"
          name={convexConnection.teamSlug ?? convexConnection.teamId}
          state="Disconnected"
        />
      ),
    };
  } else if (convexConnection?.state === "connected") {
    const convexActionsDisabled = disconnectingProvider !== null || isCheckingConvexAccess;
    const convexManageAccessUrl = getConvexManageAccessUrl(
      convexConnection.teamSlug,
      convexConnection.authMethod,
    );
    const menuActions: ProviderConnectionActionViewModel[] = [
      ...(convexManageAccessUrl
        ? [
            {
              disabled: convexActionsDisabled,
              href: convexManageAccessUrl,
              key: "manage-convex-access",
              label: "Manage authorization",
            },
          ]
        : []),
      convexConnection.authMethod === "oauth"
        ? {
            disabled: convexActionsDisabled,
            key: "reauthorize-convex",
            label: "Reauthorize",
            onClick: () => onConnect("convex"),
          }
        : {
            disabled: convexActionsDisabled,
            key: "update-convex-token",
            label: "Update token",
            onClick: onOpenApiKeyDialog,
          },
      {
        disabled: convexActionsDisabled,
        isPending: disconnectingProvider === "convex",
        key: "disconnect",
        label: "Disconnect",
        onClick: () => onDisconnect("convex"),
        pendingLabel: "Disconnecting...",
        variant: "destructive",
      },
    ];
    convexProviderRow = {
      actions: [],
      details: (
        <ConvexConnectionDetails
          access={convexAccess}
          authMethod={convexConnection.authMethod}
          error={convexAccessError}
          isChecking={isCheckingConvexAccess}
          now={now}
        />
      ),
      icon: PROVIDER_METADATA.convex.icon,
      key: "convex",
      label: PROVIDER_METADATA.convex.label,
      menuActions: canManageOrganization ? menuActions : [],
      status: (
        <ProviderTargetStatus
          authMethod={convexConnection.authMethod}
          href={getConvexTeamUrl(convexConnection.teamSlug)}
          kind="Team"
          name={convexConnection.teamSlug ?? convexConnection.teamId}
        />
      ),
    };
  }

  let cloudflareProviderRow: ProviderConnectionRowViewModel;
  if (cloudflareConnection?.state === "connected") {
    const cloudflareActionsDisabled =
      disconnectingProvider !== null || isAutoCheckingCloudflareToken || isCheckingCloudflareAccess;
    const menuActions: ProviderConnectionActionViewModel[] = [
      {
        disabled: cloudflareActionsDisabled,
        href: getCloudflareManageAccessUrl(cloudflareConnection.authMethod),
        key: "manage-cloudflare-access",
        label: "Manage authorization",
      },
      {
        disabled: cloudflareActionsDisabled,
        key: "reconnect-cloudflare",
        label: "Reconnect",
        onClick: () => onConnect("cloudflare"),
      },
      {
        disabled: cloudflareActionsDisabled,
        isPending: disconnectingProvider === "cloudflare",
        key: "disconnect",
        label: "Disconnect",
        onClick: () => onDisconnect("cloudflare"),
        pendingLabel: "Disconnecting...",
        variant: "destructive",
      },
    ];
    cloudflareProviderRow = {
      actions: [],
      details: (
        <CloudflareConnectionDetails
          access={cloudflareAccess}
          error={cloudflareAccessError}
          isChecking={isCheckingCloudflareAccess}
          now={now}
        />
      ),
      icon: PROVIDER_METADATA.cloudflare.icon,
      key: "cloudflare",
      label: PROVIDER_METADATA.cloudflare.label,
      menuActions: canManageOrganization ? menuActions : [],
      status: (
        <ProviderTargetStatus
          authMethod={cloudflareConnection.authMethod}
          href={getCloudflareAccountUrl(cloudflareConnection.accountId)}
          kind="Account"
          name={cloudflareConnection.accountName}
        />
      ),
    };
  } else if (cloudflareConnection?.state === "selection_required") {
    const actions: ProviderConnectionActionViewModel[] = canManageOrganization
      ? [
          {
            disabled: disconnectingProvider !== null,
            key: "select-account",
            label: "Select account",
            onClick: () => onOpenCloudflareAccountDialog(undefined),
          },
        ]
      : [];
    const menuActions: ProviderConnectionActionViewModel[] = canManageOrganization
      ? [
          {
            disabled: disconnectingProvider !== null,
            key: "reconnect-cloudflare",
            label: "Reconnect",
            onClick: () => onConnect("cloudflare"),
          },
          {
            disabled: disconnectingProvider !== null,
            isPending: disconnectingProvider === "cloudflare",
            key: "disconnect",
            label: "Disconnect",
            onClick: () => onDisconnect("cloudflare"),
            pendingLabel: "Disconnecting...",
            variant: "destructive",
          },
        ]
      : [];
    cloudflareProviderRow = {
      actions,
      icon: PROVIDER_METADATA.cloudflare.icon,
      key: "cloudflare",
      label: PROVIDER_METADATA.cloudflare.label,
      menuActions,
      status: "No Cloudflare account selected.",
    };
  } else if (cloudflareConnection?.state === "disconnected") {
    cloudflareProviderRow = {
      actions: canManageOrganization
        ? [
            {
              disabled: disconnectingProvider !== null,
              key: "oauth",
              label: "Reconnect",
              onClick: () => onConnect("cloudflare"),
            },
          ]
        : [],
      icon: PROVIDER_METADATA.cloudflare.icon,
      key: "cloudflare",
      label: PROVIDER_METADATA.cloudflare.label,
      status: (
        <ProviderTargetStatus
          authMethod={undefined}
          href={getCloudflareAccountUrl(cloudflareConnection.accountId)}
          kind="Account"
          name={cloudflareConnection.accountName}
          state="Disconnected"
        />
      ),
    };
  } else {
    cloudflareProviderRow = {
      actions:
        cloudflareConnection?.state === "not_configured" && canManageOrganization
          ? [
              {
                disabled: disconnectingProvider !== null,
                key: "oauth",
                label: PROVIDER_METADATA.cloudflare.oauthButtonLabel,
                onClick: () => onConnect("cloudflare"),
              },
            ]
          : [],
      icon: PROVIDER_METADATA.cloudflare.icon,
      key: "cloudflare",
      label: PROVIDER_METADATA.cloudflare.label,
      status: cloudflareConnection ? "No account configured." : "Loading...",
    };
  }
  const providerRows =
    convexConnection === undefined || cloudflareConnection === undefined
      ? []
      : [convexProviderRow, cloudflareProviderRow];

  return (
    <div
      data-testid="provider-connections-page"
      className="container flex min-h-0 flex-1 flex-col py-6"
    >
      <div className="mb-6 flex flex-shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold @2xl:text-2xl">Providers</h1>
        {canRefresh ? (
          <Button
            disabled={isRefreshing || isAutoCheckingCloudflareToken}
            onClick={onRefresh}
            size="sm"
            type="button"
            variant="outline"
          >
            {isRefreshing ? <Loader2 className="animate-spin" /> : null}
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        ) : null}
      </div>
      {authorizationErrorMessage ? (
        <div className="mb-4 max-w-3xl">
          <AuthorizationErrorNotice>{authorizationErrorMessage}</AuthorizationErrorNotice>
        </div>
      ) : null}
      {providerDisconnectNotice ? (
        <div className="mb-4 text-sm text-muted-foreground" role="status">
          {providerDisconnectNotice}
        </div>
      ) : null}
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
        onAccountChange={onCloudflareAccountChange}
        onOpenChange={onCloudflareAccountOpenChange}
        onSubmit={onCloudflareAccountSubmit}
        open={
          canManageOrganization &&
          cloudflareConnection?.state === "selection_required" &&
          cloudflareAccountDialog.isOpen
        }
        selectedAccountId={cloudflareAccountDialog.selectedAccountId}
      />
      {apiKeyDialog}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Focused tests exercise this message security boundary directly.
export function handleProviderOAuthPopupCompletionMessage({
  event,
  expectedOrigin,
  navigate,
  providerPopupConfig,
}: {
  event: MessageEvent;
  expectedOrigin: string;
  navigate: (returnTo: string) => void;
  providerPopupConfig: Record<
    ProviderKey,
    {
      completionEventTypes: readonly string[];
      popupOriginRef: MutableRefObject<string | null>;
      popupRef: MutableRefObject<Window | null>;
    }
  >;
}) {
  for (const provider of PROVIDER_KEYS) {
    const popupConfig = providerPopupConfig[provider];
    const popup = popupConfig.popupRef.current;
    if (popup !== null) {
      const returnTo = readAuthorizationCompletionReturnTo({
        completionEventTypes: popupConfig.completionEventTypes,
        event,
        expectedCallbackOrigin: popupConfig.popupOriginRef.current ?? expectedOrigin,
        expectedReturnOrigin: expectedOrigin,
        popup,
      });
      if (returnTo !== null) {
        navigate(returnTo);
        return;
      }
    }
  }
}

function useProviderOAuthPopupCompletionNavigation({
  cloudflarePopupOriginRef,
  cloudflarePopupRef,
  convexPopupOriginRef,
  convexPopupRef,
}: {
  cloudflarePopupOriginRef: MutableRefObject<string | null>;
  cloudflarePopupRef: MutableRefObject<Window | null>;
  convexPopupOriginRef: MutableRefObject<string | null>;
  convexPopupRef: MutableRefObject<Window | null>;
}) {
  useEffect(() => {
    const expectedOrigin = window.location.origin;
    const providerPopupConfig: Record<
      ProviderKey,
      {
        completionEventTypes: readonly string[];
        popupOriginRef: MutableRefObject<string | null>;
        popupRef: MutableRefObject<Window | null>;
      }
    > = {
      convex: {
        completionEventTypes: PROVIDER_METADATA.convex.completionEventTypes,
        popupOriginRef: convexPopupOriginRef,
        popupRef: convexPopupRef,
      },
      cloudflare: {
        completionEventTypes: PROVIDER_METADATA.cloudflare.completionEventTypes,
        popupOriginRef: cloudflarePopupOriginRef,
        popupRef: cloudflarePopupRef,
      },
    };
    const handler = (event: MessageEvent) => {
      handleProviderOAuthPopupCompletionMessage({
        event,
        expectedOrigin,
        navigate: (returnTo) => window.location.replace(returnTo),
        providerPopupConfig,
      });
    };

    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
    };
  }, [cloudflarePopupOriginRef, cloudflarePopupRef, convexPopupOriginRef, convexPopupRef]);
}

function useCloudflareMcpTokenAutoCheck({
  cloudflareConnection,
  organizationId,
  refreshCloudflareMcpTokenIfNeeded,
  setIsAutoCheckingCloudflareToken,
}: {
  cloudflareConnection: AppCloudflareConnection | undefined;
  organizationId: Id<"organizations"> | null;
  refreshCloudflareMcpTokenIfNeeded: (args: {
    force: false;
    organizationId: Id<"organizations">;
    trigger: CloudflareTokenAutoCheckTrigger;
  }) => Promise<unknown>;
  setIsAutoCheckingCloudflareToken: (isChecking: boolean) => void;
}) {
  const cloudflareAutoCheckInFlightRef = useRef(false);
  const credentialedCloudflareConnection =
    cloudflareConnection?.state === "connected" ||
    cloudflareConnection?.state === "selection_required"
      ? cloudflareConnection
      : null;

  useEffect(() => {
    if (credentialedCloudflareConnection?.authMethod !== "mcp_oauth" || organizationId === null) {
      return;
    }

    const debounceKey = organizationId;
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
      void refreshCloudflareMcpTokenIfNeeded({ organizationId, trigger, force: false })
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
      runAutoCheck("focus");
    };

    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible";
      if (isVisible) {
        runAutoCheck("visibility");
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const pollId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (
        typeof credentialedCloudflareConnection.mcpTokenNextAutoCheckAt === "number" &&
        Date.now() < credentialedCloudflareConnection.mcpTokenNextAutoCheckAt
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
    credentialedCloudflareConnection?.authMethod,
    credentialedCloudflareConnection?.mcpTokenNextAutoCheckAt,
    organizationId,
    refreshCloudflareMcpTokenIfNeeded,
    setIsAutoCheckingCloudflareToken,
  ]);
}

export function ProviderConnectionsPage({
  authorizationError = null,
  organization,
}: {
  authorizationError?: AuthorizationError | null;
  organization: ViewerOrganization;
}) {
  const getConvexOAuthUrl = useMutation(api.convexOAuth.getConvexOAuthUrl);
  const getCloudflareOAuthUrl = useAction(api.cloudflareOAuth.getCloudflareOAuthUrl);
  const checkConvexConnectionAccess = useAction(
    api.convexProviderAccess.checkConvexConnectionAccess,
  );
  const checkCloudflareConnectionAccess = useAction(
    api.cloudflareProviderAccess.checkCloudflareConnectionAccess,
  );
  const refreshCloudflareMcpTokenIfNeeded = useAction(api.users.refreshCloudflareMcpTokenIfNeeded);
  const listCloudflareAccounts = useAction(api.users.listCloudflareAccounts);
  const selectCloudflareAccount = useAction(api.users.selectCloudflareAccount);
  const connectConvexWithApiKey = useAction(api.users.connectConvexWithApiKey);
  const disconnectConvex = useAction(api.users.disconnectConvex);
  const disconnectCloudflare = useAction(api.users.disconnectCloudflare);
  const queryClient = useQueryClient();
  const organizationId = organization.organizationId;
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus, {
    organizationId,
  });
  const cloudflareConnection = useConvexQuery(api.users.getCloudflareConnectionStatus, {
    organizationId,
  });
  const connectedConvexConnection =
    convexConnection?.state === "connected" ? convexConnection : null;
  const connectedCloudflareConnection =
    cloudflareConnection?.state === "connected" ? cloudflareConnection : null;
  const convexAccessQuery = useQuery({
    queryKey: [
      "organization-provider-access",
      organizationId,
      "convex",
      connectedConvexConnection?.teamId,
      connectedConvexConnection?.authMethod,
    ],
    queryFn: async () => {
      return await checkConvexConnectionAccess({ organizationId });
    },
    enabled: connectedConvexConnection !== null,
    staleTime: PROVIDER_ACCESS_STALE_TIME_MS,
    refetchOnMount: "always",
    retry: false,
  });
  const cloudflareAccessQuery = useQuery({
    queryKey: [
      "organization-provider-access",
      organizationId,
      "cloudflare",
      connectedCloudflareConnection?.accountId,
      connectedCloudflareConnection?.authMethod,
    ],
    queryFn: async () => {
      return await checkCloudflareConnectionAccess({ organizationId });
    },
    enabled: connectedCloudflareConnection !== null,
    staleTime: PROVIDER_ACCESS_STALE_TIME_MS,
    refetchOnMount: "always",
    retry: false,
  });
  const convexPopupRef = useRef<Window | null>(null);
  const cloudflarePopupRef = useRef<Window | null>(null);
  const convexPopupOriginRef = useRef<string | null>(null);
  const cloudflarePopupOriginRef = useRef<string | null>(null);
  const cloudflareAccountDialogRequestIdRef = useRef(0);
  const [disconnectingProvider, setDisconnectingProvider] = useState<ProviderKey | null>(null);
  const [providerDisconnectNotice, setProviderDisconnectNotice] = useState<string | null>(null);
  const [isAutoCheckingCloudflareToken, setIsAutoCheckingCloudflareToken] = useState(false);
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
    convex: {
      disconnect: async () => {
        return await disconnectConvex({ organizationId });
      },
      getOAuthUrl: async () => {
        return await getConvexOAuthUrl({
          organizationId,
          returnToPath: getCurrentRootRelativeUrl(),
        });
      },
      popupOriginRef: convexPopupOriginRef,
      popupRef: convexPopupRef,
    },
    cloudflare: {
      disconnect: async () => {
        return await disconnectCloudflare({ organizationId });
      },
      getOAuthUrl: async () => {
        return await getCloudflareOAuthUrl({
          organizationId,
          returnToPath: getCurrentRootRelativeUrl(),
        });
      },
      popupOriginRef: cloudflarePopupOriginRef,
      popupRef: cloudflarePopupRef,
    },
  };
  const now = useNow();
  const connectConvexWithApiKeyAndClearAccess = useCallback(
    async (args: { token: string }) => {
      const result = await connectConvexWithApiKey({
        organizationId,
        token: args.token,
      });
      await queryClient.invalidateQueries({
        queryKey: ["organization-provider-access", organizationId, "convex"],
      });
      setProviderDisconnectNotice(null);
      return result;
    },
    [connectConvexWithApiKey, organizationId, queryClient],
  );
  const { openApiKeyDialog, apiKeyDialog } = useApiKeyConnectDialog({
    connectConvexWithApiKey: connectConvexWithApiKeyAndClearAccess,
  });
  const authorizationErrorMessage = authorizationError
    ? formatAuthorizationErrorMessage(authorizationError, {
        cloudflareAccountName:
          cloudflareConnection?.state === "connected" ||
          cloudflareConnection?.state === "disconnected"
            ? cloudflareConnection.accountName
            : undefined,
        convexTeamName:
          convexConnection?.state === "connected" || convexConnection?.state === "disconnected"
            ? convexConnection.teamSlug
            : undefined,
      })
    : null;

  useProviderOAuthPopupCompletionNavigation({
    cloudflarePopupOriginRef,
    cloudflarePopupRef,
    convexPopupOriginRef,
    convexPopupRef,
  });
  useCloudflareMcpTokenAutoCheck({
    cloudflareConnection,
    organizationId,
    refreshCloudflareMcpTokenIfNeeded,
    setIsAutoCheckingCloudflareToken,
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
      const accounts = await listCloudflareAccounts({ organizationId });
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
    setProviderDisconnectNotice(null);
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
      setProviderDisconnectNotice(
        provider === "convex"
          ? "Samebase removed its local Convex credential. Revoke the credential in Convex if you also want to remove upstream access."
          : "Samebase removed its local Cloudflare credential. Revoke the authorization in Cloudflare if you also want to remove upstream access.",
      );
    } catch (error) {
      console.error(`Failed to disconnect ${providerMetadata.label}:`, error);
    } finally {
      setDisconnectingProvider(null);
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
      await selectCloudflareAccount({
        accountId: cloudflareAccountDialog.selectedAccountId,
        organizationId,
      });
      await queryClient.invalidateQueries({
        queryKey: ["organization-provider-access", organizationId, "cloudflare"],
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

  const canRefresh = connectedConvexConnection !== null || connectedCloudflareConnection !== null;
  const isRefreshing = convexAccessQuery.isFetching || cloudflareAccessQuery.isFetching;
  const refreshAccess = () => {
    if (isRefreshing || isAutoCheckingCloudflareToken) {
      return;
    }

    const refreshes: Promise<unknown>[] = [];
    if (connectedConvexConnection !== null) {
      refreshes.push(convexAccessQuery.refetch());
    }
    if (connectedCloudflareConnection !== null) {
      refreshes.push(cloudflareAccessQuery.refetch());
    }
    void Promise.allSettled(refreshes);
  };

  return (
    <ProviderConnectionsPageView
      apiKeyDialog={apiKeyDialog}
      authorizationErrorMessage={authorizationErrorMessage}
      canRefresh={canRefresh}
      cloudflareAccess={cloudflareAccessQuery.data ?? null}
      cloudflareAccessError={cloudflareAccessQuery.isError}
      cloudflareAccountDialog={cloudflareAccountDialog}
      cloudflareConnection={cloudflareConnection}
      convexAccess={convexAccessQuery.data ?? null}
      convexAccessError={convexAccessQuery.isError}
      convexConnection={convexConnection}
      disconnectingProvider={disconnectingProvider}
      isAutoCheckingCloudflareToken={isAutoCheckingCloudflareToken}
      isCheckingCloudflareAccess={cloudflareAccessQuery.isFetching}
      isCheckingConvexAccess={convexAccessQuery.isFetching}
      isRefreshing={isRefreshing}
      now={now}
      organization={organization}
      onCloudflareAccountChange={(accountId) => {
        setCloudflareAccountDialog((current) => ({
          ...current,
          error: null,
          selectedAccountId: accountId,
        }));
      }}
      onCloudflareAccountOpenChange={handleCloudflareAccountDialogOpenChange}
      onCloudflareAccountSubmit={() => {
        void handleSubmitCloudflareAccount();
      }}
      onConnect={(provider) => {
        void handleConnect(provider);
      }}
      onDisconnect={(provider) => {
        void handleDisconnect(provider);
      }}
      onOpenApiKeyDialog={openApiKeyDialog}
      onOpenCloudflareAccountDialog={(accountId) => {
        setCloudflareAccountDialog((current) => ({ ...current, isOpen: true }));
        void loadCloudflareAccountDialogResources(accountId);
      }}
      onRefresh={refreshAccess}
      providerDisconnectNotice={providerDisconnectNotice}
    />
  );
}
