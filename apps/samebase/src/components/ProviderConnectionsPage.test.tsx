// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
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
    connected: false,
  });
  testState.queries.set(getFunctionName(api.users.getCloudflareConnectionStatus), {
    connected: false,
  });
}

let mountedRoot: Root | null = null;
let mountedElement: HTMLDivElement | null = null;

function mountProviderConnectionsPage(selectedOrganization: TestOrganization = organization) {
  mountedElement = document.createElement("div");
  document.body.append(mountedElement);
  mountedRoot = createRoot(mountedElement);
  act(() => {
    mountedRoot?.render(
      <TestRouterProvider
        initialEntries={[`/org/${selectedOrganization.githubOwnerLogin}/providers`]}
      >
        <ProviderConnectionsPage organization={selectedOrganization} />
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
    testState.mutations.clear();
    testState.queries.clear();
    testState.queryCalls = [];
  });

  afterEach(() => {
    if (mountedRoot !== null) {
      act(() => mountedRoot?.unmount());
    }
    mountedElement?.remove();
    mountedRoot = null;
    mountedElement = null;
  });

  it("keeps provider rows empty while connection status is loading", () => {
    const container = mountProviderConnectionsPage();

    expect(container.textContent).toContain("Providers");
    expect(container.querySelectorAll("[data-provider-key]")).toHaveLength(0);
    expect(container.textContent).not.toContain("Not connected");
  });

  it("uses the routed organization for every provider query and access check", async () => {
    setProviderQueries();
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

  it("keeps provider checks and hides provider management for a member", async () => {
    setProviderQueries();
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
    testState.queries.set(getFunctionName(api.users.getCloudflareConnectionStatus), {
      accountId: "cloudflare-account",
      accountName: "Samebase",
      authMethod: "oauth",
      connected: true,
    });
    const container = mountProviderConnectionsPage({ ...organization, role: "member" });
    const convexRow = container.querySelector('[data-provider-key="convex"]');
    const cloudflareRow = container.querySelector('[data-provider-key="cloudflare"]');

    expect(convexRow?.textContent).toContain("Check access");
    expect(convexRow?.textContent).not.toContain("Manage access");
    expect(convexRow?.textContent).not.toContain("Reauthorize");
    expect(convexRow?.textContent).not.toContain("Disconnect");
    expect(cloudflareRow?.textContent).toContain("Connected (OAuth). Account Samebase.");
    expect(cloudflareRow?.textContent).toContain("Check access");
    expect(cloudflareRow?.textContent).not.toContain("Manage access");
    expect(cloudflareRow?.textContent).not.toContain("Reconnect");
    expect(cloudflareRow?.textContent).not.toContain("Manage account");
    expect(cloudflareRow?.textContent).not.toContain("Disconnect");

    const checkAccessButton = [...(convexRow?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Check access",
    );
    await act(async () => {
      checkAccessButton?.click();
      await Promise.resolve();
    });
    expect(checkConvexAccess).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
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

  it("keeps the connected visual fixture free of GitHub credential controls", () => {
    const markup = renderToStaticMarkup(<ProviderConnectionsPageVisualFixture />);

    expect(markup).toContain("Connected to samebase");
    expect(markup).toContain("Connected (OAuth). Account Samebase Preview.");
    expect(markup).not.toContain("MCP clients");
    expect(markup).not.toContain("Install GitHub App");
    expect(markup).not.toContain("GitHub OAuth");
    expect(markup).not.toContain("Reauthorize GitHub");
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
