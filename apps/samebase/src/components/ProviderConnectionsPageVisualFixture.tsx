import {
  ProviderConnectionsPageView,
  type ProviderConnectionsPageConnectionState,
} from "@/components/ProviderConnectionsPage";
import { formatAuthorizationErrorMessage } from "@/lib/authorizationErrorMessage";
import type { Id } from "../../convex/_generated/dataModel";

export type ProviderConnectionsPageVisualMode =
  | "providers-page-connected"
  | "providers-page-authorization-error"
  | "providers-page-loading"
  | "providers-page-recovery";

const PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW = Date.UTC(2026, 5, 22, 12, 0, 0);

function fakeOrganizationId(): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "organization_acme";
}

const ORGANIZATION_ID = fakeOrganizationId();

const AUTHORIZATION_ERROR_MESSAGE = formatAuthorizationErrorMessage(
  { provider: "cloudflare", code: "target-mismatch" },
  { cloudflareAccountName: "Acme Production" },
);

const connectedState = {
  cloudflareAccess: {
    authMethod: "oauth",
    checkedAt: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW - 4 * 60_000,
    checks: [
      {
        key: "token",
        label: "OAuth token",
        message:
          "Stored OAuth token metadata says the token is valid until 2026-06-22T14:00:00.000Z. Live probes below verify current Cloudflare access.",
        status: "ok",
      },
      {
        key: "accounts",
        label: "Accounts",
        message: "Probe GET /accounts confirmed the connected account: Acme Production.",
        status: "ok",
      },
      {
        key: "workers",
        label: "Workers",
        message:
          "Probe GET /accounts/{account_id}/workers/account-settings succeeded for Acme Production.",
        status: "ok",
      },
      {
        key: "workers_builds",
        label: "Workers Builds",
        message:
          "Cloudflare denied Workers Builds limits. Reconnect Cloudflare and approve Workers Builds access.",
        status: "error",
      },
    ],
    connected: true,
    requestedScopes: [
      { label: "Read account metadata", scope: "account-settings.read" },
      { label: "Read Workers Builds", scope: "workers-ci.read" },
      { label: "Manage Workers Builds", scope: "workers-ci.write" },
      { label: "Read Workers", scope: "workers-scripts.read" },
      { label: "Manage Workers", scope: "workers-scripts.write" },
      { label: "Refresh access without reconnecting", scope: "offline_access" },
    ],
  },
  cloudflareConnection: {
    accountId: "cloudflare-account-production",
    accountName: "Acme Production",
    authMethod: "oauth",
    state: "connected",
  },
  convexAccess: {
    authMethod: "api_key",
    checkedAt: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW - 6 * 60_000,
    checks: [
      {
        key: "token",
        label: "Token details",
        message: "Probe GET /token_details returned team token Acme deployment token.",
        status: "ok",
      },
      {
        key: "projects",
        label: "Projects",
        message: "Probe GET /teams/{team_id}/projects returned 3 visible projects.",
        status: "ok",
      },
      {
        key: "deployments",
        label: "Deployments",
        message: "Probe GET /teams/{team_id}/list_deployments returned 5 visible deployments.",
        status: "ok",
      },
    ],
    connected: true,
    requestedAccess: [{ key: "team", label: "Team-scoped Convex Management API access" }],
    team: {
      teamId: "team_acme_platform",
      teamSlug: "acme-platform",
    },
    token: {
      createdAt: Date.UTC(2026, 5, 1, 9, 30, 0),
      id: "token_acme_provider",
      name: "Acme deployment token",
      teamId: "team_acme_platform",
      type: "team_token",
    },
  },
  convexConnection: {
    authMethod: "api_key",
    state: "connected",
    teamId: "team_acme_platform",
    teamSlug: "acme-platform",
  },
  now: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW,
} satisfies ProviderConnectionsPageConnectionState;

const recoveryState = {
  cloudflareAccess: null,
  cloudflareConnection: {
    authMethod: "oauth",
    state: "selection_required",
  },
  convexAccess: null,
  convexConnection: {
    state: "disconnected",
    teamId: "team_acme_platform",
    teamSlug: "acme-platform",
  },
  now: Date.UTC(2026, 7, 7, 12, 0, 0),
} satisfies ProviderConnectionsPageConnectionState;

const noop = () => {};

export function ProviderConnectionsPageVisualFixture({
  mode = "providers-page-connected",
}: {
  mode?: ProviderConnectionsPageVisualMode;
}) {
  const isLoading = mode === "providers-page-loading";
  const state = mode === "providers-page-recovery" ? recoveryState : connectedState;

  return (
    <ProviderConnectionsPageView
      apiKeyDialog={null}
      authorizationErrorMessage={
        mode === "providers-page-authorization-error" ? AUTHORIZATION_ERROR_MESSAGE : null
      }
      canRefresh={!isLoading && mode !== "providers-page-recovery"}
      cloudflareAccess={isLoading ? null : state.cloudflareAccess}
      cloudflareAccessError={false}
      cloudflareAccountDialog={{
        error: null,
        isLoadingAccounts: false,
        isOpen: false,
        isSubmitting: false,
        options: [],
        selectedAccountId: "",
      }}
      cloudflareConnection={isLoading ? undefined : state.cloudflareConnection}
      convexAccess={isLoading ? null : state.convexAccess}
      convexAccessError={false}
      convexConnection={isLoading ? undefined : state.convexConnection}
      disconnectingProvider={null}
      isAutoCheckingCloudflareToken={false}
      isCheckingCloudflareAccess={false}
      isCheckingConvexAccess={false}
      isRefreshing={false}
      now={state.now}
      organization={{
        canCreateRepository: true,
        githubOwnerId: "456",
        githubOwnerLogin: "acme",
        githubOwnerType: "organization",
        organizationId: ORGANIZATION_ID,
        role: "owner",
      }}
      onCloudflareAccountChange={noop}
      onCloudflareAccountOpenChange={noop}
      onCloudflareAccountSubmit={noop}
      onConnect={noop}
      onDisconnect={noop}
      onOpenApiKeyDialog={noop}
      onOpenCloudflareAccountDialog={noop}
      onRefresh={noop}
      providerDisconnectNotice={null}
    />
  );
}
