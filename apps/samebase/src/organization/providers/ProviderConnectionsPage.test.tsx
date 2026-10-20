// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { buildCloudflareCiApiTokenUrl } from "../../../shared/cloudflareResourceUrls";
import {
  handleProviderOAuthPopupCompletionMessage,
  ProviderConnectionsPage,
} from "./ProviderConnectionsPage";
import { ProviderConnectionsPageVisualFixture } from "./ProviderConnectionsPageVisualFixture";
import type { GitHubAuthorizationSetup } from "@/organization/providers/githubAppSetupFlow";

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
const personalOrganization = {
  canCreateRepository: false,
  githubOwnerId: "123",
  githubOwnerLogin: "nicubunu",
  githubOwnerType: "user" as const,
  organizationId: fakeOrganizationId("organization_nicubunu"),
  role: "owner" as const,
};

type TestOrganization = Parameters<typeof ProviderConnectionsPage>[0]["organization"];

const testState = vi.hoisted(() => ({
  actions: new Map<string, (args: unknown) => Promise<unknown>>(),
  apiCredentialDialogOpens: new Array<"cloudflare" | "convex">(),
  mutations: new Map<string, (args: unknown) => Promise<unknown>>(),
  queries: new Map<string, unknown>(),
  queryCalls: new Array<{ args: unknown; name: string }>(),
  setupPopup: vi.fn<(getSetup: () => Promise<GitHubAuthorizationSetup>) => Promise<void>>(),
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

vi.mock("@/organization/providers/githubAppSetupFlow", () => ({
  openGitHubAppSetupPopup: (
    _provider: "github-app" | "github-user",
    getSetup: () => Promise<GitHubAuthorizationSetup>,
  ) => testState.setupPopup(getSetup),
}));

vi.mock("@/organization/providers/ApiKeyConnectDialog", () => ({
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

function findButton(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent === label);
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
  const popupOriginRef = { current: "https://samebase.com" };
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
    window.history.replaceState({}, "", "/org/samebase/providers");
    testState.actions.clear();
    testState.apiCredentialDialogOpens = [];
    testState.mutations.clear();
    testState.queries.clear();
    testState.queryCalls = [];
    testState.setupPopup.mockReset();
    testState.setupPopup.mockImplementation(async (getSetup) => {
      await getSetup();
    });
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

  it("does not diagnose a failed provider check as lost authorization", async () => {
    testState.actions.set(
      getFunctionName(api.githubAppAccess.checkViewerInstallation),
      vi.fn(async () => ({
        ...githubAccess(),
        checks: [{ key: "repositories" as const, status: "error" as const }],
        status: "unavailable" as const,
      })),
    );
    testState.actions.set(
      getFunctionName(api.convexProviderAccess.checkConvexConnectionAccess),
      vi.fn(async () => ({
        ...convexAccess(),
        checks: [{ key: "projects" as const, status: "error" as const }],
      })),
    );
    testState.queries.set(getFunctionName(api.users.getConvexConnectionStatus), {
      authMethod: "oauth",
      state: "connected",
      teamId: "team_samebase",
      teamSlug: "samebase",
    });
    testState.queries.set(getFunctionName(api.users.getCloudflareConnectionStatus), {
      state: "not_configured",
    });
    const container = mountProviderConnectionsPage();

    await act(async () => {
      await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0));
    });

    expect(container.textContent).toContain(
      "Could not confirm GitHub App access. Reload this page. If it still fails, the GitHub owner must reconnect the GitHub App.",
    );
    expect(container.textContent).toContain(
      "Could not check Convex access. Reload this page. If it still fails, reauthorize Convex.",
    );
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

  it("does not show personal repository authorization for a GitHub organization", () => {
    setProviderQueries();

    const container = mountProviderConnectionsPage();

    expect(container.textContent).not.toContain("Personal repository creation");
    expect(testState.queryCalls).toContainEqual({
      args: "skip",
      name: getFunctionName(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization),
    });
  });

  it("starts personal repository authorization for the selected personal owner", async () => {
    window.history.replaceState({}, "", "/org/nicubunu/providers");
    setProviderQueries();
    testState.queries.set(
      getFunctionName(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization),
      { status: "not_connected" },
    );
    const getAuthorizationUrl = vi.fn(async () => ({
      callbackOrigin: "https://samebase.com",
      setupUrl: "https://github.com/login/oauth/authorize",
    }));
    testState.mutations.set(
      getFunctionName(api.githubAppInstallation.getGitHubUserAuthorizationUrl),
      getAuthorizationUrl,
    );
    const container = mountProviderConnectionsPage(personalOrganization);

    expect(container.textContent).toContain("Personal repository creation");
    expect(container.textContent).toContain("Authorization required");
    await act(async () => {
      findButton(container, "Authorize")?.click();
      await Promise.resolve();
    });

    expect(getAuthorizationUrl).toHaveBeenCalledWith({
      returnToPath: "/org/nicubunu/providers",
    });
  });

  it.each([
    { authorization: { status: "not_connected" as const }, label: "Authorize" },
    {
      authorization: {
        githubUserLogin: "nicubunu",
        refreshTokenExpiresAt: 0,
        status: "authorized" as const,
      },
      label: "Reauthorize",
    },
  ])(
    "does not offer $label personal repository authorization to a member",
    ({ authorization, label }) => {
      setProviderQueries();
      testState.queries.set(
        getFunctionName(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization),
        authorization,
      );

      const container = mountProviderConnectionsPage({ ...personalOrganization, role: "member" });

      expect(container.textContent).toContain("Personal repository creation");
      expect(findButton(container, label)).toBeUndefined();
    },
  );

  it("shows and revokes personal repository authorization", async () => {
    setProviderQueries();
    testState.queries.set(
      getFunctionName(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization),
      {
        githubUserLogin: "nicubunu",
        refreshTokenExpiresAt: Date.now() + 60_000,
        status: "authorized",
      },
    );
    const revokeAuthorization = vi.fn(async () => null);
    testState.actions.set(
      getFunctionName(api.githubUserAuthorizations.revokeViewerGitHubUserAuthorization),
      revokeAuthorization,
    );
    const container = mountProviderConnectionsPage(personalOrganization);

    expect(container.textContent).toContain("Authorized as @nicubunu");
    expect(container.textContent).toContain(
      "Samebase uses this authorization to create repositories in this personal GitHub account and find GitHub App installations. Revoking it stops both.",
    );
    await act(async () => {
      findButton(container, "Revoke")?.click();
      await Promise.resolve();
    });

    expect(revokeAuthorization).toHaveBeenCalledWith({});
  });

  it("offers reauthorization after personal repository authorization expires", () => {
    setProviderQueries();
    testState.queries.set(
      getFunctionName(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization),
      {
        githubUserLogin: "nicubunu",
        refreshTokenExpiresAt: 0,
        status: "authorized",
      },
    );

    const container = mountProviderConnectionsPage(personalOrganization);

    expect(container.textContent).toContain("Expired for @nicubunu");
    expect(findButton(container, "Reauthorize")).toBeDefined();
    expect(findButton(container, "Revoke")).toBeDefined();
  });

  it("shows a different personal authorization before it offers replacement", () => {
    setProviderQueries();
    testState.queries.set(
      getFunctionName(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization),
      {
        githubUserLogin: "other-user",
        status: "different_account",
      },
    );

    const container = mountProviderConnectionsPage(personalOrganization);

    expect(container.textContent).toContain("Authorized as @other-user, not @nicubunu.");
    expect(findButton(container, "Authorize")).toBeUndefined();
    expect(findButton(container, "Revoke")).toBeDefined();
  });

  it.each([
    ["sign_in_required", "Connect GitHub as @nicubunu in Account settings first."],
    [
      "sign_in_mismatch",
      "Use the Samebase account connected to GitHub as @nicubunu. Check Account settings.",
    ],
  ] as const)("does not offer personal authorization for %s", (status, message) => {
    setProviderQueries();
    testState.queries.set(
      getFunctionName(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization),
      { status, authorizationPresent: false },
    );

    const container = mountProviderConnectionsPage(personalOrganization);

    expect(container.textContent).toContain(message);
    expect(findButton(container, "Authorize")).toBeUndefined();
    expect(findButton(container, "Revoke")).toBeUndefined();
    expect(container.querySelector('a[href="/settings"]')?.textContent).toBe("Account settings");
  });

  it.each(["sign_in_required", "sign_in_mismatch"] as const)(
    "offers stale personal authorization recovery for %s",
    (status) => {
      setProviderQueries();
      testState.queries.set(
        getFunctionName(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization),
        { status, authorizationPresent: true },
      );

      const container = mountProviderConnectionsPage(personalOrganization);

      expect(findButton(container, "Authorize")).toBeUndefined();
      expect(findButton(container, "Revoke")).toBeDefined();
    },
  );

  it("shows OAuth as the primary action and direct credentials as text", () => {
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
    expect(convexButtons[0]?.className).toContain("bg-primary");
    expect(convexButtons[1]?.className).toContain("hover:underline");
    expect(cloudflareButtons[0]?.className).toContain("bg-primary");
    expect(cloudflareButtons[1]?.className).toContain("hover:underline");

    act(() => {
      cloudflareButtons[1]?.click();
    });
    expect(testState.apiCredentialDialogOpens).toEqual(["cloudflare"]);
  });

  it("updates a connected Cloudflare API token without starting OAuth", async () => {
    const startCloudflareOAuth = vi.fn(async () => "https://samebase.com/oauth/cloudflare");
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

  function setConnectedProviders() {
    testState.queries.set(getFunctionName(api.users.getConvexConnectionStatus), {
      authMethod: "oauth",
      state: "connected",
      teamId: "team_samebase",
      teamSlug: "samebase-team",
    });
    testState.queries.set(getFunctionName(api.users.getCloudflareConnectionStatus), {
      accountId: "cloudflare-account",
      accountName: "Samebase",
      authMethod: "api_key",
      state: "connected",
    });
  }

  function readCiCredentialRows(container: HTMLElement) {
    const rows = [...container.querySelectorAll<HTMLElement>('[data-testid="ci-credential-row"]')];
    const cloudflareRow = rows.at(0);
    const convexRow = rows.at(1);
    if (!cloudflareRow || !convexRow) {
      throw new Error("CI credential rows were not found.");
    }
    return { cloudflareRow, convexRow };
  }

  async function typeToken(row: HTMLElement, value: string) {
    const input = row.querySelector("input");
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    if (!input || !descriptor?.set) {
      throw new Error("CI token input was not found.");
    }
    descriptor.set.call(input, value);
    await act(async () => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    return input;
  }

  it("replaces and removes a saved CI token and saves a missing one", async () => {
    const setCloudflareCiToken = vi.fn(async () => null);
    const setConvexCiToken = vi.fn(async () => null);
    const removeCiToken = vi.fn(async () => null);
    testState.actions.set(getFunctionName(api.users.setCloudflareCiToken), setCloudflareCiToken);
    testState.actions.set(getFunctionName(api.users.setConvexCiToken), setConvexCiToken);
    testState.mutations.set(getFunctionName(api.users.removeCiToken), removeCiToken);
    setConnectedProviders();
    testState.queries.set(getFunctionName(api.users.getCiCredentialsStatus), {
      cloudflare: {
        accountId: "cloudflare-account",
        // Noon UTC, so the saved date is the same day in every test time zone.
        updatedAt: Date.UTC(2026, 9, 6, 12),
        connectedBy: { kind: "displayName", label: "Ada" },
      },
      convex: null,
    });

    const container = mountProviderConnectionsPage();
    expect(container.querySelector('[data-testid="ci-credentials"]')?.textContent).toContain(
      "Samebase writes both tokens as secrets into each repository that GitHub Actions set up.",
    );
    const { cloudflareRow, convexRow } = readCiCredentialRows(container);

    // A saved token reads as saved: who saved it and when, and the field replaces it.
    expect(cloudflareRow.textContent).toContain("Saved by Ada on Oct 6, 2026");
    expect(cloudflareRow.querySelector("input")?.placeholder).toBe(
      "Paste a new token to replace it",
    );
    expect(findButton(cloudflareRow, "Save")).toBeUndefined();
    // The token template link preselects the CI permissions for the connected account.
    expect(cloudflareRow.querySelector("a")?.href).toBe(
      buildCloudflareCiApiTokenUrl({
        accountId: "cloudflare-account",
        tokenName: "samebase actions ci samebase",
      }),
    );
    expect(cloudflareRow.textContent).toContain(
      "Account Settings Read, Workers Scripts Edit, Workers Builds Configuration Edit, Secrets Store Edit",
    );

    // A missing token asks for one and links to the connected team's access tokens.
    expect(convexRow.textContent).toContain("Not saved");
    expect(convexRow.querySelector("input")?.placeholder).toBe("Convex team access token");
    expect(findButton(convexRow, "Replace")).toBeUndefined();
    expect(findButton(convexRow, "Remove")).toBeUndefined();
    const createTokenLink = convexRow.querySelector("a");
    expect(createTokenLink?.textContent).toBe("Create a team access token");
    expect(createTokenLink?.href).toBe(
      "https://dashboard.convex.dev/t/samebase-team/settings/access-tokens",
    );
    expect(convexRow.textContent).toContain("The token must belong to the connected team.");

    const cloudflareInput = await typeToken(cloudflareRow, "  cloudflare-ci-token-for-tests  ");
    await act(async () => {
      findButton(cloudflareRow, "Replace")?.click();
      await Promise.resolve();
    });
    await typeToken(convexRow, "  convex-ci-token-for-tests  ");
    await act(async () => {
      findButton(convexRow, "Save")?.click();
      await Promise.resolve();
    });
    await act(async () => {
      findButton(cloudflareRow, "Remove")?.click();
      await Promise.resolve();
    });

    expect(setCloudflareCiToken).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      token: "cloudflare-ci-token-for-tests",
    });
    expect(setConvexCiToken).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      token: "convex-ci-token-for-tests",
    });
    // The saved line is the confirmation; the field is empty again.
    expect(cloudflareInput.value).toBe("");
    expect(removeCiToken).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      provider: "cloudflare",
    });
  });

  it("tells an owner to update a Cloudflare API token that fails its check", async () => {
    testState.actions.set(
      getFunctionName(api.cloudflareProviderAccess.checkCloudflareConnectionAccess),
      vi.fn(async () => ({
        checks: [{ key: "token" as const, status: "error" as const }],
        connected: true,
        requestedScopes: [],
      })),
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

    await act(async () => {
      await vi.waitFor(() => {
        expect(queryClient.isFetching()).toBe(0);
        expect(
          container.querySelector('[data-provider-key="cloudflare"] [role="alert"]')?.textContent,
        ).toBe("Update the Cloudflare API token.");
      });
    });
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
    expect(markup).toContain("Requested OAuth scopes");
    expect(markup).toContain("GET /token_details");
    expect(markup).toContain("GET /installation/repositories");
    expect(markup).toContain("GET /app/installations/{installation_id}");
    expect(markup).toContain("GET /accounts/{account_id}/workers/account-settings");
    expect(markup.match(/Connected by/g)).toHaveLength(2);
    expect(markup).toContain("Ava Chen");
    expect(markup).not.toContain("Cloudflare GitHub App");
    expect(markup).toContain(
      "Could not check Cloudflare Workers Builds access. Reload this page. If it still fails, reconnect Cloudflare.",
    );
    expect(markup).not.toContain("Reconnect Cloudflare with Workers Builds access.");
  });

  it("tells users to authorize only the configured Cloudflare account", () => {
    const markup = renderToStaticMarkup(
      <ProviderConnectionsPageVisualFixture mode="providers-page-authorization-error" />,
    );

    expect(markup).toContain(
      'Select <strong class="font-semibold">ONLY ONE</strong> Cloudflare account to reconnect: <strong class="font-semibold">Acme Production</strong>.',
    );
  });

  it.each(["convex-oauth-complete", "cloudflare-oauth-complete", "cloudflare-mcp-oauth-complete"])(
    "navigates the opener to the exact scoped URL for %s",
    (type) => {
      const navigate = vi.fn();
      const returnTo = `${window.location.origin}/org/acme/providers?source=oauth#connection`;

      handleProviderOAuthPopupCompletionMessage({
        event: new MessageEvent("message", {
          data: { type, returnTo },
          origin: "https://samebase.com",
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

  it("navigates the opener to the app completion page with its fragment intact", () => {
    const navigate = vi.fn();
    const returnTo = `${window.location.origin}/oauth/provider-complete#provider=convex&state=state-value&code=code-value`;

    handleProviderOAuthPopupCompletionMessage({
      event: new MessageEvent("message", {
        data: { type: "convex-oauth-complete", returnTo },
        origin: "https://samebase.com",
        source: window,
      }),
      expectedOrigin: window.location.origin,
      navigate,
      providerPopupConfig: providerPopupConfig(),
    });

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(returnTo);
  });

  it.each([
    {
      data: { type: "convex-oauth-complete" },
      label: "missing return URL",
      origin: "https://samebase.com",
      source: window,
    },
    {
      data: { returnTo: 42, type: "convex-oauth-complete" },
      label: "non-string return URL",
      origin: "https://samebase.com",
      source: window,
    },
    {
      data: { returnTo: "not-an-absolute-url", type: "convex-oauth-complete" },
      label: "invalid return URL",
      origin: "https://samebase.com",
      source: window,
    },
    {
      data: {
        returnTo: "https://attacker.example/org/acme/providers",
        type: "convex-oauth-complete",
      },
      label: "cross-origin return URL",
      origin: "https://samebase.com",
      source: window,
    },
    {
      data: {
        returnTo: `${window.location.origin}/org/acme/providers`,
        type: "convex-oauth-complete",
      },
      label: "wrong popup source",
      origin: "https://samebase.com",
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
