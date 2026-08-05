// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ProviderConnectionsPage } from "./ProviderConnectionsPage";
import { ProviderConnectionsPageVisualFixture } from "./ProviderConnectionsPageVisualFixture";

const { act } = React;

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // stable values for client function arguments.
  return value;
}

const ORGANIZATION_ID = fakeOrganizationId("organization_samebase");
const SECOND_ORGANIZATION_ID = fakeOrganizationId("organization_acme");

const organization = {
  githubOwnerId: "456",
  githubOwnerLogin: "samebase",
  githubOwnerType: "organization" as const,
  organizationId: ORGANIZATION_ID,
};

const testState = vi.hoisted(() => ({
  actions: new Map<string, (args: unknown) => Promise<unknown>>(),
  mcpGrants: {
    loadMore: vi.fn(),
    results: new Array<unknown>(),
    status: "Exhausted",
  },
  mutations: new Map<string, (args: unknown) => Promise<unknown>>(),
  queries: new Map<string, unknown>(),
  queryCalls: new Array<{ args: unknown; name: string }>(),
  setupPopup: vi.fn<(getSetupUrl: () => Promise<string>) => Promise<void>>(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) =>
      testState.actions.get(getFunctionName(reference)) ?? vi.fn(async () => undefined),
    useMutation: (reference: Parameters<typeof actual.useMutation>[0]) =>
      testState.mutations.get(getFunctionName(reference)) ?? vi.fn(async () => undefined),
    usePaginatedQuery: () => testState.mcpGrants,
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
  useApiKeyConnectDialog: () => ({
    apiKeyDialog: null,
    openApiKeyDialog: vi.fn(),
  }),
}));

vi.mock("@/lib/githubAppSetupFlow", () => ({
  getCurrentRootRelativeUrl: () => "/providers",
  openGitHubAppSetupPopup: (getSetupUrl: () => Promise<string>) =>
    testState.setupPopup(getSetupUrl),
}));

function setProviderQueries(organizations: unknown[]) {
  testState.queries.set(getFunctionName(api.organizations.listForViewer), organizations);
  testState.queries.set(getFunctionName(api.users.getConvexConnectionStatus), {
    connected: false,
  });
  testState.queries.set(getFunctionName(api.users.getCloudflareConnectionStatus), {
    connected: false,
  });
}

let mountedRoot: Root | null = null;
let mountedElement: HTMLDivElement | null = null;

function mountProviderConnectionsPage() {
  mountedElement = document.createElement("div");
  document.body.append(mountedElement);
  mountedRoot = createRoot(mountedElement);
  act(() => {
    mountedRoot?.render(<ProviderConnectionsPage />);
  });
  return mountedElement;
}

describe("ProviderConnectionsPage", () => {
  beforeEach(() => {
    testState.actions.clear();
    testState.mutations.clear();
    testState.queries.clear();
    testState.queryCalls = [];
    testState.mcpGrants = {
      loadMore: vi.fn(),
      results: [],
      status: "Exhausted",
    };
    testState.setupPopup.mockReset();
    testState.setupPopup.mockImplementation(async (getSetupUrl) => {
      await getSetupUrl();
    });
  });

  afterEach(() => {
    if (mountedRoot !== null) {
      act(() => mountedRoot?.unmount());
    }
    mountedElement?.remove();
    mountedRoot = null;
    mountedElement = null;
  });

  it("offers GitHub App installation before an organization exists", async () => {
    setProviderQueries([]);
    const getInstallationUrl = vi.fn(
      async () => "https://github.com/apps/samebase-dev/installations/new",
    );
    testState.mutations.set(
      getFunctionName(api.githubAppInstallation.getGitHubAppInstallationUrl),
      getInstallationUrl,
    );
    const container = mountProviderConnectionsPage();

    expect(container.textContent).toContain("Install GitHub App");
    expect(container.textContent).not.toContain("Convex OAuth");
    expect(container.textContent).not.toContain("Cloudflare OAuth");
    expect(container.textContent).not.toContain("GitHub OAuth");

    await act(async () => {
      container.querySelector("button")?.click();
      await Promise.resolve();
    });

    expect(testState.setupPopup).toHaveBeenCalledOnce();
    expect(getInstallationUrl).toHaveBeenCalledWith({ returnToPath: "/providers" });
  });

  it("uses the only organization for every provider query and access check", async () => {
    setProviderQueries([organization]);
    const checkConvexAccess = vi.fn(async () => ({
      checkedAt: Date.now(),
      checks: [],
      connected: false,
      requestedAccess: [],
    }));
    testState.actions.set(
      getFunctionName(api.convexProviderAccess.checkConvexConnectionAccess),
      checkConvexAccess,
    );
    testState.queries.set(getFunctionName(api.users.getConvexConnectionStatus), {
      authMethod: "oauth",
      connected: true,
      teamSlug: "samebase",
    });
    const container = mountProviderConnectionsPage();

    expect(testState.queryCalls).toContainEqual({
      args: { organizationId: ORGANIZATION_ID },
      name: getFunctionName(api.users.getConvexConnectionStatus),
    });
    expect(testState.queryCalls).toContainEqual({
      args: { organizationId: ORGANIZATION_ID },
      name: getFunctionName(api.users.getCloudflareConnectionStatus),
    });

    const convexRow = container.querySelector('[data-provider-key="convex"]');
    const checkAccessButton = [...(convexRow?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Check access",
    );
    await act(async () => {
      checkAccessButton?.click();
      await Promise.resolve();
    });

    expect(checkConvexAccess).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
  });

  it("requires a local GitHub owner choice when several organizations exist", () => {
    setProviderQueries([
      organization,
      {
        githubOwnerId: "789",
        githubOwnerLogin: "acme",
        githubOwnerType: "organization",
        organizationId: SECOND_ORGANIZATION_ID,
      },
    ]);

    const markup = renderToStaticMarkup(<ProviderConnectionsPage />);

    expect(markup).toContain("GitHub owner");
    expect(markup).toContain("Select a GitHub owner.");
    expect(markup).not.toContain('data-provider-key="convex"');
    expect(markup).not.toContain('data-provider-key="github"');
  });

  it("keeps the connected visual fixture free of GitHub credential controls", () => {
    const markup = renderToStaticMarkup(<ProviderConnectionsPageVisualFixture />);

    expect(markup).toContain("Connected to samebase");
    expect(markup).toContain("Connected (OAuth). Account Samebase Preview.");
    expect(markup).toContain("MCP clients");
    expect(markup).toContain("Install GitHub App");
    expect(markup).not.toContain("GitHub OAuth");
    expect(markup).not.toContain("Reauthorize GitHub");
  });
});
