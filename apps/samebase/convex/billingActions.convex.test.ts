import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ProviderStep =
  | "customer_get"
  | "customer_create"
  | "customer_member_get"
  | "checkout_create"
  | "portal_create"
  | "subscription_update";

const providerStepMock = vi.hoisted(() => vi.fn<(step: ProviderStep) => Promise<void>>());
const providerState = vi.hoisted(() => ({
  mode: "inactive",
  reconcileCount: 0,
  updatedSeats: 2,
}));

vi.mock("./polarClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./polarClient")>();
  return {
    ...actual,
    createPolarClient: () => ({
      checkouts: {
        create: async (args: {
          products: string[];
          externalCustomerId: string;
          seats: number;
          successUrl: string;
          returnUrl: string;
          metadata: Record<string, string | number | boolean>;
        }) => {
          await providerStepMock("checkout_create");
          return {
            id: "checkout-test",
            externalCustomerId: args.externalCustomerId,
            metadata: args.metadata,
            products: args.products.map((id) => ({ id })),
            seats: args.seats,
            successUrl: args.successUrl,
            returnUrl: args.returnUrl,
            status: "open",
            expiresAt: new Date(Date.now() + 60_000),
            url: "https://sandbox.polar.sh/checkout-test",
          };
        },
      },
      customerSessions: {
        create: async () => {
          await providerStepMock("portal_create");
          return { customerPortalUrl: "https://sandbox.polar.sh/portal-test" };
        },
      },
      customers: {
        getExternal: async () => {
          await providerStepMock("customer_get");
          throw new PolarError("Customer not found", {
            request: new Request("https://api.polar.sh/v1/customers/external/test"),
            response: new Response("", { status: 404 }),
            body: "",
          });
        },
        create: async (args: { externalId: string; name: string }) => {
          await providerStepMock("customer_create");
          return {
            id: "polar-team-customer",
            type: "team",
            externalId: args.externalId,
            name: args.name,
            deletedAt: null,
          };
        },
        members: {
          getExternal: async (args: { memberExternalId: string }) => {
            await providerStepMock("customer_member_get");
            return {
              customerId: "polar-team-customer",
              externalId: args.memberExternalId,
              role: "owner",
            };
          },
        },
      },
      subscriptions: {
        update: async (args: { subscriptionUpdate: { seats?: number } }) => {
          await providerStepMock("subscription_update");
          providerState.updatedSeats = args.subscriptionUpdate.seats ?? providerState.updatedSeats;
          return null;
        },
      },
    }),
    readPolarProductCatalog: () => ({
      organization: { free: "organization-free", pro: "organization-pro" },
      user: { free: "user-free", pro: "user-pro" },
    }),
    resolvePolarServer: () => "sandbox",
  };
});

vi.mock("./polarBillingState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./polarBillingState")>();
  return {
    ...actual,
    reconcilePolarCustomerBilling: async (_ctx: unknown, args: { externalCustomerId: string }) => {
      providerState.reconcileCount += 1;
      if (providerState.mode === "inactive") {
        return {
          status: "inactive",
          plan: "free",
          externalCustomerId: args.externalCustomerId,
        };
      }
      return {
        status: "active",
        plan: "free",
        externalCustomerId: args.externalCustomerId,
        subscriptionId: "subscription-test",
        polarSeatQuantity: providerState.reconcileCount === 1 ? 3 : providerState.updatedSeats,
        currentPeriodEndAt: Date.now() + 86_400_000,
        cancelAtPeriodEnd: false,
      };
    },
  };
});

async function seedBillingOrganization(
  t: ReturnType<typeof makeConvexTest>,
  status: "inactive" | "active",
) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "billing-action-owner@example.invalid",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "billing-action-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "BillingActionOrg",
      githubOwnerLoginNormalized: "billingactionorg",
      githubInstallationId: "billing-action-installation",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
    });
    const billingAccountId = await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      provider: "polar",
      plan: "free",
      status,
      polarExternalCustomerId: "polar-external-customer",
      polarBillingUserId: userId,
      ...(status === "active"
        ? {
            polarSeatQuantity: 3,
            currentPeriodEndAt: Date.now() + 86_400_000,
            cancelAtPeriodEnd: false,
          }
        : {}),
    });
    return { billingAccountId, organizationId, userId };
  });
  return {
    ...ids,
    owner: t.withIdentity({
      subject: `${ids.userId}|billing-action-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

async function startDeletionGate(
  t: ReturnType<typeof makeConvexTest>,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
  },
) {
  return await t.run(async (ctx) => {
    const runId = await ctx.db.insert("workflow_organizationDeletion_runs", {
      state: "running",
      organization: {
        state: "active",
        organizationId: args.organizationId,
        githubOwnerLogin: "BillingActionOrg",
      },
      requestedByUserId: args.userId,
      currentStep: "wait_for_active_work",
      requestedAt: 1,
      updatedAt: 1,
      retryCount: 0,
      executionAttempt: 1,
      automaticRestartCount: 0,
      providerCleanup: {
        state: "pending_customer_lookup",
        externalCustomerId: "polar-external-customer",
      },
    });
    await ctx.db.patch(args.organizationId, {
      deletion: { state: "deleting", runId, requestedAt: 1 },
    });
    return runId;
  });
}

async function readBillingActionLeases(
  t: ReturnType<typeof makeConvexTest>,
  organizationId: Id<"organizations">,
) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("organizationBillingActionLeases")
      .withIndex("by_organization_and_expires_at", (query) =>
        query.eq("organizationId", organizationId),
      )
      .collect();
  });
}

describe("Polar billing action deletion fence", () => {
  beforeEach(() => {
    providerState.mode = "inactive";
    providerState.reconcileCount = 0;
    providerState.updatedSeats = 2;
    providerStepMock.mockReset();
    providerStepMock.mockResolvedValue(undefined);
  });

  it("holds one lease from Customer creation through checkout recording", async () => {
    const t = makeConvexTest();
    const seed = await seedBillingOrganization(t, "inactive");
    let leaseIdAtCustomerCreate: Id<"organizationBillingActionLeases"> | null = null;

    providerStepMock.mockImplementation(async (step) => {
      const leases = await readBillingActionLeases(t, seed.organizationId);
      expect(leases).toHaveLength(1);
      expect(leases[0]?.operation).toBe("billing_change");
      if (step === "customer_create") {
        leaseIdAtCustomerCreate = leases[0]?._id ?? null;
      }
      if (step === "checkout_create") {
        expect(leases[0]?._id).toBe(leaseIdAtCustomerCreate);
        await startDeletionGate(t, seed);
      }
    });

    await expect(
      seed.owner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: "upgrade_to_pro",
        successUrl: "http://localhost/org/BillingActionOrg/settings",
        returnUrl: "http://localhost/org/BillingActionOrg/settings",
      }),
    ).rejects.toThrow("Organization deletion is in progress.");

    const state = await t.run(async (ctx) => ({
      billing: await ctx.db.get(seed.billingAccountId),
      leases: await ctx.db.query("organizationBillingActionLeases").collect(),
    }));
    expect(state.billing?.polarCheckoutAttempt).toEqual({
      state: "open",
      attemptId: expect.any(String),
      checkoutId: "checkout-test",
    });
    expect(state.leases).toEqual([]);
  });

  it("keeps the portal lease visible until the provider call returns", async () => {
    const t = makeConvexTest();
    const seed = await seedBillingOrganization(t, "active");

    providerStepMock.mockImplementation(async (step) => {
      if (step !== "portal_create") {
        return;
      }
      const runId = await startDeletionGate(t, seed);
      await expect(
        t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
          runId,
          executionAttempt: 1,
        }),
      ).resolves.toEqual({ state: "waiting", blocker: "active_polar_billing_action" });
    });

    await expect(
      seed.owner.action(api.billing.createPolarCustomerPortalSession, {
        organizationId: seed.organizationId,
        returnUrl: "http://localhost/org/BillingActionOrg/settings",
      }),
    ).rejects.toThrow("Organization deletion is in progress.");
    await expect(readBillingActionLeases(t, seed.organizationId)).resolves.toEqual([]);
  });

  it("waits for a scheduled seat update that started before deletion", async () => {
    const t = makeConvexTest();
    const seed = await seedBillingOrganization(t, "active");
    providerState.mode = "seat_sync";

    providerStepMock.mockImplementation(async (step) => {
      if (step !== "subscription_update") {
        return;
      }
      const runId = await startDeletionGate(t, seed);
      await expect(
        t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
          runId,
          executionAttempt: 1,
        }),
      ).resolves.toEqual({ state: "waiting", blocker: "active_polar_billing_action" });
    });

    await expect(
      t.action(internal.billing.syncPolarSubscriptionSeats, {
        organizationId: seed.organizationId,
      }),
    ).resolves.toBeNull();
    expect(providerState.updatedSeats).toBe(2);
    await expect(readBillingActionLeases(t, seed.organizationId)).resolves.toEqual([]);
  });
});
