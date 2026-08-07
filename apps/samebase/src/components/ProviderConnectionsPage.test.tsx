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
  useApiKeyConnectDialog: () => ({
    apiKeyDialog: null,
    openApiKeyDialog: vi.fn(),
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

function convexAccess(checkedAt = Date.now()) {
  return {
    checkedAt,
    checks: [
      {
        key: "token" as const,
        label: "Token details",
        message: "Live access confirmed.",
        status: "ok" as const,
      },
    ],
    connected: true,
    requestedAccess: [],
  };
}

function cloudflareAccess(checkedAt = Date.now()) {
  return {
    checkedAt,
    checks: [
      {
        key: "accounts" as const,
        label: "Accounts",
        message: "Live access confirmed.",
        status: "ok" as const,
      },
    ],
    connected: true,
    requestedScopes: [],
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
      <QueryClientProvider client={queryClient}>
        <TestRouterProvider
          initialEntries={[`/org/${selectedOrganization.githubOwnerLogin}/providers`]}
        >
          <ProviderConnectionsPage organization={selectedOrganization} />
        </TestRouterProvider>
      </QueryClientProvider>,
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
    testState.mutations.clear();
    testState.queries.clear();
    testState.queryCalls = [];
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
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

  it("keeps provider rows empty while connection status is loading", () => {
    const container = mountProviderConnectionsPage();

    expect(container.textContent).toContain("Providers");
    expect(container.querySelectorAll("[data-provider-key]")).toHaveLength(0);
    expect(container.textContent).not.toContain("Not connected");
  });

  it("loads both connected providers and refreshes them together", async () => {
    const checkConvexAccess = vi.fn(async () => convexAccess());
    const checkCloudflareAccess = vi.fn(async () => cloudflareAccess());
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
        expect(checkConvexAccess).toHaveBeenCalledTimes(1);
        expect(checkCloudflareAccess).toHaveBeenCalledTimes(1);
        expect(queryClient.isFetching()).toBe(0);
      });
    });

    let refreshButton: HTMLButtonElement | undefined;
    await act(async () => {
      await vi.waitFor(() => {
        refreshButton = [...container.querySelectorAll("button")].find(
          (button) => button.textContent === "Refresh",
        );
        expect(refreshButton).toBeDefined();
      });
    });
    await act(async () => {
      refreshButton?.click();
      await vi.waitFor(() => {
        expect(checkConvexAccess).toHaveBeenCalledTimes(2);
        expect(checkCloudflareAccess).toHaveBeenCalledTimes(2);
        expect(queryClient.isFetching()).toBe(0);
      });
    });

    expect(checkConvexAccess).toHaveBeenLastCalledWith({ organizationId: ORGANIZATION_ID });
    expect(checkCloudflareAccess).toHaveBeenLastCalledWith({ organizationId: ORGANIZATION_ID });
  });

  it("does not check disconnected providers", async () => {
    const checkConvexAccess = vi.fn(async () => convexAccess());
    const checkCloudflareAccess = vi.fn(async () => cloudflareAccess());
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
    const container = mountProviderConnectionsPage();

    await act(async () => {
      await Promise.resolve();
    });
    expect(checkConvexAccess).not.toHaveBeenCalled();
    expect(checkCloudflareAccess).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Refresh");
  });

  it("keeps prior data when one provider refresh fails", async () => {
    const privateError = "private provider response";
    const checkConvexAccess = vi.fn(async () => convexAccess());
    const checkCloudflareAccess = vi
      .fn()
      .mockResolvedValueOnce(cloudflareAccess())
      .mockRejectedValueOnce(new Error(privateError));
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
        expect(checkConvexAccess).toHaveBeenCalledTimes(1);
        expect(checkCloudflareAccess).toHaveBeenCalledTimes(1);
        expect(queryClient.isFetching()).toBe(0);
      });
    });
    let refreshButton: HTMLButtonElement | undefined;
    await act(async () => {
      await vi.waitFor(() => {
        refreshButton = [...container.querySelectorAll("button")].find(
          (button) => button.textContent === "Refresh",
        );
        expect(refreshButton).toBeDefined();
      });
    });
    await act(async () => {
      refreshButton?.click();
      await vi.waitFor(() => {
        expect(checkConvexAccess).toHaveBeenCalledTimes(2);
        expect(checkCloudflareAccess).toHaveBeenCalledTimes(2);
        expect(queryClient.isFetching()).toBe(0);
        const cloudflareAlerts = container.querySelectorAll(
          '[data-provider-key="cloudflare"] [role="alert"]',
        );
        expect(cloudflareAlerts).toHaveLength(1);
        expect(cloudflareAlerts[0]?.textContent).toContain("Cloudflare");
      });
    });
    expect(container.querySelector('[data-provider-key="convex"]')?.textContent).toContain(
      "Read checks passed",
    );
    expect(container.textContent).not.toContain(privateError);
  });

  it("shows one safe notice when each access check reports a missing connection", async () => {
    const privateMessage = "private provider response";
    testState.actions.set(
      getFunctionName(api.convexProviderAccess.checkConvexConnectionAccess),
      vi.fn(async () => ({
        ...convexAccess(),
        checks: [
          {
            key: "token" as const,
            label: "Credential",
            message: privateMessage,
            status: "unknown" as const,
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
            label: "Credential",
            message: privateMessage,
            status: "unknown" as const,
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
    expect(container.textContent).not.toContain(privateMessage);
  });

  it("does not render a page-local owner selector or internal ID", () => {
    setProviderQueries();

    const container = mountProviderConnectionsPage();

    expect(testState.queryCalls).toContainEqual({
      args: { organizationId: ORGANIZATION_ID },
      name: getFunctionName(api.users.getConvexConnectionStatus),
    });
    expect(container.querySelector('[aria-label="GitHub owner"]')).toBeNull();
    expect(container.textContent).not.toContain(ORGANIZATION_ID);
  });

  it("links provider targets without exposing raw provider details", () => {
    const markup = renderToStaticMarkup(
      <ProviderConnectionsPageVisualFixture mode="providers-page-connected" />,
    );

    expect(markup).toContain('href="https://dashboard.convex.dev/t/acme-platform"');
    expect(markup).toContain('aria-label="Open Convex team acme-platform in a new tab"');
    expect(markup).toContain('href="https://dash.cloudflare.com/cloudflare-account-production"');
    expect(markup).toContain('aria-label="Open Cloudflare account Acme Production in a new tab"');
    expect(markup).not.toContain("team_acme_platform");
    expect(markup).not.toContain("token_acme_provider");
    expect(markup).not.toContain("/token_details");
    expect(markup).not.toContain("/accounts/{account_id}");
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
