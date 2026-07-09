import {
  ProviderConnectionsPageView,
  type ProviderConnectionsPageConnectionState,
} from "@/components/ProviderConnectionsPage";

export type ProviderConnectionsPageVisualMode = "providers-page-connected";

const PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW = Date.UTC(2026, 5, 22, 12, 0, 0);
const PROVIDER_CONNECTIONS_VISUAL_FIXTURE_GITHUB_MANAGE_URL =
  "https://github.com/settings/connections/applications/samebase-local-fixture";

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
        message: "Probe GET /teams/{team_id}/list_projects returned 3 visible projects.",
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
  githubHealth: {
    authMethod: "oauth",
    checkedAt: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW - 8 * 60_000,
    checks: [
      {
        key: "profile",
        label: "Profile",
        message: "Authenticated as octo-operator.",
        status: "ok",
      },
      {
        key: "repositories",
        label: "Repository listing",
        message:
          "GitHub could not list repositories for this credential. Reauthorize GitHub and approve organization access if prompted.",
        status: "error",
      },
      {
        key: "organizations",
        label: "Organization access",
        message: "GitHub returned 2 organizations visible to this credential.",
        status: "ok",
      },
    ],
    connected: true,
    grantedScopes: ["repo", "user", "read:org"],
    manageUrl: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_GITHUB_MANAGE_URL,
    organizations: [
      {
        canCreateRepository: false,
        login: "acme-product",
        role: "member",
      },
      {
        canCreateRepository: true,
        login: "samebase",
        role: "admin",
      },
    ],
    reauthorizeAvailable: true,
    requiredScopes: [
      {
        label: "List and edit repositories",
        scope: "repo",
        status: "granted",
      },
      {
        label: "Delete Samebase-managed repositories",
        scope: "delete_repo",
        status: "missing",
      },
      {
        label: "Read GitHub profile",
        scope: "user",
        status: "granted",
      },
      {
        label: "Read GitHub email addresses",
        scope: "user:email",
        status: "granted",
      },
      {
        label: "Read organization memberships",
        scope: "read:org",
        status: "granted",
      },
      {
        label: "Read packages",
        scope: "read:packages",
        status: "missing",
      },
    ],
    username: "octo-operator",
  },
  githubProviderSummary: {
    authMethod: "oauth",
    connected: true,
    manageUrl: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_GITHUB_MANAGE_URL,
    reauthorizeAvailable: true,
    requiredScopes: [
      {
        label: "List and edit repositories",
        scope: "repo",
      },
      {
        label: "Delete Samebase-managed repositories",
        scope: "delete_repo",
      },
      {
        label: "Read GitHub profile",
        scope: "user",
      },
      {
        label: "Read GitHub email addresses",
        scope: "user:email",
      },
      {
        label: "Read organization memberships",
        scope: "read:org",
      },
      {
        label: "Read packages",
        scope: "read:packages",
      },
    ],
    username: "octo-operator",
  },
  now: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW,
} satisfies ProviderConnectionsPageConnectionState;

const noop = () => {};

export function ProviderConnectionsPageVisualFixture() {
  return (
    <ProviderConnectionsPageView
      apiKeyDialog={null}
      cloudflareAccess={providerConnectionsVisualFixtureState.cloudflareAccess}
      cloudflareAccessError={null}
      cloudflareAccountDialog={{
        error: null,
        isLoadingAccounts: false,
        isOpen: false,
        isSubmitting: false,
        options: [],
        selectedAccountId: "",
      }}
      cloudflareConnection={providerConnectionsVisualFixtureState.cloudflareConnection}
      convexAccess={providerConnectionsVisualFixtureState.convexAccess}
      convexAccessError={null}
      convexConnection={providerConnectionsVisualFixtureState.convexConnection}
      disconnectingProvider={null}
      githubDisconnectedNotice={null}
      githubHealth={providerConnectionsVisualFixtureState.githubHealth}
      githubHealthError={null}
      githubProviderSummary={providerConnectionsVisualFixtureState.githubProviderSummary}
      isAutoCheckingCloudflareToken={false}
      isCheckingCloudflareAccess={false}
      isCheckingConvexAccess={false}
      isCheckingGithubAccess={false}
      isReauthorizingGithub={false}
      mcpGrantError={null}
      mcpGrants={[
        {
          clientId: "mcpc_codex_local_fixture",
          clientName: "Codex",
          createdAt: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW - 10 * 24 * 60 * 60_000,
          grantId: "mcpg_codex_local_fixture",
          lastUsedAt: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW - 2 * 60_000,
          resource: "https://api.samebase.com/mcp",
          scopes: ["access_dashboard", "access_browser_login_handoff"],
        },
        {
          clientId: "mcpc_cli_local_fixture",
          createdAt: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW - 24 * 60 * 60_000,
          grantId: "mcpg_cli_local_fixture",
          resource: "https://api.samebase.com/mcp",
          scopes: ["access_dashboard"],
        },
      ]}
      mcpGrantPaginationStatus="Exhausted"
      now={providerConnectionsVisualFixtureState.now}
      onCheckCloudflareAccess={noop}
      onCheckConvexAccess={noop}
      onCheckGithubAccess={noop}
      onCloudflareAccountChange={noop}
      onCloudflareAccountOpenChange={noop}
      onCloudflareAccountSubmit={noop}
      onConnect={noop}
      onDisconnect={noop}
      onLoadMoreMcpGrants={noop}
      onOpenApiKeyDialog={noop}
      onOpenCloudflareAccountDialog={noop}
      onReauthorizeGithub={noop}
      onRevokeMcpGrant={noop}
      revokingMcpGrantId={null}
    />
  );
}
