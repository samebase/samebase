// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  handleProviderOAuthPopupCompletionMessage,
  ProviderConnectionsPage,
} from "./ProviderConnectionsPage";
import { ProviderConnectionsPageVisualFixture } from "./ProviderConnectionsPageVisualFixture";

const { act } = React;

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // stable values for client function arguments.
  return value;
}

const ORGANIZATION_ID = fakeOrganizationId("organization_samebase");

const organization = {
  canCreateRepository: true,
  githubOwnerId: "456",
  githubOwnerLogin: "samebase",
  githubOwnerType: "organization" as const,
  organizationId: ORGANIZATION_ID,
  role: "owner" as const,
};

type TestOrganization = Parameters<typeof ProviderConnectionsPage>[0]["organization"];

const testState = vi.hoisted(() => ({
  actions: new Map<string, (args: unknown) => Promise<unknown>>(),
  apiCredentialDialogOpens: new Array<"cloudflare" | "convex">(),
  mutations: new Map<string, (args: unknown) => Promise<unknown>>(),
  queries: new Map<string, unknown>(),
  queryCalls: new Array<{ args: unknown; name: string }>(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) =>
      testState.actions.get(getFunctionName(reference)) ?? vi.fn(async () => undefined),
    useMutation: (reference: Parameters<typeof actual.useMutation>[0]) =>
      testState.mutations.get(getFunctionName(reference)) ?? vi.fn(async () => undefined),
    useQuery: (reference: Parameters<typeof actual.useQuery>[0], args: unknown) => {
      const name = getFunctionName(reference);
      testState.queryCalls.push({ args, name });
      return args === "skip" ? undefined : testState.queries.get(name);
    },
  };
});

vi.mock("@/authClient", () => ({
  isInIframe: () => false,
}));

vi.mock("@/components/ApiKeyConnectDialog", () => ({
  useApiKeyConnectDialog: ({ provider }: { provider: "cloudflare" | "convex" }) => ({
    apiKeyDialog: null,
    openApiKeyDialog: () => testState.apiCredentialDialogOpens.push(provider),
  }),
}));

function setProviderQueries() {
  testState.queries.set(getFunctionName(api.users.getConvexConnectionStatus), {
    state: "not_configured",
  });
  testState.queries.set(getFunctionName(api.users.getCloudflareConnectionStatus), {
    state: "not_configured",
  });
}

function convexAccess() {
  return {
    checks: [
      {
        key: "token" as const,
        status: "ok" as const,
      },
    ],
    connected: true,
  };
}

function cloudflareAccess() {
  return {
    checks: [
      {
        key: "accounts" as const,
        status: "ok" as const,
      },
    ],
    connected: true,
    requestedScopes: [],
  };
}

function githubAccess() {
  return {
    status: "connected" as const,
    checks: [
      {
        key: "repositories" as const,
        status: "ok" as const,
      },
      {
        key: "installation" as const,
        status: "ok" as const,
      },
    ],
    permissions: [{ access: "write" as const, key: "contents" }],
    repositorySelection: "selected" as const,
  };
}

let mountedRoot: Root | null = null;
let mountedElement: HTMLDivElement | null = null;
let queryClient: QueryClient;

function mountProviderConnectionsPage(selectedOrganization: TestOrganization = organization) {
  mountedElement = document.createElement("div");
  document.body.append(mountedElement);
  mountedRoot = createRoot(mountedElement);
  act(() => {
    mountedRoot?.render(
      <TestRouterProvider
        initialEntries={[`/org/${selectedOrganization.githubOwnerLogin}/providers`]}
      >
        <QueryClientProvider client={queryClient}>
          <ProviderConnectionsPage organization={selectedOrganization} />
        </QueryClientProvider>
      </TestRouterProvider>,
    );
  });
  return mountedElement;
}

function providerPopupConfig(popup: Window | null = window) {
  const popupOriginRef = { current: "https://api.samebase.com" };
  return {
    convex: {
      completionEventTypes: ["convex-oauth-complete"],
      popupOriginRef,
      popupRef: { current: popup },
    },
    cloudflare: {
      completionEventTypes: ["cloudflare-oauth-complete", "cloudflare-mcp-oauth-complete"],
      popupOriginRef,
      popupRef: { current: popup },
    },
  };
}

describe("ProviderConnectionsPage", () => {
  beforeEach(() => {
    testState.actions.clear();
    testState.apiCredentialDialogOpens = [];
    testState.mutations.clear();
    testState.queries.clear();
    testState.queryCalls = [];
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    testState.actions.set(
      getFunctionName(api.githubAppAccess.checkViewerInstallation),
      vi.fn(async () => githubAccess()),
    );
  });

  afterEach(() => {
    if (mountedRoot !== null) {
      act(() => mountedRoot?.unmount());
    }
    mountedElement?.remove();
    queryClient.clear();
    mountedRoot = null;
    mountedElement = null;
  });

  it("shows GitHub while provider credential status is loading", () => {
    const container = mountProviderConnectionsPage();

    expect(container.textContent).toContain("Providers");
    expect(
      [...container.querySelectorAll("[data-provider-key]")].map((row) =>
        row.getAttribute("data-provider-key"),
      ),
    ).toEqual(["github"]);
    expect(container.textContent).not.toContain("Not connected");
  });

  it("checks connected providers automatically", async () => {
    const checkGitHubAccess = vi.fn(async () => githubAccess());
    const checkConvexAccess = vi.fn(async () => convexAccess());
    const checkCloudflareAccess = vi.fn(async () => cloudflareAccess());
    testState.actions.set(
      getFunctionName(api.githubAppAccess.checkViewerInstallation),
      checkGitHubAccess,
    );
    testState.actions.set(
      getFunctionName(api.convexProviderAccess.checkConvexConnectionAccess),
      checkConvexAccess,
    );
    testState.actions.set(
      getFunctionName(api.cloudflareProviderAccess.checkCloudflareConnectionAccess),
      checkCloudflareAccess,
    );
    testState.queries.set(getFunctionName(api.users.getConvexConnectionStatus), {
      authMethod: "oauth",
      state: "connected",
      teamId: "team_samebase",
      teamSlug: "samebase",
    });
    testState.queries.set(getFunctionName(api.users.getCloudflareConnectionStatus), {
      accountId: "cloudflare-account",
      accountName: "Samebase",
      authMethod: "oauth",
      state: "connected",
    });
    mountProviderConnectionsPage();

    expect(testState.queryCalls).toContainEqual({
      args: { organizationId: ORGANIZATION_ID },
      name: getFunctionName(api.users.getConvexConnectionStatus),
    });
    expect(testState.queryCalls).toContainEqual({
      args: { organizationId: ORGANIZATION_ID },
      name: getFunctionName(api.users.getCloudflareConnectionStatus),
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(checkGitHubAccess).toHaveBeenCalledTimes(1);
        expect(checkConvexAccess).toHaveBeenCalledTimes(1);
        expect(checkCloudflareAccess).toHaveBeenCalledTimes(1);
        expect(queryClient.isFetching()).toBe(0);
      });
    });

    expect(checkGitHubAccess).toHaveBeenLastCalledWith({ organizationId: ORGANIZATION_ID });
    expect(checkConvexAccess).toHaveBeenLastCalledWith({ organizationId: ORGANIZATION_ID });
    expect(checkCloudflareAccess).toHaveBeenLastCalledWith({ organizationId: ORGANIZATION_ID });
  });

  it("does not show earlier passes after a refresh fails", async () => {
    let shouldFail = false;
    const checkGitHubAccess = vi.fn(async () => {
      if (shouldFail) {
        throw new Error("provider unavailable");
      }
      return githubAccess();
    });
    const checkConvexAccess = vi.fn(async () => {
      if (shouldFail) {
        throw new Error("provider unavailable");
      }
      return convexAccess();
    });
    const checkCloudflareAccess = vi.fn(async () => {
      if (shouldFail) {
        throw new Error("provider unavailable");
      }
      return cloudflareAccess();
    });
    testState.actions.set(
      getFunctionName(api.githubAppAccess.checkViewerInstallation),
      checkGitHubAccess,
    );
    testState.actions.set(
      getFunctionName(api.convexProviderAccess.checkConvexConnectionAccess),
      checkConvexAccess,
    );
    testState.actions.set(
      getFunctionName(api.cloudflareProviderAccess.checkCloudflareConnectionAccess),
      checkCloudflareAccess,
    );
    testState.queries.set(getFunctionName(api.users.getConvexConnectionStatus), {
      authMethod: "oauth",
      state: "connected",
      teamId: "team_samebase",
      teamSlug: "samebase",
    });
    testState.queries.set(getFunctionName(api.users.getCloudflareConnectionStatus), {
      accountId: "cloudflare-account",
      accountName: "Samebase",
      authMethod: "oauth",
      state: "connected",
    });
    const container = mountProviderConnectionsPage();

    await act(async () => {
      await vi.waitFor(() => {
        expect(checkGitHubAccess).toHaveBeenCalledTimes(1);
        expect(checkConvexAccess).toHaveBeenCalledTimes(1);
        expect(checkCloudflareAccess).toHaveBeenCalledTimes(1);
        expect(queryClient.isFetching()).toBe(0);
        expect(container.textContent).toContain("Passed");
      });
    });

    shouldFail = true;
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["organization-provider-access", ORGANIZATION_ID],
      });
      await vi.waitFor(() => {
        expect(checkGitHubAccess).toHaveBeenCalledTimes(3);
        expect(checkConvexAccess).toHaveBeenCalledTimes(3);
        expect(checkCloudflareAccess).toHaveBeenCalledTimes(3);
        expect(queryClient.isFetching()).toBe(0);
        expect(container.querySelectorAll('[role="alert"]')).toHaveLength(3);
      });
    });

    expect(container.textContent).not.toContain("Passed");
  });

  it("checks GitHub but not disconnected credential providers", async () => {
    const checkGitHubAccess = vi.fn(async () => githubAccess());
    const checkConvexAccess = vi.fn(async () => convexAccess());
    const checkCloudflareAccess = vi.fn(async () => cloudflareAccess());
    testState.actions.set(
      getFunctionName(api.githubAppAccess.checkViewerInstallation),
      checkGitHubAccess,
    );
    testState.actions.set(
      getFunctionName(api.convexProviderAccess.checkConvexConnectionAccess),
      checkConvexAccess,
    );
    testState.actions.set(
      getFunctionName(api.cloudflareProviderAccess.checkCloudflareConnectionAccess),
      checkCloudflareAccess,
    );
    testState.queries.set(getFunctionName(api.users.getConvexConnectionStatus), {
      state: "disconnected",
      teamId: "team_samebase",
      teamSlug: "samebase",
    });
    testState.queries.set(getFunctionName(api.users.getCloudflareConnectionStatus), {
      accountId: "cloudflare-account",
      accountName: "Samebase",
      state: "disconnected",
    });
    mountProviderConnectionsPage();

    await act(async () => {
      await vi.waitFor(() => expect(checkGitHubAccess).toHaveBeenCalledTimes(1));
    });
    expect(checkConvexAccess).not.toHaveBeenCalled();
    expect(checkCloudflareAccess).not.toHaveBeenCalled();
  });

  it("shows one safe notice when each access check reports a missing connection", async () => {
    testState.actions.set(
      getFunctionName(api.convexProviderAccess.checkConvexConnectionAccess),
      vi.fn(async () => ({
        ...convexAccess(),
        checks: [
          {
            key: "token" as const,
            status: "not_run" as const,
          },
        ],
        connected: false,
      })),
    );
    testState.actions.set(
      getFunctionName(api.cloudflareProviderAccess.checkCloudflareConnectionAccess),
      vi.fn(async () => ({
        ...cloudflareAccess(),
        checks: [
          {
            key: "token" as const,
            status: "not_run" as const,
          },
        ],
        connected: false,
      })),
    );
    testState.queries.set(getFunctionName(api.users.getConvexConnectionStatus), {
      authMethod: "oauth",
      state: "connected",
      teamId: "team_samebase",
      teamSlug: "samebase",
    });
    testState.queries.set(getFunctionName(api.users.getCloudflareConnectionStatus), {
      accountId: "cloudflare-account",
      accountName: "Samebase",
      authMethod: "oauth",
      state: "connected",
    });
    const container = mountProviderConnectionsPage();

    await act(async () => {
      await vi.waitFor(() => {
        expect(queryClient.isFetching()).toBe(0);
        for (const provider of ["convex", "cloudflare"]) {
          expect(
            container.querySelectorAll(`[data-provider-key="${provider}"] [role="alert"]`),
          ).toHaveLength(1);
        }
      });
    });
  });

  it("links the configured GitHub owner without a selector or internal ID", () => {
    setProviderQueries();

    const container = mountProviderConnectionsPage();

    expect(testState.queryCalls).toContainEqual({
      args: { organizationId: ORGANIZATION_ID },
      name: getFunctionName(api.users.getConvexConnectionStatus),
    });
    expect(container.querySelector('[aria-label="GitHub owner"]')).toBeNull();
    expect(
      container.querySelector('[aria-label="Open GitHub owner samebase in a new tab"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain(ORGANIZATION_ID);
  });

  it("offers OAuth first and the correct direct credential term to organization owners", () => {
    setProviderQueries();

    const container = mountProviderConnectionsPage();
    const convexRow = container.querySelector('[data-provider-key="convex"]');
    const cloudflareRow = container.querySelector('[data-provider-key="cloudflare"]');
    const convexButtons = [...(convexRow?.querySelectorAll("button") ?? [])];
    const cloudflareButtons = [...(cloudflareRow?.querySelectorAll("button") ?? [])];

    expect(convexButtons.map((button) => button.textContent)).toEqual([
      "Convex OAuth",
      "Use API key",
    ]);
    expect(cloudflareButtons.map((button) => button.textContent)).toEqual([
      "Cloudflare OAuth",
      "Use API token",
    ]);
    expect(convexButtons[0]?.className).toContain("border-border");
    expect(convexButtons[1]?.className).toContain("hover:underline");
    expect(cloudflareButtons[0]?.className).toContain("border-border");
    expect(cloudflareButtons[1]?.className).toContain("hover:underline");

    act(() => {
      cloudflareButtons[1]?.click();
    });
    expect(testState.apiCredentialDialogOpens).toEqual(["cloudflare"]);
  });

  it("updates a connected Cloudflare API token without starting OAuth", async () => {
    const startCloudflareOAuth = vi.fn(async () => "https://api.samebase.com/oauth/cloudflare");
    testState.actions.set(
      getFunctionName(api.cloudflareOAuth.getCloudflareOAuthUrl),
      startCloudflareOAuth,
    );
    testState.queries.set(getFunctionName(api.users.getConvexConnectionStatus), {
      state: "not_configured",
    });
    testState.queries.set(getFunctionName(api.users.getCloudflareConnectionStatus), {
      accountId: "cloudflare-account",
      accountName: "Samebase",
      authMethod: "api_key",
      state: "connected",
    });

    const container = mountProviderConnectionsPage();
    const cloudflareRow = container.querySelector('[data-provider-key="cloudflare"]');

    expect(cloudflareRow?.textContent).toContain("Account · API token");
    act(() => {
      const actionsButton = cloudflareRow?.querySelector<HTMLButtonElement>(
        '[aria-label="Cloudflare actions"]',
      );
      actionsButton?.click();
    });

    await act(async () => {
      await vi.waitFor(() => expect(document.body.textContent).toContain("Update token"));
    });
    const updateTokenItem = [...document.body.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent === "Update token",
    );
    act(() => {
      updateTokenItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(testState.apiCredentialDialogOpens).toEqual(["cloudflare"]);
    expect(startCloudflareOAuth).not.toHaveBeenCalled();
  });

  it("does not show GitHub installation controls to organization members", () => {
    setProviderQueries();

    const container = mountProviderConnectionsPage({ ...organization, role: "member" });

    expect(container.querySelector('[aria-label="GitHub actions"]')).toBeNull();
    expect(container.textContent).not.toContain("Manage installation");
    expect(container.textContent).not.toContain("Reconnect");
    expect(container.textContent).not.toContain("Use API key");
    expect(container.textContent).not.toContain("Use API token");
  });

  it("links provider targets and shows only safe check templates", () => {
    const markup = renderToStaticMarkup(
      <ProviderConnectionsPageVisualFixture mode="providers-page-connected" />,
    );

    expect(markup).toContain('href="https://dashboard.convex.dev/t/acme-platform"');
    expect(markup).toContain('aria-label="Open Convex team acme-platform in a new tab"');
    expect(markup).toContain('href="https://dash.cloudflare.com/cloudflare-account-production"');
    expect(markup).toContain('aria-label="Open Cloudflare account Acme Production in a new tab"');
    expect(markup).toContain('href="https://github.com/acme"');
    expect(markup).toContain('aria-label="Open GitHub owner acme in a new tab"');
    expect(markup).not.toContain("team_acme_platform");
    expect(markup).toContain("Permissions");
    expect(markup).toContain("Repository access");
    expect(markup).toContain("GET /token_details");
    expect(markup).toContain("GET /installation/repositories");
    expect(markup).toContain("GET /app/installations/{installation_id}");
    expect(markup).toContain("GET /accounts/{account_id}/workers/account-settings");
    expect(markup.match(/Connected by/g)).toHaveLength(2);
    expect(markup).toContain("Ava Chen");
    expect(markup).not.toContain("Cloudflare GitHub App");
  });

  it.each(["convex-oauth-complete", "cloudflare-oauth-complete", "cloudflare-mcp-oauth-complete"])(
    "navigates the opener to the exact scoped URL for %s",
    (type) => {
      const navigate = vi.fn();
      const returnTo = `${window.location.origin}/org/acme/providers?source=oauth#connection`;

      handleProviderOAuthPopupCompletionMessage({
        event: new MessageEvent("message", {
          data: { type, returnTo },
          origin: "https://api.samebase.com",
          source: window,
        }),
        expectedOrigin: window.location.origin,
        navigate,
        providerPopupConfig: providerPopupConfig(),
      });

      expect(navigate).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith(returnTo);
    },
  );

  it.each([
    {
      data: { type: "convex-oauth-complete" },
      label: "missing return URL",
      origin: "https://api.samebase.com",
      source: window,
    },
    {
      data: { returnTo: 42, type: "convex-oauth-complete" },
      label: "non-string return URL",
      origin: "https://api.samebase.com",
      source: window,
    },
    {
      data: { returnTo: "not-an-absolute-url", type: "convex-oauth-complete" },
      label: "invalid return URL",
      origin: "https://api.samebase.com",
      source: window,
    },
    {
      data: {
        returnTo: "https://attacker.example/org/acme/providers",
        type: "convex-oauth-complete",
      },
      label: "cross-origin return URL",
      origin: "https://api.samebase.com",
      source: window,
    },
    {
      data: {
        returnTo: `${window.location.origin}/org/acme/providers`,
        type: "convex-oauth-complete",
      },
      label: "wrong popup source",
      origin: "https://api.samebase.com",
      source: null,
    },
    {
      data: {
        returnTo: `${window.location.origin}/org/acme/providers`,
        type: "convex-oauth-complete",
      },
      label: "wrong callback origin",
      origin: "https://attacker.example",
      source: window,
    },
  ])("ignores a completion message with $label", ({ data, origin, source }) => {
    const navigate = vi.fn();

    handleProviderOAuthPopupCompletionMessage({
      event: new MessageEvent("message", { data, origin, source }),
      expectedOrigin: window.location.origin,
      navigate,
      providerPopupConfig: providerPopupConfig(),
    });

    expect(navigate).not.toHaveBeenCalled();
  });
});
