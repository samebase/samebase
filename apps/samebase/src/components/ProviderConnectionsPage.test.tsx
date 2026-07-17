// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { ProviderConnectionsPage } from "./ProviderConnectionsPage";
import { ProviderConnectionsPageVisualFixture } from "./ProviderConnectionsPageVisualFixture";

const { act } = React;

const queryState = vi.hoisted(() => ({
  handlersByFunctionName: new Map<string, (args?: unknown) => Promise<unknown>>(),
  mcpGrants: {
    loadMore: vi.fn(),
    results: new Array<unknown>(),
    status: "Exhausted",
  },
  resultsByQueryName: new Map<string, unknown>(),
}));

function createAsyncHandler() {
  return vi.fn(() => Promise.resolve(undefined));
}

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useAction: (action: Parameters<typeof actual.useAction>[0]) => {
      return queryState.handlersByFunctionName.get(getFunctionName(action)) ?? createAsyncHandler();
    },
    useMutation: (mutation: Parameters<typeof actual.useMutation>[0]) => {
      return (
        queryState.handlersByFunctionName.get(getFunctionName(mutation)) ?? createAsyncHandler()
      );
    },
    usePaginatedQuery: () => queryState.mcpGrants,
    useQuery: (query: Parameters<typeof actual.useQuery>[0]) => {
      const queryName = getFunctionName(query);
      return queryState.resultsByQueryName.get(queryName);
    },
  };
});

vi.mock("@/authClient", () => ({
  isInIframe: () => false,
}));

vi.mock("@/components/ApiKeyConnectDialog", () => ({
  useApiKeyConnectDialog: () => ({
    apiKeyDialog: null,
    openApiKeyDialog: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();

  return {
    ...actual,
    useLocation: () => ({
      href: "/providers",
      pathname: "/providers",
      searchStr: "",
    }),
  };
});

function renderProviderConnectionsPage(queryResults: ReadonlyMap<string, unknown>) {
  queryState.resultsByQueryName = new Map(queryResults);

  return renderToStaticMarkup(<ProviderConnectionsPage />);
}

let mountedRootElement: HTMLDivElement | null = null;
let mountedRoot: Root | null = null;

function renderMountedProviderConnectionsPage(queryResults: ReadonlyMap<string, unknown>) {
  queryState.resultsByQueryName = new Map(queryResults);
  mountedRootElement = document.createElement("div");
  document.body.append(mountedRootElement);
  mountedRoot = createRoot(mountedRootElement);

  act(() => {
    mountedRoot?.render(<ProviderConnectionsPage />);
  });

  return mountedRootElement;
}

function findButtonByText(container: HTMLElement, text: string) {
  return [...container.querySelectorAll("button")].find((button) =>
    button.textContent.includes(text),
  );
}

describe("ProviderConnectionsPage", () => {
  beforeEach(() => {
    queryState.handlersByFunctionName = new Map();
    queryState.mcpGrants = {
      loadMore: vi.fn(),
      results: [],
      status: "Exhausted",
    };
    queryState.resultsByQueryName = new Map();
  });

  afterEach(() => {
    if (mountedRoot !== null) {
      const root = mountedRoot;
      act(() => {
        root.unmount();
      });
      mountedRoot = null;
    }

    mountedRootElement?.remove();
    mountedRootElement = null;
  });

  it("renders disconnected provider connection actions", () => {
    const markup = renderProviderConnectionsPage(
      new Map([
        [
          getFunctionName(api.users.getGithubProviderSummary),
          {
            connected: false,
            requiredScopes: [],
            reauthorizeAvailable: false,
          },
        ],
        [getFunctionName(api.users.getConvexConnectionStatus), { connected: false }],
        [getFunctionName(api.users.getCloudflareConnectionStatus), { connected: false }],
        [getFunctionName(api.users.viewer), { _id: "user_123" }],
      ]),
    );

    expect(markup).toContain("Providers");
    expect(markup).toContain("GitHub OAuth");
    expect(markup).toContain("Convex OAuth");
    expect(markup).toContain("Cloudflare OAuth");
    expect(markup).toContain("Use API key");
  });

  it("renders connected provider statuses and management actions", () => {
    const markup = renderProviderConnectionsPage(
      new Map([
        [
          getFunctionName(api.users.getGithubProviderSummary),
          {
            authMethod: "oauth",
            connected: true,
            manageUrl: "https://github.com/settings/connections/applications/client_123",
            requiredScopes: [
              { scope: "repo", label: "List and edit repositories" },
              { scope: "delete_repo", label: "Delete Samebase-managed repositories" },
            ],
            reauthorizeAvailable: true,
            username: "samebase",
          },
        ],
        [
          getFunctionName(api.users.getConvexConnectionStatus),
          {
            authMethod: "api_key",
            connected: true,
            teamSlug: "samebase",
          },
        ],
        [
          getFunctionName(api.users.getCloudflareConnectionStatus),
          {
            accountId: "account_123",
            accountName: "samebase",
            authMethod: "oauth",
            connected: true,
          },
        ],
        [getFunctionName(api.users.viewer), { _id: "user_123" }],
      ]),
    );

    expect(markup).toContain("Connected as samebase");
    expect(markup).toContain("Required access");
    expect(markup).toContain("repo Unknown");
    expect(markup).toContain("delete_repo Unknown");
    expect(markup).toContain("Granted scopes: Not checked");
    expect(markup).toContain(
      "Need more org access? Reauthorize revokes the current GitHub grant before opening OAuth again; closing the OAuth window leaves GitHub disconnected until you reconnect.",
    );
    expect(markup).toContain("Check access");
    expect(markup).toContain("Manage access");
    expect(markup).toContain("Reauthorize");
    expect(markup).toContain("Connected to samebase");
    expect(markup).toContain("Team-scoped Convex Management API access");
    expect(markup).toContain("Run Check access to verify token details and live Convex access.");
    expect(markup).toContain("https://dashboard.convex.dev/t/samebase/settings");
    expect(markup).toContain("Update token");
    expect(markup).toContain("Connected (OAuth).");
    expect(markup).toContain("Manage account");
    expect(markup).toContain(
      "Run Check access to see the OAuth scopes Samebase requested from Cloudflare.",
    );
    expect(markup).toContain("Reconnect");
    expect(markup).not.toContain("Token Valid.");
    expect(markup).not.toContain("Check token");
    expect(markup).toContain("Disconnect");
  });

  it("renders the provider page visual fixture from mock connection state", () => {
    const markup = renderToStaticMarkup(<ProviderConnectionsPageVisualFixture />);

    expect(markup).toContain("Connected as octo-operator");
    expect(markup).toContain("delete_repo Missing");
    expect(markup).toContain("samebase · Admin · Can create repos");
    expect(markup).toContain("acme-product · Member · No repo creation");
    expect(markup.indexOf("acme-product")).toBeLessThan(markup.indexOf("samebase"));
    expect(markup).toContain("Repository listing: Needs attention");
    expect(markup).toContain(
      "GitHub could not list repositories for this credential. Reauthorize GitHub and approve organization access if prompted.",
    );
    expect(markup).toContain("Connected to samebase");
    expect(markup).toContain("Team token. Name Samebase operator token.");
    expect(markup).toContain("Projects: OK");
    expect(markup).toContain("Deployments: OK");
    expect(markup).toContain("Connected (OAuth). Account Samebase Preview.");
    expect(markup).toContain("account-settings.read");
    expect(markup).toContain("Samebase Preview (cloudflare-account-1) · Selected");
    expect(markup).toContain("Workers Builds: Needs attention");
    expect(markup).toContain(
      "Cloudflare denied Workers Builds limits. Reconnect Cloudflare and approve Workers Builds access.",
    );
    expect(markup).toContain("MCP clients");
    expect(markup).toContain("Codex");
    expect(markup).toContain("mcpc_cli_local_fixture");
    expect(markup).toContain("access_browser_login_handoff");
    expect(markup).toContain("https://api.samebase.com/mcp");
    expect(markup).toContain("Revoke");
  });

  it("revokes an MCP client grant with a disabled pending action", async () => {
    let finishRevoke: (() => void) | undefined;
    const revokeMcpGrant = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRevoke = resolve;
        }),
    );
    queryState.handlersByFunctionName.set(
      getFunctionName(api.mcp.grants.revokeCurrentUserGrant),
      revokeMcpGrant,
    );
    queryState.mcpGrants = {
      loadMore: vi.fn(),
      results: [
        {
          clientId: "mcpc_codex",
          clientName: "Codex",
          createdAt: 1,
          grantId: "mcpg_codex",
          lastUsedAt: 2,
          resource: "https://api.samebase.com/mcp",
          scopes: ["access_dashboard"],
        },
      ],
      status: "Exhausted",
    };
    const container = renderMountedProviderConnectionsPage(
      new Map([
        [getFunctionName(api.users.getGithubProviderSummary), { connected: false }],
        [getFunctionName(api.users.getConvexConnectionStatus), { connected: false }],
        [getFunctionName(api.users.getCloudflareConnectionStatus), { connected: false }],
        [getFunctionName(api.users.viewer), { _id: "user_123" }],
      ]),
    );

    const revokeButton = findButtonByText(container, "Revoke");
    expect(revokeButton).toBeDefined();
    await act(async () => revokeButton?.click());

    expect(revokeMcpGrant).toHaveBeenCalledWith({ grantId: "mcpg_codex" });
    expect(revokeButton?.disabled).toBe(true);
    expect(revokeButton?.textContent).toContain("Revoking...");

    await act(async () => finishRevoke?.());
    expect(revokeButton?.disabled).toBe(false);
  });

  it("shows an MCP grant revocation failure without removing the connection", async () => {
    queryState.handlersByFunctionName.set(
      getFunctionName(api.mcp.grants.revokeCurrentUserGrant),
      vi.fn(() => Promise.reject(new Error("Revoke failed"))),
    );
    queryState.mcpGrants = {
      loadMore: vi.fn(),
      results: [
        {
          clientId: "mcpc_codex",
          clientName: "Codex",
          createdAt: 1,
          grantId: "mcpg_codex",
          resource: "https://api.samebase.com/mcp",
          scopes: ["access_dashboard"],
        },
      ],
      status: "Exhausted",
    };
    const container = renderMountedProviderConnectionsPage(
      new Map([
        [getFunctionName(api.users.getGithubProviderSummary), { connected: false }],
        [getFunctionName(api.users.getConvexConnectionStatus), { connected: false }],
        [getFunctionName(api.users.getCloudflareConnectionStatus), { connected: false }],
        [getFunctionName(api.users.viewer), { _id: "user_123" }],
      ]),
    );

    await act(async () => findButtonByText(container, "Revoke")?.click());
    expect(container.textContent).toContain("Revoke failed");
    expect(container.querySelector('[data-grant-id="mcpg_codex"]')).not.toBeNull();
  });

  it("renders GitHub API key connections without OAuth scope wording", () => {
    const markup = renderProviderConnectionsPage(
      new Map([
        [
          getFunctionName(api.users.getGithubProviderSummary),
          {
            authMethod: "api_key",
            connected: true,
            requiredScopes: [
              { scope: "repo", label: "List and edit repositories" },
              { scope: "delete_repo", label: "Delete Samebase-managed repositories" },
            ],
            reauthorizeAvailable: false,
            username: "samebase",
          },
        ],
        [getFunctionName(api.users.getConvexConnectionStatus), { connected: false }],
        [getFunctionName(api.users.getCloudflareConnectionStatus), { connected: false }],
        [getFunctionName(api.users.viewer), { _id: "user_123" }],
      ]),
    );

    expect(markup).toContain("Connected as samebase");
    expect(markup).toContain("Repository access is checked with live GitHub requests.");
    expect(markup).not.toContain("OAuth scopes requested");
    expect(markup).not.toContain("Reauthorize");
  });

  it("runs the GitHub access check and renders live health rows", async () => {
    const checkGithubConnectionHealth = vi.fn(async () => ({
      authMethod: "oauth",
      checkedAt: Date.now(),
      checks: [
        {
          key: "profile",
          label: "Profile",
          message: "Authenticated as samebase.",
          status: "ok",
        },
        {
          key: "repositories",
          label: "Repository listing",
          message: "GitHub denied this request. Check org approval, SSO, or rate limits.",
          status: "error",
        },
        {
          key: "organizations",
          label: "Organization access",
          message: "GitHub returned 1 organization visible to this credential.",
          status: "ok",
        },
      ],
      connected: true,
      grantedScopes: ["repo"],
      organizations: [
        {
          canCreateRepository: true,
          login: "samebase",
          role: "admin",
        },
      ],
      reauthorizeAvailable: true,
      requiredScopes: [
        { scope: "repo", label: "List and edit repositories", status: "granted" },
        {
          scope: "delete_repo",
          label: "Delete Samebase-managed repositories",
          status: "missing",
        },
      ],
      username: "samebase",
    }));
    queryState.handlersByFunctionName.set(
      getFunctionName(api.users.checkGithubConnectionHealth),
      checkGithubConnectionHealth,
    );
    const container = renderMountedProviderConnectionsPage(
      new Map([
        [
          getFunctionName(api.users.getGithubProviderSummary),
          {
            authMethod: "oauth",
            connected: true,
            requiredScopes: [
              { scope: "repo", label: "List and edit repositories" },
              { scope: "delete_repo", label: "Delete Samebase-managed repositories" },
            ],
            reauthorizeAvailable: true,
            username: "samebase",
          },
        ],
        [getFunctionName(api.users.getConvexConnectionStatus), { connected: false }],
        [getFunctionName(api.users.getCloudflareConnectionStatus), { connected: false }],
        [getFunctionName(api.users.viewer), { _id: "user_123" }],
      ]),
    );
    const checkAccessButton = findButtonByText(container, "Check access");
    if (!checkAccessButton) {
      throw new Error("Expected Check access button.");
    }

    await act(async () => {
      checkAccessButton.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      await Promise.resolve();
    });

    expect(checkGithubConnectionHealth).toHaveBeenCalledWith({});
    expect(container.textContent).toContain("repo Granted");
    expect(container.textContent).toContain("delete_repo Missing");
    expect(container.textContent).toContain("samebase · Admin");
    expect(container.textContent).toContain("Profile: OK - Authenticated as samebase.");
    expect(container.textContent).toContain(
      "Repository listing: Needs attention - GitHub denied this request. Check org approval, SSO, or rate limits.",
    );
    expect(container.textContent).toContain(
      "Organization access: OK - GitHub returned 1 organization visible to this credential.",
    );
  });

  it("runs the Convex access check and renders live token probes", async () => {
    const checkConvexConnectionAccess = vi.fn(async () => ({
      authMethod: "oauth",
      checkedAt: Date.now(),
      checks: [
        {
          key: "token",
          label: "Token details",
          message: "Probe GET /token_details returned team token Samebase OAuth grant.",
          status: "ok",
        },
        {
          key: "projects",
          label: "Projects",
          message: "Probe GET /teams/{team_id}/projects returned 2 visible projects.",
          status: "ok",
        },
        {
          key: "deployments",
          label: "Deployments",
          message: "Probe GET /teams/{team_id}/list_deployments returned 4 visible deployments.",
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
        id: "token_123",
        name: "Samebase OAuth grant",
        teamId: "team_samebase",
        type: "team_token",
      },
    }));
    queryState.handlersByFunctionName.set(
      getFunctionName(api.convexProviderAccess.checkConvexConnectionAccess),
      checkConvexConnectionAccess,
    );
    const container = renderMountedProviderConnectionsPage(
      new Map([
        [
          getFunctionName(api.users.getGithubProviderSummary),
          {
            connected: false,
            requiredScopes: [],
            reauthorizeAvailable: false,
          },
        ],
        [
          getFunctionName(api.users.getConvexConnectionStatus),
          {
            authMethod: "oauth",
            connected: true,
            teamId: "team_samebase",
            teamSlug: "samebase",
          },
        ],
        [getFunctionName(api.users.getCloudflareConnectionStatus), { connected: false }],
        [getFunctionName(api.users.viewer), { _id: "user_123" }],
      ]),
    );
    const checkAccessButton = findButtonByText(container, "Check access");
    if (!checkAccessButton) {
      throw new Error("Expected Check access button.");
    }

    await act(async () => {
      checkAccessButton.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      await Promise.resolve();
    });

    expect(checkConvexConnectionAccess).toHaveBeenCalledWith({});
    expect(container.textContent).toContain("Team-scoped Convex Management API access");
    expect(container.textContent).toContain("Team token. Name Samebase OAuth grant. ID token_123");
    expect(container.textContent).toContain("Slug samebase. ID team_samebase");
    expect(container.textContent).toContain(
      "Token details: OK - Probe GET /token_details returned team token Samebase OAuth grant.",
    );
    expect(container.textContent).toContain(
      "Projects: OK - Probe GET /teams/{team_id}/projects returned 2 visible projects.",
    );
    expect(container.textContent).toContain(
      "Deployments: OK - Probe GET /teams/{team_id}/list_deployments returned 4 visible deployments.",
    );
    expect(container.textContent).toContain(
      "Project and deployment creation are not probed here because that would create resources.",
    );
  });

  it("runs the Cloudflare access check and renders live access rows", async () => {
    const checkCloudflareConnectionAccess = vi.fn(async () => ({
      accounts: [
        {
          accountId: "account_123",
          accountName: "samebase",
          selected: true,
        },
      ],
      authMethod: "oauth",
      checkedAt: Date.now(),
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
          message: "Probe GET /accounts returned 1 visible account: samebase.",
          status: "ok",
        },
        {
          key: "selected_account",
          label: "Selected account",
          message: "The Accounts probe returned selected account samebase (account_123).",
          status: "ok",
        },
        {
          key: "workers",
          label: "Workers",
          message:
            "Probe GET /accounts/{account_id}/workers/account-settings succeeded for samebase.",
          status: "ok",
        },
        {
          key: "workers_builds",
          label: "Workers Builds",
          message: "Probe GET /accounts/{account_id}/builds/account/limits succeeded for samebase.",
          status: "ok",
        },
      ],
      connected: true,
      requestedScopes: [
        {
          label: "Read account metadata",
          scope: "account-settings.read",
        },
        {
          label: "Read Workers",
          scope: "workers-scripts.read",
        },
      ],
    }));
    queryState.handlersByFunctionName.set(
      getFunctionName(api.cloudflareProviderAccess.checkCloudflareConnectionAccess),
      checkCloudflareConnectionAccess,
    );
    const container = renderMountedProviderConnectionsPage(
      new Map([
        [
          getFunctionName(api.users.getGithubProviderSummary),
          {
            connected: false,
            requiredScopes: [],
            reauthorizeAvailable: false,
          },
        ],
        [getFunctionName(api.users.getConvexConnectionStatus), { connected: false }],
        [
          getFunctionName(api.users.getCloudflareConnectionStatus),
          {
            accountId: "account_123",
            accountName: "samebase",
            authMethod: "oauth",
            connected: true,
          },
        ],
        [getFunctionName(api.users.viewer), { _id: "user_123" }],
      ]),
    );
    const checkAccessButton = findButtonByText(container, "Check access");
    if (!checkAccessButton) {
      throw new Error("Expected Check access button.");
    }

    await act(async () => {
      checkAccessButton.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      await Promise.resolve();
    });

    expect(checkCloudflareConnectionAccess).toHaveBeenCalledWith({});
    expect(container.textContent).toContain("account-settings.read · Read account metadata");
    expect(container.textContent).toContain("workers-scripts.read · Read Workers");
    expect(container.textContent).toContain("samebase (account_123) · Selected");
    expect(container.textContent).toContain(
      "OAuth token: OK - Stored OAuth token metadata says the token is valid until 2026-06-22T14:00:00.000Z. Live probes below verify current Cloudflare access.",
    );
    expect(container.textContent).toContain(
      "Workers Builds: OK - Probe GET /accounts/{account_id}/builds/account/limits succeeded for samebase.",
    );
  });
});
