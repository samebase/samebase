import { isInIframe } from "@/authClient";
import { useApiKeyConnectDialog } from "@/components/ApiKeyConnectDialog";
import { AuthorizationErrorNotice } from "@/components/AuthorizationErrorNotice";
import type { ViewerOrganization } from "@/lib/organizationContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { readAuthorizationCompletionReturnTo } from "@/lib/authorizationCompletionMessage";
import { getCurrentRootRelativeUrl } from "@/lib/currentRootRelativeUrl";
import { openGitHubAppSetupPopup } from "@/lib/githubAppSetupFlow";
import { claimRefreshDebounce, releaseRefreshDebounce } from "@/lib/refreshDebounce";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  ExternalLink,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
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
import { useNow } from "@/hooks/useNow";
import { SETTINGS_ROUTE } from "@/lib/settingsRoute";
import { Link } from "@tanstack/react-router";

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
  appearance?: "text";
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
type AppGitHubInstallationAccess =
  (typeof api.githubAppAccess.checkViewerInstallation)["_returnType"];
type AppGitHubUserAuthorization =
  (typeof api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization)["_returnType"];
type ProviderAccessCheckState =
  | AppCloudflareConnectionAccess["checks"][number]["status"]
  | "checking";
type ProviderAccessCheckDefinition = {
  key:
    | AppConvexConnectionAccess["checks"][number]["key"]
    | AppCloudflareConnectionAccess["checks"][number]["key"]
    | AppGitHubInstallationAccess["checks"][number]["key"];
  target: string;
};
type ApiCheckViewModel = {
  key: string;
  status: ProviderAccessCheckState;
  target: string;
};
type ProviderDisconnectResult = (typeof api.users.disconnectConvex)["_returnType"];
type CloudflareTokenAutoCheckTrigger = "focus" | "visibility" | "poll";
type GitHubUserAuthorizationRequestState = "idle" | "authorizing" | "revoking";
export type ProviderConnectionsPageConnectionState = {
  cloudflareAccess: AppCloudflareConnectionAccess | null;
  cloudflareConnection: AppCloudflareConnection | undefined;
  convexAccess: AppConvexConnectionAccess | null;
  convexConnection: AppConvexConnection | undefined;
  githubAccess: AppGitHubInstallationAccess | null;
};
type ProviderConnectionsPageViewProps = ProviderConnectionsPageConnectionState & {
  authorizationErrorMessage: ReactNode;
  cloudflareApiTokenDialog: ReactNode;
  disconnectingProvider: ProviderKey | null;
  cloudflareAccessError: boolean;
  convexApiKeyDialog: ReactNode;
  convexAccessError: boolean;
  githubAccessError: boolean;
  githubUserAuthorization: AppGitHubUserAuthorization | undefined;
  githubUserAuthorizationRequestState: GitHubUserAuthorizationRequestState;
  isCheckingCloudflareAccess: boolean;
  isCheckingConvexAccess: boolean;
  isCheckingGitHubAccess: boolean;
  isReconnectingGitHubApp: boolean;
  organization: ViewerOrganization;
  onConnect: (provider: ProviderKey) => void;
  onDisconnect: (provider: ProviderKey) => void;
  onOpenCloudflareApiTokenDialog: () => void;
  onOpenConvexApiKeyDialog: () => void;
  onAuthorizeGitHubUser: () => void;
  onReconnectGitHubApp: () => void;
  onRevokeGitHubUser: () => void;
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

const CONVEX_ACCESS_CHECKS = [
  { key: "token", target: "/token_details" },
  { key: "projects", target: "/teams/{team_id}/projects" },
  {
    key: "deployments",
    target: "/teams/{team_id}/list_deployments",
  },
] satisfies readonly ProviderAccessCheckDefinition[];

const GITHUB_ACCESS_CHECKS = [
  { key: "repositories", target: "/installation/repositories" },
  { key: "installation", target: "/app/installations/{installation_id}" },
] satisfies readonly ProviderAccessCheckDefinition[];

function formatAuthMethod(
  method: "oauth" | "mcp_oauth" | "api_key" | undefined,
  kind: "Team" | "Account",
) {
  if (method === "api_key") return kind === "Account" ? "API token" : "API key";
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
  connectedBy,
  href,
  kind,
  name,
  state,
}: {
  authMethod: "oauth" | "mcp_oauth" | "api_key" | undefined;
  connectedBy?: string;
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
      className="inline-flex max-w-full items-center gap-1 font-semibold text-foreground underline underline-offset-4"
      href={href}
      rel="noreferrer noopener"
      target="_blank"
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
    </a>
  ) : (
    <span className="font-semibold text-foreground">{name}</span>
  );

  return (
    <div className="min-w-0">
      <div className="min-w-0 text-base leading-5">{target}</div>
      <div className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {kind} · {state ?? formatAuthMethod(authMethod, kind)}
        {connectedBy ? (
          <>
            {" · Connected by "}
            <span className="font-medium text-foreground">{connectedBy}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function GitHubOwnerStatus({ organization }: { organization: ViewerOrganization }) {
  const ownerType =
    organization.githubOwnerType === "organization" ? "Organization" : "Personal account";

  return (
    <div className="min-w-0">
      <div className="min-w-0 text-base leading-5">
        <a
          aria-label={`Open GitHub owner ${organization.githubOwnerLogin} in a new tab`}
          className="inline-flex max-w-full items-center gap-1 font-semibold text-foreground underline underline-offset-4"
          href={`https://github.com/${encodeURIComponent(organization.githubOwnerLogin)}`}
          rel="noreferrer noopener"
          target="_blank"
        >
          <span className="min-w-0 [overflow-wrap:anywhere]">{organization.githubOwnerLogin}</span>
          <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        </a>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{ownerType} · GitHub App</div>
    </div>
  );
}

function ProviderAccessCheckStatus({ status }: { status: ProviderAccessCheckState }) {
  switch (status) {
    case "ok":
      return (
        <span className="inline-flex shrink-0 items-center text-emerald-700">
          <CircleCheck aria-hidden="true" className="size-3.5" />
          <span className="sr-only">Passed</span>
        </span>
      );
    case "error":
      return (
        <span className="inline-flex shrink-0 items-center text-destructive">
          <CircleX aria-hidden="true" className="size-3.5" />
          <span className="sr-only">Failed</span>
        </span>
      );
    case "checking":
      return (
        <span className="inline-flex shrink-0 items-center text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          <span className="sr-only">Checking</span>
        </span>
      );
    case "not_run":
      return (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <CircleDashed aria-hidden="true" className="size-3.5" />
          Not run
        </span>
      );
    case "unknown":
      return (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <CircleDashed aria-hidden="true" className="size-3.5" />
          Unconfirmed
        </span>
      );
    default:
      status satisfies never;
      return null;
  }
}

function ApiChecks({ checks }: { checks: readonly ApiCheckViewModel[] }) {
  return (
    <div>
      <div className="font-medium text-foreground">API checks</div>
      <ul className="mt-1 divide-y divide-border/50">
        {checks.map((check) => (
          <li
            key={check.key}
            data-provider-access-check={check.key}
            data-provider-access-check-state={check.status}
            className="flex min-w-0 items-center justify-between gap-3 py-1.5"
          >
            <code className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
              GET {check.target}
            </code>
            <ProviderAccessCheckStatus status={check.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TechnicalValueList({ label, values }: { label: string; values: readonly string[] }) {
  if (values.length === 0) return null;

  return (
    <div className="text-foreground">
      <div className="font-medium">{label}</div>
      <ul className="list-disc pl-5">
        {values.map((value) => (
          <li key={value}>
            <code className="text-xs text-muted-foreground">{value}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GitHubInstallationDetails({
  access,
  error,
  githubUserAuthorization,
  githubUserAuthorizationRequestState,
  isChecking,
  onAuthorizeGitHubUser,
  onRevokeGitHubUser,
  organization,
}: {
  access: AppGitHubInstallationAccess | null;
  error: boolean;
  githubUserAuthorization: AppGitHubUserAuthorization | undefined;
  githubUserAuthorizationRequestState: GitHubUserAuthorizationRequestState;
  isChecking: boolean;
  onAuthorizeGitHubUser: () => void;
  onRevokeGitHubUser: () => void;
  organization: ViewerOrganization;
}) {
  const failedChecks = access?.checks.filter((check) => check.status === "error") ?? [];
  const permissions =
    access?.permissions.map((permission) => `${permission.key}.${permission.access}`) ?? [];

  return (
    <div className="space-y-4 text-sm leading-5">
      <TechnicalValueList label="Permissions" values={permissions} />
      {access?.repositorySelection ? (
        <div className="text-foreground">
          <div className="font-medium">Repository access</div>
          <code className="text-xs text-muted-foreground">{access.repositorySelection}</code>
        </div>
      ) : null}
      <ProviderAccessChecks
        access={access}
        definitions={GITHUB_ACCESS_CHECKS}
        isChecking={isChecking}
      />
      {access?.status === "unavailable" || error || failedChecks.length > 0 ? (
        <AuthorizationErrorNotice>Could not confirm GitHub App access.</AuthorizationErrorNotice>
      ) : null}
      {organization.githubOwnerType === "user" ? (
        <PersonalRepositoryCreationDetails
          authorization={githubUserAuthorization}
          ownerLogin={organization.githubOwnerLogin}
          requestState={githubUserAuthorizationRequestState}
          onAuthorize={onAuthorizeGitHubUser}
          onRevoke={onRevokeGitHubUser}
        />
      ) : null}
    </div>
  );
}

function PersonalRepositoryCreationDetails({
  authorization,
  onAuthorize,
  onRevoke,
  ownerLogin,
  requestState,
}: {
  authorization: AppGitHubUserAuthorization | undefined;
  onAuthorize: () => void;
  onRevoke: () => void;
  ownerLogin: string;
  requestState: GitHubUserAuthorizationRequestState;
}) {
  const now = useNow({
    enabled: authorization?.status === "authorized",
    intervalMs: 60_000,
  });
  const expired =
    authorization?.status === "authorized" && authorization.refreshTokenExpiresAt <= now;
  const canAuthorize = authorization?.status === "not_connected" || expired;
  const canRevoke =
    authorization?.status === "authorized" ||
    authorization?.status === "different_account" ||
    ((authorization?.status === "sign_in_required" ||
      authorization?.status === "sign_in_mismatch") &&
      authorization.authorizationPresent);
  const accountSettingsLink = (
    <Link className="underline underline-offset-4" to={SETTINGS_ROUTE}>
      Account settings
    </Link>
  );
  const status =
    authorization?.status === "sign_in_required" ? (
      <>
        Connect GitHub as @{ownerLogin} in {accountSettingsLink} first.
      </>
    ) : authorization === undefined ? (
      "Loading..."
    ) : authorization.status === "sign_in_mismatch" ? (
      <>
        Use the Samebase account connected to GitHub as @{ownerLogin}. Check {accountSettingsLink}.
      </>
    ) : authorization.status === "not_connected" ? (
      "Authorization required"
    ) : authorization.status === "different_account" ? (
      `Authorized as @${authorization.githubUserLogin}, not @${ownerLogin}.`
    ) : expired ? (
      `Expired for @${authorization.githubUserLogin}`
    ) : (
      `Authorized as @${authorization.githubUserLogin}`
    );

  return (
    <div data-testid="personal-repository-creation" className="border-t border-border/50 pt-4">
      <div className="font-medium text-foreground">Personal repository creation</div>
      <div className="mt-1 text-muted-foreground">{status}</div>
      <p className="mt-2 text-muted-foreground">
        Samebase uses this authorization only to create repositories in this personal GitHub
        account.
      </p>
      {canAuthorize || canRevoke ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canAuthorize ? (
            <Button
              disabled={requestState !== "idle"}
              onClick={onAuthorize}
              size="sm"
              type="button"
            >
              {requestState === "authorizing" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {requestState === "authorizing"
                ? "Opening..."
                : expired
                  ? "Reauthorize"
                  : "Authorize"}
            </Button>
          ) : null}
          {canRevoke ? (
            <Button
              disabled={requestState !== "idle"}
              onClick={onRevoke}
              size="sm"
              type="button"
              variant="outline"
            >
              {requestState === "revoking" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {requestState === "revoking" ? "Revoking..." : "Revoke"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProviderAccessChecks({
  access,
  definitions,
  isChecking,
}: {
  access:
    | Pick<AppConvexConnectionAccess, "checks">
    | Pick<AppCloudflareConnectionAccess, "checks">
    | Pick<AppGitHubInstallationAccess, "checks">
    | null;
  definitions: readonly ProviderAccessCheckDefinition[];
  isChecking: boolean;
}) {
  return (
    <ApiChecks
      checks={definitions.map((definition) => ({
        key: definition.key,
        status: isChecking
          ? "checking"
          : (access?.checks.find((candidate) => candidate.key === definition.key)?.status ??
            "not_run"),
        target: definition.target,
      }))}
    />
  );
}

function getCloudflareAccessChecks(
  authMethod: "oauth" | "mcp_oauth" | "api_key",
): readonly ProviderAccessCheckDefinition[] {
  const checks: ProviderAccessCheckDefinition[] = [
    { key: "accounts", target: "/accounts" },
    {
      key: "workers",
      target: "/accounts/{account_id}/workers/account-settings",
    },
    {
      key: "workers_builds",
      target: "/accounts/{account_id}/builds/account/limits",
    },
  ];
  if (authMethod === "api_key") {
    checks.unshift({ key: "token", target: "/user/tokens/verify" });
  }
  return checks;
}

function getConvexRemediation(authMethod: "oauth" | "api_key"): string {
  return authMethod === "oauth" ? "Reauthorize Convex." : "Update the Convex token.";
}

function getCloudflareCredentialRemediation(authMethod: "oauth" | "mcp_oauth" | "api_key"): string {
  return authMethod === "api_key" ? "Update the Cloudflare API token." : "Reconnect Cloudflare.";
}

function getCloudflareRemediation(
  key: AppCloudflareConnectionAccess["checks"][number]["key"],
  authMethod: "oauth" | "mcp_oauth" | "api_key",
): string {
  switch (key) {
    case "token":
      return getCloudflareCredentialRemediation(authMethod);
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
}: {
  access: AppConvexConnectionAccess | null;
  authMethod: "oauth" | "api_key";
  error: boolean;
  isChecking: boolean;
}) {
  const hasFailedChecks = access?.checks.some((check) => check.status === "error") ?? false;
  const disconnected = access !== null && !access.connected;

  return (
    <div className="space-y-4 text-sm leading-5">
      <ProviderAccessChecks
        access={access}
        definitions={CONVEX_ACCESS_CHECKS}
        isChecking={isChecking}
      />
      {error ? (
        <AuthorizationErrorNotice>
          Could not check Convex access. Reload this page to try again.
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
  authMethod,
  error,
  isChecking,
}: {
  access: AppCloudflareConnectionAccess | null;
  authMethod: "oauth" | "mcp_oauth" | "api_key";
  error: boolean;
  isChecking: boolean;
}) {
  const failedChecks = access?.checks.filter((check) => check.status === "error") ?? [];
  const disconnected = access !== null && !access.connected;
  const scopes = access?.requestedScopes.map(({ scope }) => scope) ?? [];

  return (
    <div className="space-y-4 text-sm leading-5">
      <TechnicalValueList label="Requested OAuth scopes" values={scopes} />
      <ProviderAccessChecks
        access={access}
        definitions={getCloudflareAccessChecks(authMethod)}
        isChecking={isChecking}
      />
      {error ? (
        <AuthorizationErrorNotice>
          Could not check Cloudflare access. Reload this page to try again.
        </AuthorizationErrorNotice>
      ) : disconnected ? (
        <AuthorizationErrorNotice>
          {getCloudflareCredentialRemediation(authMethod)}
        </AuthorizationErrorNotice>
      ) : failedChecks.length > 0 ? (
        <AuthorizationErrorNotice>
          <div className="space-y-1">
            {failedChecks.map((check) => (
              <div key={check.key}>{getCloudflareRemediation(check.key, authMethod)}</div>
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
            {providerRow.details ? <div className="mt-4">{providerRow.details}</div> : null}
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
            variant={action.appearance === "text" ? "link" : "default"}
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
            variant={action.appearance === "text" ? "link" : "default"}
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
  authorizationErrorMessage,
  cloudflareAccess,
  cloudflareAccessError,
  cloudflareApiTokenDialog,
  cloudflareConnection,
  convexAccess,
  convexAccessError,
  convexApiKeyDialog,
  convexConnection,
  disconnectingProvider,
  githubAccess,
  githubAccessError,
  githubUserAuthorization,
  githubUserAuthorizationRequestState,
  isCheckingCloudflareAccess,
  isCheckingConvexAccess,
  isCheckingGitHubAccess,
  isReconnectingGitHubApp,
  organization,
  onConnect,
  onDisconnect,
  onOpenCloudflareApiTokenDialog,
  onOpenConvexApiKeyDialog,
  onAuthorizeGitHubUser,
  onReconnectGitHubApp,
  onRevokeGitHubUser,
  providerDisconnectNotice,
}: ProviderConnectionsPageViewProps) {
  const canManageOrganization = organization.role === "owner";
  const githubManageInstallationUrl =
    organization.githubOwnerType === "organization"
      ? `https://github.com/organizations/${encodeURIComponent(organization.githubOwnerLogin)}/settings/installations`
      : "https://github.com/settings/installations";
  const githubProviderRow: ProviderConnectionRowViewModel = {
    actions: [],
    details: (
      <GitHubInstallationDetails
        access={githubAccess}
        error={githubAccessError}
        githubUserAuthorization={githubUserAuthorization}
        githubUserAuthorizationRequestState={githubUserAuthorizationRequestState}
        isChecking={isCheckingGitHubAccess}
        organization={organization}
        onAuthorizeGitHubUser={onAuthorizeGitHubUser}
        onRevokeGitHubUser={onRevokeGitHubUser}
      />
    ),
    icon: <GitHubProviderLogo />,
    key: "github",
    label: "GitHub",
    menuActions: canManageOrganization
      ? [
          {
            href: githubManageInstallationUrl,
            key: "manage-github-installation",
            label: "Manage installation",
          },
          {
            disabled: isReconnectingGitHubApp,
            isPending: isReconnectingGitHubApp,
            key: "reconnect-github-app",
            label: "Reconnect",
            onClick: onReconnectGitHubApp,
            pendingLabel: "Opening...",
          },
        ]
      : [],
    status: <GitHubOwnerStatus organization={organization} />,
  };
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
          onClick: onOpenConvexApiKeyDialog,
          appearance: "text",
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
    const convexActionsDisabled = disconnectingProvider !== null;
    const convexTeamSlug = convexAccess?.team?.teamSlug ?? convexConnection.teamSlug;
    const convexManageAccessUrl = getConvexManageAccessUrl(
      convexTeamSlug,
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
            onClick: onOpenConvexApiKeyDialog,
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
        />
      ),
      icon: PROVIDER_METADATA.convex.icon,
      key: "convex",
      label: PROVIDER_METADATA.convex.label,
      menuActions: canManageOrganization ? menuActions : [],
      status: (
        <ProviderTargetStatus
          authMethod={convexConnection.authMethod}
          connectedBy={
            convexConnection.authMethod === "oauth"
              ? convexConnection.connectedBy?.label
              : undefined
          }
          href={getConvexTeamUrl(convexTeamSlug)}
          kind="Team"
          name={convexTeamSlug ?? convexConnection.teamId}
        />
      ),
    };
  }

  const cloudflareConnectActions: ProviderConnectionActionViewModel[] = canManageOrganization
    ? [
        {
          disabled: disconnectingProvider !== null,
          key: "oauth",
          label: PROVIDER_METADATA.cloudflare.oauthButtonLabel,
          onClick: () => onConnect("cloudflare"),
        },
        {
          disabled: disconnectingProvider !== null,
          key: "api-token",
          label: "Use API token",
          onClick: onOpenCloudflareApiTokenDialog,
          appearance: "text",
        },
      ]
    : [];
  const getCloudflareCredentialAction = (
    authMethod: "oauth" | "mcp_oauth" | "api_key",
  ): ProviderConnectionActionViewModel =>
    authMethod === "api_key"
      ? {
          disabled: disconnectingProvider !== null,
          key: "update-cloudflare-token",
          label: "Update token",
          onClick: onOpenCloudflareApiTokenDialog,
        }
      : {
          disabled: disconnectingProvider !== null,
          key: "reconnect-cloudflare",
          label: "Reconnect",
          onClick: () => onConnect("cloudflare"),
        };
  let cloudflareProviderRow: ProviderConnectionRowViewModel;
  if (cloudflareConnection?.state === "connected") {
    const cloudflareActionsDisabled = disconnectingProvider !== null;
    const menuActions: ProviderConnectionActionViewModel[] = [
      {
        disabled: cloudflareActionsDisabled,
        href: getCloudflareManageAccessUrl(cloudflareConnection.authMethod),
        key: "manage-cloudflare-access",
        label: "Manage authorization",
      },
      getCloudflareCredentialAction(cloudflareConnection.authMethod),
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
          authMethod={cloudflareConnection.authMethod}
          error={cloudflareAccessError}
          isChecking={isCheckingCloudflareAccess}
        />
      ),
      icon: PROVIDER_METADATA.cloudflare.icon,
      key: "cloudflare",
      label: PROVIDER_METADATA.cloudflare.label,
      menuActions: canManageOrganization ? menuActions : [],
      status: (
        <ProviderTargetStatus
          authMethod={cloudflareConnection.authMethod}
          connectedBy={
            cloudflareConnection.authMethod === "api_key"
              ? undefined
              : cloudflareConnection.connectedBy?.label
          }
          href={getCloudflareAccountUrl(cloudflareConnection.accountId)}
          kind="Account"
          name={cloudflareConnection.accountName}
        />
      ),
    };
  } else if (cloudflareConnection?.state === "disconnected") {
    cloudflareProviderRow = {
      actions: cloudflareConnectActions,
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
          ? cloudflareConnectActions
          : [],
      icon: PROVIDER_METADATA.cloudflare.icon,
      key: "cloudflare",
      label: PROVIDER_METADATA.cloudflare.label,
      status: cloudflareConnection ? "No account configured." : "Loading...",
    };
  }
  const providerRows =
    convexConnection === undefined || cloudflareConnection === undefined
      ? [githubProviderRow]
      : [githubProviderRow, convexProviderRow, cloudflareProviderRow];

  return (
    <div
      data-testid="provider-connections-page"
      className="container flex min-h-0 flex-1 flex-col py-6"
    >
      <h1 className="mb-6 text-xl font-semibold @2xl:text-2xl">Providers</h1>
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
      <div className="max-w-3xl">
        <ProviderConnectionRows providerRows={providerRows} />
      </div>
      {convexApiKeyDialog}
      {cloudflareApiTokenDialog}
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
}: {
  cloudflareConnection: AppCloudflareConnection | undefined;
  organizationId: Id<"organizations"> | null;
  refreshCloudflareMcpTokenIfNeeded: (args: {
    force: false;
    organizationId: Id<"organizations">;
    trigger: CloudflareTokenAutoCheckTrigger;
  }) => Promise<unknown>;
}) {
  const cloudflareAutoCheckInFlightRef = useRef(false);
  const credentialedCloudflareConnection =
    cloudflareConnection?.state === "connected" ? cloudflareConnection : null;

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
      void refreshCloudflareMcpTokenIfNeeded({ organizationId, trigger, force: false })
        .catch((error: unknown) => {
          console.error("Failed to auto-check Cloudflare token:", error);
        })
        .finally(() => {
          releaseRefreshDebounce("cloudflare_token", debounceKey);
          cloudflareAutoCheckInFlightRef.current = false;
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
  const checkGitHubAccess = useAction(api.githubAppAccess.checkViewerInstallation);
  const getGitHubAppReconnectUrl = useMutation(api.githubAppInstallation.getGitHubAppReconnectUrl);
  const getGitHubUserAuthorizationUrl = useMutation(
    api.githubAppInstallation.getGitHubUserAuthorizationUrl,
  );
  const refreshCloudflareMcpTokenIfNeeded = useAction(api.users.refreshCloudflareMcpTokenIfNeeded);
  const connectConvexWithApiKey = useAction(api.users.connectConvexWithApiKey);
  const connectCloudflareWithApiToken = useAction(api.users.connectCloudflareWithApiToken);
  const disconnectConvex = useAction(api.users.disconnectConvex);
  const disconnectCloudflare = useAction(api.users.disconnectCloudflare);
  const revokeGitHubUserAuthorization = useAction(
    api.githubUserAuthorizations.revokeViewerPersonalRepositoryAuthorization,
  );
  const queryClient = useQueryClient();
  const organizationId = organization.organizationId;
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus, {
    organizationId,
  });
  const cloudflareConnection = useConvexQuery(api.users.getCloudflareConnectionStatus, {
    organizationId,
  });
  const githubUserAuthorization = useConvexQuery(
    api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization,
    organization.githubOwnerType === "user" ? { organizationId } : "skip",
  );
  const connectedConvexConnection =
    convexConnection?.state === "connected" ? convexConnection : null;
  const connectedCloudflareConnection =
    cloudflareConnection?.state === "connected" ? cloudflareConnection : null;
  const githubAccessQuery = useQuery({
    queryKey: [
      "organization-provider-access",
      organizationId,
      "github",
      organization.githubOwnerId,
    ],
    queryFn: async () => {
      return await checkGitHubAccess({ organizationId });
    },
    staleTime: PROVIDER_ACCESS_STALE_TIME_MS,
    refetchOnMount: "always",
    retry: 1,
  });
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
    retry: 1,
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
    retry: 1,
  });
  const convexPopupRef = useRef<Window | null>(null);
  const cloudflarePopupRef = useRef<Window | null>(null);
  const convexPopupOriginRef = useRef<string | null>(null);
  const cloudflarePopupOriginRef = useRef<string | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<ProviderKey | null>(null);
  const [providerDisconnectNotice, setProviderDisconnectNotice] = useState<string | null>(null);
  const [isReconnectingGitHubApp, setIsReconnectingGitHubApp] = useState(false);
  const [githubUserAuthorizationRequestState, setGitHubUserAuthorizationRequestState] =
    useState<GitHubUserAuthorizationRequestState>("idle");
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
  const connectCloudflareWithApiTokenAndClearAccess = useCallback(
    async (args: { token: string }) => {
      await connectCloudflareWithApiToken({
        organizationId,
        token: args.token,
      });
      await queryClient.invalidateQueries({
        queryKey: ["organization-provider-access", organizationId, "cloudflare"],
      });
      setProviderDisconnectNotice(null);
    },
    [connectCloudflareWithApiToken, organizationId, queryClient],
  );
  const { openApiKeyDialog: openConvexApiKeyDialog, apiKeyDialog: convexApiKeyDialog } =
    useApiKeyConnectDialog({
      connectWithToken: connectConvexWithApiKeyAndClearAccess,
      provider: "convex",
    });
  const { openApiKeyDialog: openCloudflareApiTokenDialog, apiKeyDialog: cloudflareApiTokenDialog } =
    useApiKeyConnectDialog({
      connectWithToken: connectCloudflareWithApiTokenAndClearAccess,
      provider: "cloudflare",
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
        githubOwnerLogin: organization.githubOwnerLogin,
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
  });

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
          : "Samebase removed its local Cloudflare credential. Revoke the token or authorization in Cloudflare if you also want to remove upstream access.",
      );
    } catch (error) {
      console.error(`Failed to disconnect ${providerMetadata.label}:`, error);
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const handleReconnectGitHubApp = () => {
    if (isReconnectingGitHubApp) {
      return;
    }
    setIsReconnectingGitHubApp(true);
    void openGitHubAppSetupPopup("github-app", async () => {
      return await getGitHubAppReconnectUrl({
        organizationId,
        returnToPath: getCurrentRootRelativeUrl(),
      });
    })
      .catch((error: unknown) => {
        console.error("Failed to start GitHub App reconnect.", {
          errorName: error instanceof Error ? error.name : "unknown",
        });
        toast({
          description: "Could not open GitHub App setup.",
          title: "Could not reconnect GitHub App",
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsReconnectingGitHubApp(false);
      });
  };

  const handleAuthorizeGitHubUser = () => {
    if (githubUserAuthorizationRequestState !== "idle") {
      return;
    }
    setGitHubUserAuthorizationRequestState("authorizing");
    void openGitHubAppSetupPopup("github-user", async () => {
      return await getGitHubUserAuthorizationUrl({
        organizationId,
        returnToPath: getCurrentRootRelativeUrl(),
      });
    })
      .catch((error: unknown) => {
        console.error("Failed to start personal repository authorization.", {
          errorName: error instanceof Error ? error.name : "unknown",
        });
        toast({
          description: "Could not open GitHub authorization.",
          title: "Could not authorize repository creation",
          variant: "destructive",
        });
      })
      .finally(() => {
        setGitHubUserAuthorizationRequestState("idle");
      });
  };

  const handleRevokeGitHubUser = async () => {
    if (githubUserAuthorizationRequestState !== "idle") {
      return;
    }
    setGitHubUserAuthorizationRequestState("revoking");
    try {
      await revokeGitHubUserAuthorization({ organizationId });
    } catch (error) {
      console.error("Failed to revoke personal repository authorization.", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
      toast({
        description: "Could not revoke GitHub authorization.",
        title: "Could not revoke repository creation access",
        variant: "destructive",
      });
    } finally {
      setGitHubUserAuthorizationRequestState("idle");
    }
  };

  return (
    <ProviderConnectionsPageView
      authorizationErrorMessage={authorizationErrorMessage}
      cloudflareAccess={
        cloudflareAccessQuery.error === null ? (cloudflareAccessQuery.data ?? null) : null
      }
      cloudflareAccessError={cloudflareAccessQuery.error !== null}
      cloudflareApiTokenDialog={cloudflareApiTokenDialog}
      cloudflareConnection={cloudflareConnection}
      convexAccess={convexAccessQuery.error === null ? (convexAccessQuery.data ?? null) : null}
      convexAccessError={convexAccessQuery.error !== null}
      convexApiKeyDialog={convexApiKeyDialog}
      convexConnection={convexConnection}
      disconnectingProvider={disconnectingProvider}
      githubAccess={githubAccessQuery.error === null ? (githubAccessQuery.data ?? null) : null}
      githubAccessError={githubAccessQuery.error !== null}
      githubUserAuthorization={githubUserAuthorization}
      githubUserAuthorizationRequestState={githubUserAuthorizationRequestState}
      isCheckingCloudflareAccess={cloudflareAccessQuery.isFetching}
      isCheckingConvexAccess={convexAccessQuery.isFetching}
      isCheckingGitHubAccess={githubAccessQuery.isFetching}
      isReconnectingGitHubApp={isReconnectingGitHubApp}
      organization={organization}
      onConnect={(provider) => {
        void handleConnect(provider);
      }}
      onDisconnect={(provider) => {
        void handleDisconnect(provider);
      }}
      onOpenCloudflareApiTokenDialog={openCloudflareApiTokenDialog}
      onOpenConvexApiKeyDialog={openConvexApiKeyDialog}
      onAuthorizeGitHubUser={handleAuthorizeGitHubUser}
      onReconnectGitHubApp={handleReconnectGitHubApp}
      onRevokeGitHubUser={() => {
        void handleRevokeGitHubUser();
      }}
      providerDisconnectNotice={providerDisconnectNotice}
    />
  );
}
