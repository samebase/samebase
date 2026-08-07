// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ViewerOrganization } from "@/lib/organizationContext";
import { OrganizationBillingSection } from "./OrganizationBillingSection";

const { act } = React;

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // a stable value for client function arguments.
  return value;
}

const organization = {
  canCreateRepository: true,
  githubOwnerId: "456",
  githubOwnerLogin: "Samebase",
  githubOwnerType: "organization" as const,
  organizationId: fakeOrganizationId("organization_samebase"),
  role: "owner" as const,
} satisfies ViewerOrganization;

const testState = vi.hoisted(() => ({
  actions: new Map<string, (args: unknown) => Promise<unknown>>(),
  clearedSearches: new Array<Record<string, unknown>>(),
  queries: new Map<string, unknown>(),
  queryCalls: new Array<{ args: unknown; name: string }>(),
  navigate: vi.fn(
    async (options: { search?: (current: Record<string, unknown>) => Record<string, unknown> }) => {
      if (options.search) {
        testState.clearedSearches.push(
          options.search({ checkout: "success", customer_session_token: true, dev: true }),
        );
      }
    },
  ),
}));

vi.mock("@/routing/availability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/routing/availability")>();
  return { ...actual, readBrowserRouteEnvironment: () => "production" };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    getRouteApi: () => ({ useNavigate: () => testState.navigate }),
    useRouter: () => ({
      buildLocation: ({
        hash,
        params,
        search,
        to,
      }: {
        hash: string;
        params: { owner: string };
        search: (current: Record<string, unknown>) => Record<string, unknown>;
        to: string;
      }) => {
        const searchParams = new window.URLSearchParams();
        for (const [key, value] of Object.entries(search({}))) {
          if (value === true) searchParams.set(key, "");
          if (typeof value === "string") searchParams.set(key, value);
        }
        const pathname = to.replace("$owner", params.owner);
        return {
          href: `${pathname}${searchParams.size > 0 ? `?${searchParams}` : ""}#${hash}`,
        };
      },
    }),
  };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) =>
      testState.actions.get(getFunctionName(reference)) ?? vi.fn(async () => undefined),
    useQuery: (reference: Parameters<typeof actual.useQuery>[0], args: unknown) => {
      const name = getFunctionName(reference);
      testState.queryCalls.push({ args, name });
      return testState.queries.get(name);
    },
  };
});

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

async function mountBillingSection(
  selectedOrganization: ViewerOrganization = organization,
  search: React.ComponentProps<typeof OrganizationBillingSection>["search"] = {},
) {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);
  await act(async () =>
    root?.render(
      <OrganizationBillingSection organization={selectedOrganization} search={search} />,
    ),
  );
  return rootElement;
}

function setBillingQueries() {
  testState.queries.set(getFunctionName(api.billing.getViewerBillingStatus), {
    canStartCheckout: true,
    plan: "free",
    status: "inactive",
  });
  testState.queries.set(getFunctionName(api.billingResourceQuotas.getViewerBillingResourceUsage), {
    cloudflareWorkers: { limit: 5, used: { count: 1, state: "exact" } },
    convexProjects: { limit: 5, used: { count: 2, state: "exact" } },
  });
}

describe("OrganizationBillingSection", () => {
  beforeEach(() => {
    testState.actions.clear();
    testState.clearedSearches = [];
    testState.queries.clear();
    testState.queryCalls = [];
    testState.navigate.mockClear();
    setBillingQueries();
  });

  afterEach(async () => {
    if (root !== null) {
      await act(async () => root?.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  it("reads and starts billing for the routed organization", async () => {
    const createCheckout = vi.fn(() => new Promise<never>(() => undefined));
    testState.actions.set(getFunctionName(api.billing.createPolarCheckoutSession), createCheckout);
    const container = await mountBillingSection();

    expect(testState.queryCalls).toContainEqual({
      args: { organizationId: organization.organizationId },
      name: getFunctionName(api.billing.getViewerBillingStatus),
    });
    expect(testState.queryCalls).toContainEqual({
      args: { organizationId: organization.organizationId },
      name: getFunctionName(api.billingResourceQuotas.getViewerBillingResourceUsage),
    });
    const upgradeButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Upgrade to Pro, $4/month",
    );
    await act(async () => {
      upgradeButton?.click();
      await Promise.resolve();
    });

    expect(createCheckout).toHaveBeenCalledWith({
      organizationId: organization.organizationId,
      returnUrl: `${window.location.origin}/org/samebase/settings?checkout=cancel#billing`,
      successUrl: `${window.location.origin}/org/samebase/settings?checkout=success#billing`,
    });
  });

  it("shows billing data but hides billing actions from a member", async () => {
    testState.queries.set(getFunctionName(api.billing.getViewerBillingStatus), {
      canStartCheckout: false,
      plan: "pro",
      status: "active",
    });
    const container = await mountBillingSection({ ...organization, role: "member" });

    expect(container.textContent).toContain("Current plan");
    expect(container.textContent).toContain("Pro");
    expect(container.textContent).not.toContain("Manage subscription");
    expect(container.textContent).not.toContain("Upgrade to Pro");
  });

  it("clears a checkout success return without showing preview copy to a member", async () => {
    const container = await mountBillingSection(
      { ...organization, role: "member" },
      { checkout: "success", customer_session_token: true },
    );

    expect(container.textContent).not.toContain(
      "Checkout confirmation is disabled in this preview.",
    );
    expect(testState.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ replace: true, resetScroll: false, to: "." }),
    );
    expect(testState.clearedSearches).toEqual([
      {
        checkout: undefined,
        customer_session_token: undefined,
        dev: true,
      },
    ]);
  });
});
