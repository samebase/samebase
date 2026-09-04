// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ViewerOrganization } from "@/organization/context";
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
    billingLimited: false,
    canManageBilling: true,
    hasSubscription: false,
    includedMembers: 2,
    memberCapacity: 2,
    memberCount: 2,
    payerState: "unassigned",
    plan: "free",
    purchasedSeatQuantity: 0,
    status: "inactive",
  });
  testState.queries.set(getFunctionName(api.billingResourceQuotas.getViewerBillingResourceUsage), {
    connections: { limit: 6, used: { count: 3, state: "exact" } },
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

  it("starts billing for the routed organization and restores actions after browser return", async () => {
    const createCheckout = vi.fn(() => new Promise<never>(() => undefined));
    testState.actions.set(getFunctionName(api.billing.requestPolarBillingChange), createCheckout);
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
    expect(container.textContent).not.toContain("Add member seat");
    await act(async () => {
      upgradeButton?.click();
      await Promise.resolve();
    });

    expect(createCheckout).toHaveBeenCalledWith({
      change: { kind: "upgrade_to_pro" },
      organizationId: organization.organizationId,
      returnUrl: `${window.location.origin}/org/samebase/settings?checkout=cancel#billing`,
      successUrl: `${window.location.origin}/org/samebase/settings?checkout=success#billing`,
    });
    expect(upgradeButton?.disabled).toBe(true);
    expect(upgradeButton?.textContent).toBe("Updating...");

    const restoredPageShow = new Event("pageshow");
    Object.defineProperty(restoredPageShow, "persisted", { value: true });
    await act(async () => window.dispatchEvent(restoredPageShow));

    expect(upgradeButton?.disabled).toBe(false);
    expect(upgradeButton?.textContent).toBe("Upgrade to Pro, $4/month");
  });

  it("shows the payer and schedules Pro to change to Free", async () => {
    testState.queries.set(getFunctionName(api.billing.getViewerBillingStatus), {
      billingLimited: false,
      canManageBilling: true,
      hasSubscription: true,
      includedMembers: 2,
      memberCapacity: 2,
      memberCount: 2,
      payerState: "viewer",
      plan: "pro",
      purchasedSeatQuantity: 2,
      status: "active",
    });
    const changePlan = vi.fn(() => new Promise<never>(() => undefined));
    testState.actions.set(getFunctionName(api.billing.requestPolarBillingChange), changePlan);
    const container = await mountBillingSection();

    expect(container.textContent).toContain("Billing payerYou");
    const downgradeButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Switch to Free next billing period",
    );
    await act(async () => {
      downgradeButton?.click();
      await Promise.resolve();
    });

    expect(changePlan).toHaveBeenCalledWith({
      change: { kind: "downgrade_to_free" },
      organizationId: organization.organizationId,
      returnUrl: `${window.location.origin}/org/samebase/settings?checkout=cancel#billing`,
      successUrl: `${window.location.origin}/org/samebase/settings?checkout=success#billing`,
    });
  });

  it("lets personal Pro buy a seat before the included capacity is used", async () => {
    testState.queries.set(getFunctionName(api.billing.getViewerBillingStatus), {
      billingLimited: false,
      canManageBilling: true,
      hasSubscription: true,
      includedMembers: 2,
      memberCapacity: 2,
      memberCount: 1,
      payerState: "viewer",
      plan: "pro",
      purchasedSeatQuantity: 2,
      status: "active",
    });
    const addSeat = vi.fn(() => new Promise<never>(() => undefined));
    testState.actions.set(getFunctionName(api.billing.requestPolarBillingChange), addSeat);
    const container = await mountBillingSection({
      ...organization,
      githubOwnerLogin: "billing-owner",
      githubOwnerType: "user",
    });

    const addSeatButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Add member seat, $2/month",
    );
    const removeSeatButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Remove unused seat",
    );
    expect(removeSeatButton?.disabled).toBe(true);
    await act(async () => {
      removeSeatButton?.click();
      await Promise.resolve();
    });
    expect(addSeat).not.toHaveBeenCalled();
    await act(async () => {
      addSeatButton?.click();
      await Promise.resolve();
    });

    expect(addSeat).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Add one member seat?");
    expect(document.body.textContent).toContain(
      "Your subscription will have 3 member seats. Its monthly price increases by $2 to $6.",
    );
    const cancelButton = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel",
    );
    await act(async () => cancelButton?.click());
    expect(document.body.textContent).not.toContain("Add one member seat?");

    await act(async () => addSeatButton?.click());
    const confirmButton = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent === "Add member seat",
    );
    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
    });

    expect(addSeat).toHaveBeenCalledWith(
      expect.objectContaining({
        change: { kind: "add_member_seat", expectedSeatQuantity: 2 },
      }),
    );
    expect(confirmButton?.disabled).toBe(true);
  });

  it("confirms one added seat for a billing-limited organization", async () => {
    testState.queries.set(getFunctionName(api.billing.getViewerBillingStatus), {
      billingLimited: true,
      canManageBilling: true,
      hasSubscription: true,
      includedMembers: 2,
      memberCapacity: 2,
      memberCount: 3,
      payerState: "viewer",
      plan: "pro",
      purchasedSeatQuantity: 2,
      status: "active",
    });
    const restoreCapacity = vi.fn(() => new Promise<never>(() => undefined));
    testState.actions.set(getFunctionName(api.billing.requestPolarBillingChange), restoreCapacity);
    const container = await mountBillingSection();

    const addSeatButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Add member seat, $2/month",
    );
    await act(async () => {
      addSeatButton?.click();
      await Promise.resolve();
    });
    const confirmButton = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent === "Add member seat",
    );
    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
    });

    expect(restoreCapacity).toHaveBeenCalledWith(
      expect.objectContaining({
        change: { kind: "add_member_seat", expectedSeatQuantity: 2 },
      }),
    );
  });

  it("offers explicit seat actions when paid capacity is unused", async () => {
    testState.queries.set(getFunctionName(api.billing.getViewerBillingStatus), {
      billingLimited: false,
      canManageBilling: true,
      hasSubscription: true,
      includedMembers: 2,
      memberCapacity: 3,
      memberCount: 2,
      payerState: "viewer",
      plan: "pro",
      purchasedSeatQuantity: 3,
      status: "active",
    });
    const removeSeat = vi.fn(() => new Promise<never>(() => undefined));
    testState.actions.set(getFunctionName(api.billing.requestPolarBillingChange), removeSeat);
    const container = await mountBillingSection();

    const removeSeatButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Remove unused seat",
    );
    expect(removeSeatButton?.disabled).toBe(false);
    expect(removeSeatButton?.closest('[role="group"]')?.getAttribute("aria-label")).toBe(
      "Member seat actions",
    );
    await act(async () => {
      removeSeatButton?.click();
      await Promise.resolve();
    });

    expect(removeSeat).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Remove one unused member seat?");
    expect(document.body.textContent).toContain(
      "Your subscription will have 2 member seats. Its monthly price decreases by $2 to $4.",
    );
    const confirmButton = [...document.body.querySelectorAll("button")]
      .filter((button) => button.textContent === "Remove unused seat")
      .at(-1);
    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
    });

    expect(removeSeat).toHaveBeenCalledWith(
      expect.objectContaining({
        change: { kind: "remove_member_seat", expectedSeatQuantity: 3 },
      }),
    );
    expect(confirmButton?.textContent).toBe("Removing...");
  });

  it("hides plan and seat changes after cancellation is scheduled", async () => {
    testState.queries.set(getFunctionName(api.billing.getViewerBillingStatus), {
      billingLimited: true,
      canManageBilling: true,
      cancelAtPeriodEnd: true,
      currentPeriodEndAt: Date.UTC(2026, 8, 1),
      hasSubscription: true,
      includedMembers: 2,
      memberCapacity: 2,
      memberCount: 3,
      payerState: "viewer",
      plan: "pro",
      purchasedSeatQuantity: 2,
      status: "active",
    });
    const container = await mountBillingSection();

    expect(container.textContent).toContain("Next planFree");
    expect(container.textContent).toContain("Manage subscription");
    expect(container.textContent).not.toContain("Switch to Free");
    expect(container.textContent).not.toContain("Restore member access");
    expect(container.textContent).not.toContain("Add member seat");
    expect(container.textContent).not.toContain("Remove unused seat");
  });

  it("shows billing data but hides billing actions from a member", async () => {
    testState.queries.set(getFunctionName(api.billing.getViewerBillingStatus), {
      billingLimited: false,
      canManageBilling: false,
      hasSubscription: true,
      includedMembers: 2,
      memberCapacity: 3,
      memberCount: 3,
      payerState: "another_owner",
      plan: "pro",
      purchasedSeatQuantity: 3,
      status: "active",
    });
    const container = await mountBillingSection({ ...organization, role: "member" });

    expect(container.textContent).toContain("Current plan");
    expect(container.textContent).toContain("Pro");
    expect(container.textContent).toContain("3 of 3");
    expect(container.textContent).not.toContain("Manage subscription");
    expect(container.textContent).not.toContain("Upgrade to Pro");
  });

  it("explains why billing actions stop during a payer transfer", async () => {
    testState.queries.set(getFunctionName(api.billing.getViewerBillingStatus), {
      billingLimited: false,
      canManageBilling: false,
      hasSubscription: true,
      includedMembers: 2,
      memberCapacity: 2,
      memberCount: 2,
      payerState: "viewer",
      plan: "pro",
      purchasedSeatQuantity: 2,
      status: "active",
    });
    const container = await mountBillingSection();

    expect(container.textContent).toContain(
      "Finish the billing payer transfer on the Members page before changing billing.",
    );
    expect(container.textContent).not.toContain("Add member seat");
    expect(container.textContent).not.toContain("Manage subscription");
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
