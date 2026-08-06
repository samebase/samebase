import { isInIframe } from "@/authClient";
import { useApiKeyConnectDialog } from "@/components/ApiKeyConnectDialog";
import type { ViewerOrganization } from "@/lib/organizationContext";
import { Button } from "@/components/ui/button";
import { VaultDashboardCloudflareAccountDialog } from "@/components/vault-dashboard/VaultDashboardCloudflareAccountDialog";
import { type CloudflareAccountOption } from "@/components/vault-dashboard/vaultDashboardCloudflareAccountOptions";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { useNow } from "@/hooks/useNow";
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { claimRefreshDebounce, releaseRefreshDebounce } from "@/lib/refreshDebounce";
import { isRecord, notEmpty } from "@samebase/dependent";
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
import { CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS } from "../../shared/cloudflareTokenRefresh";

const PROVIDER_KEYS = ["convex", "cloudflare"] as const;

type ProviderKey = (typeof PROVIDER_KEYS)[number];
type ProviderMetadata = {
  completionEventTypes: readonly string[];
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
type AppConvexConnection = (typeof api.users.getConvexConnectionStatus)["_returnType"];
type AppConvexConnectionAccess =
  (typeof api.convexProviderAccess.checkConvexConnectionAccess)["_returnType"];
type AppCloudflareConnection = (typeof api.users.getCloudflareConnectionStatus)["_returnType"];
type AppCloudflareConnectionAccess =
  (typeof api.cloudflareProviderAccess.checkCloudflareConnectionAccess)["_returnType"];
type CloudflareTokenAutoCheckTrigger = "focus" | "visibility" | "page_load" | "poll";
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
  cloudflareAccountDialog: CloudflareAccountDialogState;
  disconnectingProvider: ProviderKey | null;
  cloudflareAccessError: string | null;
  convexAccessError: string | null;
  isAutoCheckingCloudflareToken: boolean;
  isCheckingCloudflareAccess: boolean;
  isCheckingConvexAccess: boolean;
  organization: ViewerOrganization;
  onCheckCloudflareAccess: () => void;
  onCheckConvexAccess: () => void;
  onCloudflareAccountChange: (accountId: string) => void;
  onCloudflareAccountOpenChange: (isOpen: boolean) => void;
  onCloudflareAccountSubmit: () => void;
  onConnect: (provider: ProviderKey) => void;
  onDisconnect: (provider: ProviderKey) => void;
  onOpenApiKeyDialog: () => void;
  onOpenCloudflareAccountDialog: (accountId: string | undefined) => void;
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

function formatAuthMethod(method: "oauth" | "mcp_oauth" | "api_key" | "device_auth" | undefined) {
  if (method === "api_key") return "API key";
  if (method === "device_auth") return "Device auth";
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

function getConvexManageAccessUrl(teamSlug: string | undefined) {
  const normalizedTeamSlug = teamSlug?.trim();
  if (!normalizedTeamSlug) {
    return "https://dashboard.convex.dev/";
  }
  return `https://dashboard.convex.dev/t/${encodeURIComponent(normalizedTeamSlug)}/settings`;
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

function formatProviderTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function formatConvexTokenType(type: "team_token" | "project_token") {
  switch (type) {
    case "team_token":
      return "Team token";
    case "project_token":
      return "Project token";
    default:
      const unhandledType: never = type;
      return unhandledType;
  }
}

function ConvexConnectionDetails({
  access,
  connection,
  error,
  isChecking,
  now,
}: {
  access: AppConvexConnectionAccess | null;
  connection: AppConvexConnection | undefined;
  error: string | null;
  isChecking: boolean;
  now: number;
}) {
  if (connection?.connected !== true) {
    return null;
  }

  const checkedAccess = access?.connected === true ? access : null;
  const requestedAccess = checkedAccess?.requestedAccess ?? [
    {
      key: "team",
      label: "Team-scoped Convex Management API access",
    },
  ];
  const team = checkedAccess?.team;
  const teamId = team?.teamId ?? connection.teamId;
  const teamSlug = team?.teamSlug ?? connection.teamSlug;

  return (
    <div className="space-y-3 text-xs leading-5">
      <div className="space-y-2">
        <div className="font-medium text-foreground">Requested access</div>
        <div className="flex flex-wrap gap-1.5">
          {requestedAccess.map((item) => (
            <span
              key={item.key}
              className="rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-foreground"
            >
              {item.label}
            </span>
          ))}
        </div>
      </div>
      {checkedAccess?.token ? (
        <div className="space-y-1 text-muted-foreground">
          <div className="font-medium text-foreground">Token</div>
          <div>
            {[
              formatConvexTokenType(checkedAccess.token.type),
              `Name ${checkedAccess.token.name}`,
              `ID ${checkedAccess.token.id}`,
              `Created ${formatProviderTimestamp(checkedAccess.token.createdAt)}`,
            ].join(". ")}
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground">
          {isChecking
            ? "Checking Convex access..."
            : "Run Check access to verify token details and live Convex access."}
        </div>
      )}
      {teamId || teamSlug ? (
        <div className="space-y-1 text-muted-foreground">
          <div className="font-medium text-foreground">Team</div>
          <div>
            {[teamSlug ? `Slug ${teamSlug}` : null, teamId ? `ID ${teamId}` : null]
              .filter(notEmpty)
              .join(". ")}
          </div>
        </div>
      ) : null}
      {checkedAccess ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="font-medium text-foreground">Live probes</div>
            <div className="space-y-1 text-muted-foreground">
              {checkedAccess.checks.map((check) => (
                <div key={check.key}>
                  <span
                    className={
                      check.status === "ok"
                        ? "text-emerald-700"
                        : check.status === "error"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }
                  >
                    {check.label}:{" "}
                    {check.status === "ok"
                      ? "OK"
                      : check.status === "error"
                        ? "Needs attention"
                        : "Not checked"}
                  </span>
                  {check.message ? ` - ${check.message}` : ""}
                </div>
              ))}
            </div>
          </div>
          <div className="text-muted-foreground">
            Last checked {formatRelativeTimeAgo(checkedAccess.checkedAt, now)}.
          </div>
        </div>
      ) : null}
      <div className="text-muted-foreground">
        Project and deployment creation are not probed here because that would create resources.
      </div>
      {error ? <div>Error: {error}</div> : null}
    </div>
  );
}

function CloudflareConnectionDetails({
  access,
  connection,
  error,
  isChecking,
  now,
}: {
  access: AppCloudflareConnectionAccess | null;
  connection: AppCloudflareConnection | undefined;
  error: string | null;
  isChecking: boolean;
  now: number;
}) {
  if (connection?.connected !== true) {
    return null;
  }

  const checkedAccess = access?.connected === true ? access : null;
  const requestedScopes = checkedAccess?.requestedScopes ?? [];
  const accounts = checkedAccess?.accounts ?? [];
  const checks = checkedAccess?.checks ?? [];
  const token = checkedAccess?.token;

  return (
    <div className="space-y-3 text-xs leading-5">
      <div className="space-y-2">
        <div className="font-medium text-foreground">Requested OAuth scopes</div>
        {requestedScopes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {requestedScopes.map((scope) => (
              <span
                key={scope.scope}
                className="rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-foreground"
                title={scope.label}
              >
                {scope.scope} · {scope.label}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground">
            {connection.authMethod === "api_key"
              ? "API token policy is not read. Samebase verifies this credential with live Cloudflare API probes."
              : checkedAccess
                ? "No OAuth scopes were recorded for this connection."
                : "Run Check access to see the OAuth scopes Samebase requested from Cloudflare."}
          </div>
        )}
      </div>
      {token ? (
        <div className="space-y-1 text-muted-foreground">
          <div className="font-medium text-foreground">API token</div>
          <div>
            {[
              token.status ? `Status ${token.status}` : null,
              token.id ? `ID ${token.id}` : null,
              token.expiresOn ? `Expires ${token.expiresOn}` : null,
              token.notBefore ? `Valid after ${token.notBefore}` : null,
            ]
              .filter(notEmpty)
              .join(". ")}
          </div>
        </div>
      ) : null}
      {checkedAccess ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="font-medium text-foreground">Accounts</div>
            {accounts.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {accounts.map((account) => (
                  <span
                    key={account.accountId}
                    className={
                      account.selected
                        ? "rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800"
                        : "rounded-sm border border-border bg-background px-2 py-0.5 text-foreground"
                    }
                    title={account.accountId}
                  >
                    {account.accountName} ({account.accountId})
                    {account.selected ? " · Selected" : ""}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">
                Visible accounts appear here when the Accounts probe succeeds.
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div className="font-medium text-foreground">Live probes</div>
            <div className="space-y-1 text-muted-foreground">
              {checks.map((check) => (
                <div key={check.key}>
                  <span
                    className={
                      check.status === "ok"
                        ? "text-emerald-700"
                        : check.status === "error"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }
                  >
                    {check.label}:{" "}
                    {check.status === "ok"
                      ? "OK"
                      : check.status === "error"
                        ? "Needs attention"
                        : "Not checked"}
                  </span>
                  {check.message ? ` - ${check.message}` : ""}
                </div>
              ))}
            </div>
          </div>
          <div className="text-muted-foreground">
            Last checked {formatRelativeTimeAgo(checkedAccess.checkedAt, now)}.
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground">
          {isChecking
            ? "Checking Cloudflare access..."
            : "Run Check access to probe account visibility, selected account access, Workers, and Workers Builds."}
        </div>
      )}
      <div className="text-muted-foreground">
        Workers and Workers Builds write access is requested for provisioning; this check performs
        read-only probes.
      </div>
      {error ? <div>Error: {error}</div> : null}
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
            <div
              className="min-w-0 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]"
              title={providerRow.status}
            >
              {providerRow.status}
            </div>
            {providerRow.details ? <div className="mt-2">{providerRow.details}</div> : null}
          </div>
          {providerRow.actions.length > 0 ? (
            <ConnectionActions actions={providerRow.actions} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ConnectionActions({ actions }: { actions: readonly ProviderConnectionActionViewModel[] }) {
  return (
    <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 self-start">
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
  );
}

export function ProviderConnectionsPageView({
  apiKeyDialog,
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
  now,
  organization,
  onCheckCloudflareAccess,
  onCheckConvexAccess,
  onCloudflareAccountChange,
  onCloudflareAccountOpenChange,
  onCloudflareAccountSubmit,
  onConnect,
  onDisconnect,
  onOpenApiKeyDialog,
  onOpenCloudflareAccountDialog,
}: ProviderConnectionsPageViewProps) {
  const canManageSelectedOrganization = organization.role === "owner";
  const convexProviderRow =
    convexConnection?.connected === true
      ? (() => {
          const convexActionsDisabled = disconnectingProvider !== null || isCheckingConvexAccess;
          return {
            actions: [
              {
                disabled: convexActionsDisabled,
                isPending: isCheckingConvexAccess,
                key: "check-convex-access",
                label: "Check access",
                onClick: onCheckConvexAccess,
                pendingLabel: "Checking...",
              },
              {
                disabled: convexActionsDisabled,
                href: getConvexManageAccessUrl(convexConnection.teamSlug),
                key: "manage-convex-access",
                label: "Manage access",
                target: "_blank" as const,
              },
              ...(convexConnection.authMethod === "oauth"
                ? [
                    {
                      disabled: convexActionsDisabled,
                      key: "reauthorize-convex",
                      label: "Reauthorize",
                      onClick: () => onConnect("convex"),
                    },
                  ]
                : [
                    {
                      disabled: convexActionsDisabled,
                      key: "update-convex-token",
                      label: "Update token",
                      onClick: onOpenApiKeyDialog,
                    },
                  ]),
              {
                disabled: convexActionsDisabled,
                isPending: disconnectingProvider === "convex",
                key: "disconnect",
                label: "Disconnect",
                onClick: () => onDisconnect("convex"),
                pendingLabel: "Disconnecting...",
              },
            ].filter(
              (action) => canManageSelectedOrganization || action.key === "check-convex-access",
            ),
            details: (
              <ConvexConnectionDetails
                access={convexAccess}
                connection={convexConnection}
                error={convexAccessError}
                isChecking={isCheckingConvexAccess}
                now={now}
              />
            ),
            icon: PROVIDER_METADATA.convex.icon,
            key: "convex",
            label: PROVIDER_METADATA.convex.label,
            status: `Connected to ${convexConnection.teamSlug ?? "Convex"} (${formatAuthMethod(convexConnection.authMethod)})`,
          } satisfies ProviderConnectionRowViewModel;
        })()
      : ({
          actions: canManageSelectedOrganization
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
            : [],
          icon: PROVIDER_METADATA.convex.icon,
          key: "convex",
          label: PROVIDER_METADATA.convex.label,
          status: "Not connected",
        } satisfies ProviderConnectionRowViewModel);
  let cloudflareProviderRow: ProviderConnectionRowViewModel;
  if (cloudflareConnection?.connected === true) {
    const isAccountSelectionRequired = !cloudflareConnection.accountId;
    const accountStatus = isAccountSelectionRequired
      ? "Choose account."
      : cloudflareConnection.accountName
        ? `Account ${cloudflareConnection.accountName}.`
        : "";
    const cloudflareActionsDisabled =
      disconnectingProvider !== null || isAutoCheckingCloudflareToken || isCheckingCloudflareAccess;
    cloudflareProviderRow = {
      actions: [
        {
          disabled: cloudflareActionsDisabled,
          isPending: isCheckingCloudflareAccess,
          key: "check-cloudflare-access",
          label: "Check access",
          onClick: onCheckCloudflareAccess,
          pendingLabel: "Checking...",
        },
        {
          disabled: cloudflareActionsDisabled,
          href: getCloudflareManageAccessUrl(cloudflareConnection.authMethod),
          key: "manage-cloudflare-access",
          label: "Manage access",
          target: "_blank" as const,
        },
        {
          disabled: cloudflareActionsDisabled,
          key: "reconnect-cloudflare",
          label: "Reconnect",
          onClick: () => onConnect("cloudflare"),
        },
        {
          disabled: cloudflareActionsDisabled,
          key: "select-account",
          label: isAccountSelectionRequired ? "Select account" : "Manage account",
          onClick: () => onOpenCloudflareAccountDialog(cloudflareConnection.accountId),
        },
        {
          disabled: cloudflareActionsDisabled,
          isPending: disconnectingProvider === "cloudflare",
          key: "disconnect",
          label: "Disconnect",
          onClick: () => onDisconnect("cloudflare"),
          pendingLabel: "Disconnecting...",
        },
      ].filter(
        (action) => canManageSelectedOrganization || action.key === "check-cloudflare-access",
      ),
      details: (
        <CloudflareConnectionDetails
          access={cloudflareAccess}
          connection={cloudflareConnection}
          error={cloudflareAccessError}
          isChecking={isCheckingCloudflareAccess}
          now={now}
        />
      ),
      icon: PROVIDER_METADATA.cloudflare.icon,
      key: "cloudflare",
      label: PROVIDER_METADATA.cloudflare.label,
      status: [`Connected (${formatAuthMethod(cloudflareConnection.authMethod)}).`, accountStatus]
        .filter((part) => part.length > 0)
        .join(" "),
    };
  } else {
    cloudflareProviderRow = {
      actions: canManageSelectedOrganization
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
      status: "Not connected",
    };
  }
  const providerRows = [convexProviderRow, cloudflareProviderRow];

  return (
    <div
      data-testid="provider-connections-page"
      className="container flex min-h-0 flex-1 flex-col py-6"
    >
      <div className="mb-6 flex flex-shrink-0 flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold @2xl:text-2xl">Providers</h1>
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
        onAccountChange={onCloudflareAccountChange}
        onOpenChange={onCloudflareAccountOpenChange}
        onSubmit={onCloudflareAccountSubmit}
        open={canManageSelectedOrganization && cloudflareAccountDialog.isOpen}
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
  if (!isRecord(event.data) || typeof event.data["type"] !== "string") {
    return;
  }

  for (const provider of PROVIDER_KEYS) {
    const popupConfig = providerPopupConfig[provider];
    if (!popupConfig.completionEventTypes.includes(event.data["type"])) {
      continue;
    }
    if (event.source !== popupConfig.popupRef.current) {
      return;
    }
    if (event.origin !== (popupConfig.popupOriginRef.current ?? expectedOrigin)) {
      return;
    }

    const returnTo = event.data["returnTo"];
    if (typeof returnTo !== "string") {
      return;
    }
    let returnUrl: URL;
    try {
      returnUrl = new URL(returnTo);
    } catch {
      return;
    }
    if (returnUrl.origin !== expectedOrigin) {
      return;
    }

    navigate(returnTo);
    return;
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
  const connectedCloudflareConnection =
    cloudflareConnection?.connected === true ? cloudflareConnection : null;

  useEffect(() => {
    if (connectedCloudflareConnection?.authMethod !== "mcp_oauth" || organizationId === null) {
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

    const isVisible = document.visibilityState === "visible";
    if (isVisible) {
      runAutoCheck("page_load");
    }

    const pollId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (
        typeof connectedCloudflareConnection.mcpTokenNextAutoCheckAt === "number" &&
        Date.now() < connectedCloudflareConnection.mcpTokenNextAutoCheckAt
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
    connectedCloudflareConnection?.authMethod,
    connectedCloudflareConnection?.mcpTokenNextAutoCheckAt,
    organizationId,
    refreshCloudflareMcpTokenIfNeeded,
    setIsAutoCheckingCloudflareToken,
  ]);
}

export function ProviderConnectionsPage({ organization }: { organization: ViewerOrganization }) {
  const getConvexOAuthUrl = useMutation(api.convexOAuth.getConvexOAuthUrl);
  const getCloudflareOAuthUrl = useAction(api.cloudflareOAuth.getCloudflareOAuthUrl);
  const checkConvexConnectionAccess = useAction(
    api.convexProviderAccess.checkConvexConnectionAccess,
  );
  const checkCloudflareConnectionAccess = useAction(
    api.cloudflareProviderAccess.checkCloudflareConnectionAccess,
  );
  const refreshCloudflareMcpTokenIfNeeded = useAction(api.users.refreshCloudflareMcpTokenIfNeeded);
  const listCloudflareAccounts = useAction(api.vault.cloudflare.listAccounts);
  const selectCloudflareDefaultAccount = useAction(api.vault.cloudflare.selectDefaultAccount);
  const connectConvexWithApiKey = useAction(api.users.connectConvexWithApiKey);
  const disconnectConvex = useAction(api.users.disconnectConvex);
  const disconnectCloudflare = useAction(api.users.disconnectCloudflare);
  const selectedOrganizationId = organization.organizationId;
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus, {
    organizationId: selectedOrganizationId,
  });
  const cloudflareConnection = useConvexQuery(api.users.getCloudflareConnectionStatus, {
    organizationId: selectedOrganizationId,
  });
  const convexPopupRef = useRef<Window | null>(null);
  const cloudflarePopupRef = useRef<Window | null>(null);
  const convexPopupOriginRef = useRef<string | null>(null);
  const cloudflarePopupOriginRef = useRef<string | null>(null);
  const cloudflareAccountDialogRequestIdRef = useRef(0);
  const [disconnectingProvider, setDisconnectingProvider] = useState<ProviderKey | null>(null);
  const [cloudflareAccess, setCloudflareAccess] = useState<AppCloudflareConnectionAccess | null>(
    null,
  );
  const [cloudflareAccessError, setCloudflareAccessError] = useState<string | null>(null);
  const [convexAccess, setConvexAccess] = useState<AppConvexConnectionAccess | null>(null);
  const [convexAccessError, setConvexAccessError] = useState<string | null>(null);
  const [isCheckingConvexAccess, setIsCheckingConvexAccess] = useState(false);
  const [isCheckingCloudflareAccess, setIsCheckingCloudflareAccess] = useState(false);
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
        await disconnectConvex({ organizationId: selectedOrganizationId });
      },
      getOAuthUrl: async () => {
        return await getConvexOAuthUrl({ organizationId: selectedOrganizationId });
      },
      popupOriginRef: convexPopupOriginRef,
      popupRef: convexPopupRef,
    },
    cloudflare: {
      disconnect: async () => {
        await disconnectCloudflare({ organizationId: selectedOrganizationId });
      },
      getOAuthUrl: async () => {
        return await getCloudflareOAuthUrl({ organizationId: selectedOrganizationId });
      },
      popupOriginRef: cloudflarePopupOriginRef,
      popupRef: cloudflarePopupRef,
    },
  };
  const now = useNow();
  const connectConvexWithApiKeyAndClearAccess = useCallback(
    async (args: { token: string }) => {
      const result = await connectConvexWithApiKey({
        organizationId: selectedOrganizationId,
        token: args.token,
      });
      setConvexAccess(null);
      setConvexAccessError(null);
      return result;
    },
    [connectConvexWithApiKey, selectedOrganizationId],
  );
  const { openApiKeyDialog, apiKeyDialog } = useApiKeyConnectDialog({
    connectConvexWithApiKey: connectConvexWithApiKeyAndClearAccess,
  });

  useProviderOAuthPopupCompletionNavigation({
    cloudflarePopupOriginRef,
    cloudflarePopupRef,
    convexPopupOriginRef,
    convexPopupRef,
  });
  useCloudflareMcpTokenAutoCheck({
    cloudflareConnection,
    organizationId: selectedOrganizationId,
    refreshCloudflareMcpTokenIfNeeded,
    setIsAutoCheckingCloudflareToken,
  });

  const runConvexAccessCheck = useCallback(async () => {
    if (isCheckingConvexAccess) {
      return;
    }

    setConvexAccessError(null);
    setIsCheckingConvexAccess(true);
    try {
      setConvexAccess(
        await checkConvexConnectionAccess({ organizationId: selectedOrganizationId }),
      );
    } catch (error) {
      setConvexAccessError(
        error instanceof Error ? error.message : "Could not check Convex access.",
      );
    } finally {
      setIsCheckingConvexAccess(false);
    }
  }, [checkConvexConnectionAccess, isCheckingConvexAccess, selectedOrganizationId]);

  const runCloudflareAccessCheck = useCallback(async () => {
    if (isCheckingCloudflareAccess) {
      return;
    }

    setCloudflareAccessError(null);
    setIsCheckingCloudflareAccess(true);
    try {
      setCloudflareAccess(
        await checkCloudflareConnectionAccess({ organizationId: selectedOrganizationId }),
      );
    } catch (error) {
      setCloudflareAccessError(
        error instanceof Error ? error.message : "Could not check Cloudflare access.",
      );
    } finally {
      setIsCheckingCloudflareAccess(false);
    }
  }, [checkCloudflareConnectionAccess, isCheckingCloudflareAccess, selectedOrganizationId]);

  const loadCloudflareAccountDialogResources = async (preferredAccountId: string | undefined) => {
    const requestId = cloudflareAccountDialogRequestIdRef.current + 1;
    cloudflareAccountDialogRequestIdRef.current = requestId;
    setCloudflareAccountDialog((current) => ({
      ...current,
      error: null,
      isLoadingAccounts: true,
    }));
    try {
      const accounts = await listCloudflareAccounts({ organizationId: selectedOrganizationId });
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
    if (provider === "cloudflare") {
      setCloudflareAccess(null);
      setCloudflareAccessError(null);
    }
    if (provider === "convex") {
      setConvexAccess(null);
      setConvexAccessError(null);
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
      if (provider === "cloudflare") {
        setCloudflareAccess(null);
        setCloudflareAccessError(null);
        setIsCheckingCloudflareAccess(false);
      }
      if (provider === "convex") {
        setConvexAccess(null);
        setConvexAccessError(null);
        setIsCheckingConvexAccess(false);
      }
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
      await selectCloudflareDefaultAccount({
        accountId: cloudflareAccountDialog.selectedAccountId,
        organizationId: selectedOrganizationId,
      });
      setCloudflareAccess(null);
      setCloudflareAccessError(null);
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

  return (
    <ProviderConnectionsPageView
      apiKeyDialog={apiKeyDialog}
      cloudflareAccess={cloudflareAccess}
      cloudflareAccessError={cloudflareAccessError}
      cloudflareAccountDialog={cloudflareAccountDialog}
      cloudflareConnection={cloudflareConnection}
      convexAccess={convexAccess}
      convexAccessError={convexAccessError}
      convexConnection={convexConnection}
      disconnectingProvider={disconnectingProvider}
      isAutoCheckingCloudflareToken={isAutoCheckingCloudflareToken}
      isCheckingCloudflareAccess={isCheckingCloudflareAccess}
      isCheckingConvexAccess={isCheckingConvexAccess}
      now={now}
      organization={organization}
      onCheckCloudflareAccess={() => {
        void runCloudflareAccessCheck();
      }}
      onCheckConvexAccess={() => {
        void runConvexAccessCheck();
      }}
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
    />
  );
}
