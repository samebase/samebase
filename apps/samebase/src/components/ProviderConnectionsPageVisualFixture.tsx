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
    checks: [
      {
        key: "token",
        status: "ok",
      },
      {
        key: "accounts",
        status: "ok",
      },
      {
        key: "workers",
        status: "ok",
      },
      {
        key: "workers_builds",
        status: "error",
      },
    ],
    connected: true,
    requestedScopes: [
      { scope: "account-settings.read" },
      { scope: "workers-ci.read" },
      { scope: "workers-ci.write" },
      { scope: "workers-scripts.read" },
      { scope: "workers-scripts.write" },
      { scope: "offline_access" },
    ],
  },
  cloudflareConnection: {
    accountId: "cloudflare-account-production",
    accountName: "Acme Production",
    authMethod: "oauth",
    connectedBy: { kind: "displayName", label: "Ava Chen" },
    state: "connected",
  },
  convexAccess: {
    checks: [
      {
        key: "token",
        status: "ok",
      },
      {
        key: "projects",
        status: "ok",
      },
      {
        key: "deployments",
        status: "ok",
      },
    ],
    connected: true,
    team: {
      teamSlug: "acme-platform",
    },
  },
  convexConnection: {
    authMethod: "oauth",
    connectedBy: { kind: "displayName", label: "Ava Chen" },
    state: "connected",
    teamId: "team_acme_platform",
  },
  githubAccess: {
    checks: [
      {
        key: "repositories",
        status: "ok",
      },
      {
        key: "installation",
        status: "ok",
      },
    ],
    permissions: [
      { access: "write", key: "administration" },
      { access: "read", key: "checks" },
      { access: "write", key: "contents" },
      { access: "read", key: "members" },
      { access: "read", key: "metadata" },
      { access: "write", key: "pull_requests" },
      { access: "read", key: "statuses" },
      { access: "write", key: "workflows" },
    ],
    repositorySelection: "all",
    status: "connected",
  },
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
  githubAccess: connectedState.githubAccess,
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
      githubAccess={isLoading ? null : state.githubAccess}
      githubAccessError={false}
      isCheckingCloudflareAccess={false}
      isCheckingConvexAccess={false}
      isCheckingGitHubAccess={isLoading}
      isReconnectingGitHubApp={false}
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
      onReconnectGitHubApp={noop}
      providerDisconnectNotice={null}
    />
  );
}
