import {
  ProviderConnectionsPageView,
  type ProviderConnectionsPageConnectionState,
} from "@/components/ProviderConnectionsPage";
import type { Id } from "../../convex/_generated/dataModel";

export type ProviderConnectionsPageVisualMode =
  | "providers-page-connected"
  | "providers-page-loading";

const PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW = Date.UTC(2026, 5, 22, 12, 0, 0);

function fakeOrganizationId(): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return "organization_samebase";
}

const PROVIDER_CONNECTIONS_VISUAL_FIXTURE_ORGANIZATION_ID = fakeOrganizationId();

const providerConnectionsVisualFixtureState = {
  cloudflareAccess: {
    accounts: [
      {
        accountId: "cloudflare-account-1",
        accountName: "Samebase Preview",
        selected: true,
      },
      {
        accountId: "cloudflare-account-2",
        accountName: "Acme Product",
        selected: false,
      },
    ],
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
        message: "Probe GET /accounts returned 2 visible accounts.",
        status: "ok",
      },
      {
        key: "selected_account",
        label: "Selected account",
        message:
          "The Accounts probe returned selected account Samebase Preview (cloudflare-account-1).",
        status: "ok",
      },
      {
        key: "workers",
        label: "Workers",
        message:
          "Probe GET /accounts/{account_id}/workers/account-settings succeeded for Samebase Preview.",
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
      {
        label: "Read account metadata",
        scope: "account-settings.read",
      },
      {
        label: "Read Workers Builds",
        scope: "workers-ci.read",
      },
      {
        label: "Manage Workers Builds",
        scope: "workers-ci.write",
      },
      {
        label: "Read Workers",
        scope: "workers-scripts.read",
      },
      {
        label: "Manage Workers",
        scope: "workers-scripts.write",
      },
      {
        label: "Refresh access without reconnecting",
        scope: "offline_access",
      },
    ],
  },
  cloudflareConnection: {
    accountId: "cloudflare-account-1",
    accountName: "Samebase Preview",
    authMethod: "oauth",
    connected: true,
  },
  convexConnection: {
    authMethod: "api_key",
    connected: true,
    teamId: "team_samebase",
    teamSlug: "samebase",
  },
  convexAccess: {
    authMethod: "api_key",
    checkedAt: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW - 6 * 60_000,
    checks: [
      {
        key: "token",
        label: "Token details",
        message: "Probe GET /token_details returned team token Samebase operator token.",
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
    requestedAccess: [
      {
        key: "team",
        label: "Team-scoped Convex Management API access",
      },
    ],
    team: {
      teamId: "team_samebase",
      teamSlug: "samebase",
    },
    token: {
      createdAt: Date.UTC(2026, 5, 1, 9, 30, 0),
      id: "token_samebase_provider",
      name: "Samebase operator token",
      teamId: "team_samebase",
      type: "team_token",
    },
  },
  now: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW,
} satisfies ProviderConnectionsPageConnectionState;

const noop = () => {};

export function ProviderConnectionsPageVisualFixture({
  mode = "providers-page-connected",
}: {
  mode?: ProviderConnectionsPageVisualMode;
}) {
  const isLoading = mode === "providers-page-loading";
  return (
    <ProviderConnectionsPageView
      apiKeyDialog={null}
      cloudflareAccess={isLoading ? null : providerConnectionsVisualFixtureState.cloudflareAccess}
      cloudflareAccessError={null}
      cloudflareAccountDialog={{
        error: null,
        isLoadingAccounts: false,
        isOpen: false,
        isSubmitting: false,
        options: [],
        selectedAccountId: "",
      }}
      cloudflareConnection={
        isLoading ? undefined : providerConnectionsVisualFixtureState.cloudflareConnection
      }
      convexAccess={isLoading ? null : providerConnectionsVisualFixtureState.convexAccess}
      convexAccessError={null}
      convexConnection={
        isLoading ? undefined : providerConnectionsVisualFixtureState.convexConnection
      }
      disconnectingProvider={null}
      isAutoCheckingCloudflareToken={false}
      isCheckingCloudflareAccess={false}
      isCheckingConvexAccess={false}
      now={providerConnectionsVisualFixtureState.now}
      organization={{
        canCreateRepository: true,
        githubOwnerId: "456",
        githubOwnerLogin: "samebase",
        githubOwnerType: "organization",
        organizationId: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_ORGANIZATION_ID,
        role: "owner",
      }}
      onCheckCloudflareAccess={noop}
      onCheckConvexAccess={noop}
      onCloudflareAccountChange={noop}
      onCloudflareAccountOpenChange={noop}
      onCloudflareAccountSubmit={noop}
      onConnect={noop}
      onDisconnect={noop}
      onOpenApiKeyDialog={noop}
      onOpenCloudflareAccountDialog={noop}
    />
  );
}
