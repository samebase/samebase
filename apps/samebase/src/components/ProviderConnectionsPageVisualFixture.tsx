import {
  ProviderConnectionsPage,
  type ProviderConnectionsPageMockConnectionState,
} from "@/components/ProviderConnectionsPage";

export type ProviderConnectionsPageVisualMode = "providers-page-connected";

const PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW = Date.UTC(2026, 5, 22, 12, 0, 0);
const PROVIDER_CONNECTIONS_VISUAL_FIXTURE_GITHUB_MANAGE_URL =
  "https://github.com/settings/connections/applications/samebase-local-fixture";

const providerConnectionsVisualFixtureState = {
  cloudflareConnection: {
    accountId: "cloudflare-account-1",
    accountName: "Samebase Preview",
    authMethod: "mcp_oauth",
    connected: true,
    mcpTokenCheckedAt: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW - 3 * 60_000,
    mcpTokenExpiresAt: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW + 60 * 60_000,
    mcpTokenNextAutoCheckAt: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW + 30 * 60_000,
    mcpTokenStatus: "valid",
  },
  convexConnection: {
    authMethod: "api_key",
    connected: true,
    teamId: "team_samebase",
    teamSlug: "samebase",
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
        message: "Some organization repositories are not visible to this OAuth grant.",
        status: "error",
      },
    ],
    connected: true,
    grantedScopes: ["repo"],
    manageUrl: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_GITHUB_MANAGE_URL,
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
    ],
    username: "octo-operator",
  },
  now: PROVIDER_CONNECTIONS_VISUAL_FIXTURE_NOW,
} satisfies ProviderConnectionsPageMockConnectionState;

export function ProviderConnectionsPageVisualFixture() {
  return <ProviderConnectionsPage mockConnectionState={providerConnectionsVisualFixtureState} />;
}
