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
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { openGithubOAuthPopup } from "@/lib/githubOAuthFlow";
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
type AppConvexConnection = (typeof api.users.getConvexConnectionStatus)["_returnType"];
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
  convexConnection: AppConvexConnection | undefined;
  githubHealth: AppGithubConnectionHealth | null;
  githubProviderSummary: AppGithubProviderSummary | undefined;
  now: number;
};
type ProviderConnectionsPageViewProps = ProviderConnectionsPageConnectionState & {
  apiKeyDialog: ReactNode;
  cloudflareAccountDialog: CloudflareAccountDialogState;
  disconnectingProvider: ProviderKey | null;
  cloudflareAccessError: string | null;
  githubDisconnectedNotice: string | null;
  githubHealthError: string | null;
  isAutoCheckingCloudflareToken: boolean;
  isCheckingCloudflareAccess: boolean;
  isCheckingGithubAccess: boolean;
  isReauthorizingGithub: boolean;
  onCheckCloudflareAccess: () => void;
  onCheckGithubAccess: () => void;
  onCloudflareAccountChange: (accountId: string) => void;
  onCloudflareAccountOpenChange: (isOpen: boolean) => void;
  onCloudflareAccountSubmit: () => void;
  onConnect: (provider: ProviderKey) => void;
  onDisconnect: (provider: ProviderKey) => void;
  onOpenApiKeyDialog: (provider: ApiKeyProvider) => void;
  onOpenCloudflareAccountDialog: (accountId: string | undefined) => void;
  onReauthorizeGithub: () => void;
};

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
    completionEventType: "cloudflare-oauth-complete",
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

function getCurrentRootRelativeUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
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

  return (
    <div className="space-y-3 text-xs leading-5">
      {isOAuth ? (
        <div className="space-y-2">
          <div className="font-medium text-foreground">Required access</div>
          <div className="flex flex-wrap gap-1.5">
            {health
              ? health.requiredScopes.map((scope) => (
                  <span
                    key={scope.scope}
                    className={
                      scope.status === "granted"
                        ? "rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800"
                        : scope.status === "missing"
                          ? "rounded-sm border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-destructive"
                          : "rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground"
                    }
                    title={scope.label}
                  >
                    {scope.scope}{" "}
                    {scope.status === "granted"
                      ? "Granted"
                      : scope.status === "missing"
                        ? "Missing"
                        : "Unknown"}
                  </span>
                ))
              : summary.requiredScopes.map((scope) => (
                  <span
                    key={scope.scope}
                    className="rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground"
                    title={scope.label}
                  >
                    {scope.scope} Unknown
                  </span>
                ))}
          </div>
          <div className="text-muted-foreground">
            Granted scopes: {grantedScopes ?? (health ? "None reported" : "Not checked")}
          </div>
        </div>
      ) : (
        <div className="space-y-1 text-muted-foreground">
          <div>Repository access is checked with live GitHub requests.</div>
          {grantedScopes ? <div>Reported token scopes: {grantedScopes}</div> : null}
        </div>
      )}
      {health ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="font-medium text-foreground">Organizations</div>
            {health.organizations.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {health.organizations.map((organization) => {
                  const role =
                    organization.role === "admin"
                      ? "Admin"
                      : organization.role === "member"
                        ? "Member"
                        : organization.role === "billing_manager"
                          ? "Billing manager"
                          : organization.role;
                  return (
                    <span
                      key={organization.login}
                      className="rounded-sm border border-border bg-background px-2 py-0.5 text-foreground"
                    >
                      {organization.login} · {role} ·{" "}
                      {organization.canCreateRepository ? "Can create repos" : "No repo creation"}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="text-muted-foreground">
                No organizations visible to this credential.
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div className="font-medium text-foreground">Live checks</div>
            <div className="space-y-1 text-muted-foreground">
              {health.checks.map((check) => (
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
            Last checked {formatRelativeTimeAgo(health.checkedAt, now)}.
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground">
          {isChecking
            ? "Checking GitHub access..."
            : "Run Check access to see live checks and organizations."}
        </div>
      )}
      {isOAuth ? (
        <div className="text-muted-foreground">
          Need more org access? Reauthorize revokes the current GitHub grant before opening OAuth
          again; closing the OAuth window leaves GitHub disconnected until you reconnect.
        </div>
      ) : null}
      {error ? <div>Error: {error}</div> : null}
    </div>
  );
}

function GitHubDisconnectedDetails({ notice }: { notice: string }) {
  return <div className="space-y-1 text-xs leading-5 text-muted-foreground">{notice}</div>;
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

export function ProviderConnectionsPageView({
  apiKeyDialog,
  cloudflareAccess,
  cloudflareAccessError,
  cloudflareAccountDialog,
  cloudflareConnection,
  convexConnection,
  disconnectingProvider,
  githubDisconnectedNotice,
  githubHealth,
  githubHealthError,
  githubProviderSummary,
  isAutoCheckingCloudflareToken,
  isCheckingCloudflareAccess,
  isCheckingGithubAccess,
  isReauthorizingGithub,
  now,
  onCheckCloudflareAccess,
  onCheckGithubAccess,
  onCloudflareAccountChange,
  onCloudflareAccountOpenChange,
  onCloudflareAccountSubmit,
  onConnect,
  onDisconnect,
  onOpenApiKeyDialog,
  onOpenCloudflareAccountDialog,
  onReauthorizeGithub,
}: ProviderConnectionsPageViewProps) {
  const githubActionsDisabled =
    disconnectingProvider !== null || isCheckingGithubAccess || isReauthorizingGithub;
  const githubProviderRow =
    githubProviderSummary?.connected === true
      ? ({
          actions: [
            {
              disabled: githubActionsDisabled,
              isPending: isCheckingGithubAccess,
              key: "check-github-access",
              label: "Check access",
              onClick: onCheckGithubAccess,
              pendingLabel: "Checking...",
            },
            ...(githubProviderSummary.manageUrl
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
            ...(githubProviderSummary.reauthorizeAvailable
              ? [
                  {
                    disabled: githubActionsDisabled,
                    isPending: isReauthorizingGithub,
                    key: "reauthorize-github",
                    label: "Reauthorize",
                    onClick: onReauthorizeGithub,
                    pendingLabel: "Reauthorizing...",
                  },
                ]
              : []),
            {
              disabled: githubActionsDisabled,
              isPending: disconnectingProvider === "github",
              key: "disconnect",
              label: "Disconnect",
              onClick: () => onDisconnect("github"),
              pendingLabel: "Disconnecting...",
            },
          ],
          details: (
            <GitHubConnectionDetails
              error={githubHealthError}
              health={githubHealth}
              isChecking={isCheckingGithubAccess}
              now={now}
              summary={githubProviderSummary}
            />
          ),
          icon: PROVIDER_METADATA.github.icon,
          key: "github",
          label: PROVIDER_METADATA.github.label,
          status: `Connected as ${githubProviderSummary.username ?? "GitHub user"} (${formatAuthMethod(githubProviderSummary.authMethod)})`,
        } satisfies ProviderConnectionRowViewModel)
      : ({
          actions: [
            {
              disabled: disconnectingProvider !== null || isReauthorizingGithub,
              key: "oauth",
              label: PROVIDER_METADATA.github.oauthButtonLabel,
              onClick: () => onConnect("github"),
            },
            {
              disabled: disconnectingProvider !== null || isReauthorizingGithub,
              key: "api-key",
              label: "Use API key",
              onClick: () => onOpenApiKeyDialog("github"),
            },
          ],
          details: githubDisconnectedNotice ? (
            <GitHubDisconnectedDetails notice={githubDisconnectedNotice} />
          ) : undefined,
          icon: PROVIDER_METADATA.github.icon,
          key: "github",
          label: PROVIDER_METADATA.github.label,
          status: "Not connected",
        } satisfies ProviderConnectionRowViewModel);
  const convexProviderRow =
    convexConnection?.connected === true
      ? ({
          actions: [
            {
              disabled: disconnectingProvider !== null,
              isPending: disconnectingProvider === "convex",
              key: "disconnect",
              label: "Disconnect",
              onClick: () => onDisconnect("convex"),
              pendingLabel: "Disconnecting...",
            },
          ],
          icon: PROVIDER_METADATA.convex.icon,
          key: "convex",
          label: PROVIDER_METADATA.convex.label,
          status: `Connected to ${convexConnection.teamSlug ?? "Convex"} (${formatAuthMethod(convexConnection.authMethod)})`,
        } satisfies ProviderConnectionRowViewModel)
      : ({
          actions: [
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
              onClick: () => onOpenApiKeyDialog("convex"),
            },
          ],
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
          target: "_blank",
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
      ],
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
      actions: [
        {
          disabled: disconnectingProvider !== null,
          key: "oauth",
          label: PROVIDER_METADATA.cloudflare.oauthButtonLabel,
          onClick: () => onConnect("cloudflare"),
        },
      ],
      icon: PROVIDER_METADATA.cloudflare.icon,
      key: "cloudflare",
      label: PROVIDER_METADATA.cloudflare.label,
      status: "Not connected",
    };
  }
  const providerRows = [githubProviderRow, convexProviderRow, cloudflareProviderRow];

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
        onAccountChange={onCloudflareAccountChange}
        onOpenChange={onCloudflareAccountOpenChange}
        onSubmit={onCloudflareAccountSubmit}
        open={cloudflareAccountDialog.isOpen}
        selectedAccountId={cloudflareAccountDialog.selectedAccountId}
      />
      {apiKeyDialog}
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
  setIsAutoCheckingCloudflareToken,
  userId,
}: {
  cloudflareConnection: AppCloudflareConnection | undefined;
  refreshCloudflareMcpTokenIfNeeded: (args: {
    force: false;
    trigger: CloudflareTokenAutoCheckTrigger;
  }) => Promise<unknown>;
  setIsAutoCheckingCloudflareToken: (isChecking: boolean) => void;
  userId: Id<"users"> | undefined;
}) {
  const cloudflareAutoCheckInFlightRef = useRef(false);
  const connectedCloudflareConnection =
    cloudflareConnection?.connected === true ? cloudflareConnection : null;

  useEffect(() => {
    if (connectedCloudflareConnection?.authMethod !== "mcp_oauth") {
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
    refreshCloudflareMcpTokenIfNeeded,
    setIsAutoCheckingCloudflareToken,
    userId,
  ]);
}

export function ProviderConnectionsPage() {
  const getGithubOAuthUrl = useMutation(api.githubOAuth.getGithubOAuthUrl);
  const reauthorizeGithubOAuth = useAction(api.githubOAuth.reauthorizeGithubOAuth);
  const getConvexOAuthUrl = useMutation(api.convexOAuth.getConvexOAuthUrl);
  const getCloudflareOAuthUrl = useAction(api.cloudflareOAuth.getCloudflareOAuthUrl);
  const checkGithubConnectionHealth = useAction(api.users.checkGithubConnectionHealth);
  const checkCloudflareConnectionAccess = useAction(
    api.cloudflareProviderAccess.checkCloudflareConnectionAccess,
  );
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
  const [disconnectingProvider, setDisconnectingProvider] = useState<ProviderKey | null>(null);
  const [cloudflareAccess, setCloudflareAccess] = useState<AppCloudflareConnectionAccess | null>(
    null,
  );
  const [cloudflareAccessError, setCloudflareAccessError] = useState<string | null>(null);
  const [githubHealth, setGithubHealth] = useState<AppGithubConnectionHealth | null>(null);
  const [githubHealthError, setGithubHealthError] = useState<string | null>(null);
  const [githubDisconnectedNotice, setGithubDisconnectedNotice] = useState<string | null>(null);
  const [isCheckingGithubAccess, setIsCheckingGithubAccess] = useState(false);
  const [isCheckingCloudflareAccess, setIsCheckingCloudflareAccess] = useState(false);
  const [isReauthorizingGithub, setIsReauthorizingGithub] = useState(false);
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
      getOAuthUrl: getCloudflareOAuthUrl,
      popupOriginRef: cloudflarePopupOriginRef,
      popupRef: cloudflarePopupRef,
    },
  };
  const now = useNow();
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

  const runCloudflareAccessCheck = useCallback(async () => {
    if (isCheckingCloudflareAccess) {
      return;
    }

    setCloudflareAccessError(null);
    setIsCheckingCloudflareAccess(true);
    try {
      setCloudflareAccess(await checkCloudflareConnectionAccess({}));
    } catch (error) {
      setCloudflareAccessError(
        error instanceof Error ? error.message : "Could not check Cloudflare access.",
      );
    } finally {
      setIsCheckingCloudflareAccess(false);
    }
  }, [checkCloudflareConnectionAccess, isCheckingCloudflareAccess]);

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
    if (provider === "cloudflare") {
      setCloudflareAccess(null);
      setCloudflareAccessError(null);
    }
    try {
      const oauthUrl =
        provider === "github"
          ? await getGithubOAuthUrl({
              returnToPath: getCurrentRootRelativeUrl(),
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
        returnToPath: getCurrentRootRelativeUrl(),
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
      if (provider === "cloudflare") {
        setCloudflareAccess(null);
        setCloudflareAccessError(null);
        setIsCheckingCloudflareAccess(false);
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
      convexConnection={convexConnection}
      disconnectingProvider={disconnectingProvider}
      githubDisconnectedNotice={githubDisconnectedNotice}
      githubHealth={githubHealth}
      githubHealthError={githubHealthError}
      githubProviderSummary={githubProviderSummary}
      isAutoCheckingCloudflareToken={isAutoCheckingCloudflareToken}
      isCheckingCloudflareAccess={isCheckingCloudflareAccess}
      isCheckingGithubAccess={isCheckingGithubAccess}
      isReauthorizingGithub={isReauthorizingGithub}
      now={now}
      onCheckCloudflareAccess={() => {
        void runCloudflareAccessCheck();
      }}
      onCheckGithubAccess={() => {
        void runGithubHealthCheck();
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
      onReauthorizeGithub={() => {
        void handleReauthorizeGithub();
      }}
    />
  );
}
