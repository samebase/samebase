import { CheckoutStatus } from "@polar-sh/sdk/models/components/checkoutstatus";
import { SubscriptionStatus } from "@polar-sh/sdk/models/components/subscriptionstatus";
import { describe, expect, it } from "vite-plus/test";

import {
  OrganizationDeletionAttentionError,
  polarHasUnsettledCheckout,
  performPolarOrganizationDeletionStep,
  POLAR_ORGANIZATION_DELETION_NONTERMINAL_SUBSCRIPTION_STATUSES,
  type PolarOrganizationDeletionClient,
} from "./providerActions";

function createClient(
  overrides: Partial<PolarOrganizationDeletionClient> = {},
): PolarOrganizationDeletionClient {
  return {
    hasUnsettledCheckout: async () => false,
    findCustomerIdByExternalId: async () => null,
    customerExists: async () => false,
    listNonterminalSubscriptionIds: async () => [],
    revokeSubscription: async () => undefined,
    deleteCustomer: async () => undefined,
    ...overrides,
  };
}

describe("Polar organization deletion", () => {
  it("uses the documented nonterminal subscription states", () => {
    expect(POLAR_ORGANIZATION_DELETION_NONTERMINAL_SUBSCRIPTION_STATUSES).toEqual([
      SubscriptionStatus.Incomplete,
      SubscriptionStatus.Trialing,
      SubscriptionStatus.Active,
      SubscriptionStatus.PastDue,
      SubscriptionStatus.Paused,
    ]);
  });

  it("waits for open or confirmed checkouts before Customer lookup", async () => {
    const calls: string[] = [];
    const client = createClient({
      hasUnsettledCheckout: async () => {
        calls.push("checkout");
        return true;
      },
      findCustomerIdByExternalId: async () => {
        calls.push("customer");
        return "customer-id";
      },
    });

    await expect(
      performPolarOrganizationDeletionStep(client, {
        state: "pending_customer_lookup",
        externalCustomerId: "samebase_external",
      }),
    ).resolves.toEqual({ state: "waiting_for_checkout" });
    expect(calls).toEqual(["checkout"]);
  });

  it("checks both Polar Customer identities for open and confirmed checkouts", async () => {
    const queries: unknown[] = [];

    await expect(
      polarHasUnsettledCheckout(
        {
          list: async (query) => {
            queries.push(query);
            return { result: { items: [] } };
          },
        },
        {
          externalCustomerId: "samebase_external",
          customerId: "customer-id",
        },
      ),
    ).resolves.toBe(false);
    expect(queries).toEqual([
      {
        externalCustomerId: "samebase_external",
        status: [CheckoutStatus.Open, CheckoutStatus.Confirmed],
        limit: 1,
      },
      {
        customerId: "customer-id",
        status: [CheckoutStatus.Open, CheckoutStatus.Confirmed],
        limit: 1,
      },
    ]);
  });

  it("records the internal Customer identity before destructive work", async () => {
    const client = createClient({
      findCustomerIdByExternalId: async () => "customer-id",
    });

    await expect(
      performPolarOrganizationDeletionStep(client, {
        state: "pending_customer_lookup",
        externalCustomerId: "samebase_external",
      }),
    ).resolves.toEqual({ state: "customer_identified", customerId: "customer-id" });
  });

  it("revokes only one subscription in one bounded provider step", async () => {
    const calls: string[] = [];
    const client = createClient({
      customerExists: async () => true,
      listNonterminalSubscriptionIds: async () => ["subscription-one", "subscription-two"],
      revokeSubscription: async (subscriptionId) => {
        calls.push(`revoke:${subscriptionId}`);
      },
      deleteCustomer: async () => {
        calls.push("delete-customer");
      },
    });

    await expect(
      performPolarOrganizationDeletionStep(client, {
        state: "customer_identified",
        externalCustomerId: "samebase_external",
        customerId: "customer-id",
      }),
    ).resolves.toEqual({ state: "needs_more" });
    expect(calls).toEqual(["revoke:subscription-one"]);
  });

  it("deletes the Customer and verifies all charge paths are absent", async () => {
    let deleted = false;
    const calls: string[] = [];
    const client = createClient({
      hasUnsettledCheckout: async () => {
        calls.push("checkout");
        return false;
      },
      customerExists: async () => {
        calls.push("customer");
        return !deleted;
      },
      findCustomerIdByExternalId: async () => {
        calls.push("external-customer");
        return deleted ? null : "customer-id";
      },
      listNonterminalSubscriptionIds: async () => {
        calls.push("subscriptions");
        return [];
      },
      deleteCustomer: async () => {
        calls.push("delete-customer");
        deleted = true;
      },
    });

    await expect(
      performPolarOrganizationDeletionStep(client, {
        state: "customer_identified",
        externalCustomerId: "samebase_external",
        customerId: "customer-id",
      }),
    ).resolves.toEqual({ state: "completed" });
    expect(calls).toEqual([
      "checkout",
      "customer",
      "subscriptions",
      "delete-customer",
      "customer",
      "external-customer",
      "subscriptions",
      "checkout",
    ]);
  });

  it("completes for an already removed Customer only after clean reads", async () => {
    const calls: string[] = [];
    const client = createClient({
      hasUnsettledCheckout: async () => {
        calls.push("checkout");
        return false;
      },
      customerExists: async () => {
        calls.push("customer");
        return false;
      },
      findCustomerIdByExternalId: async () => {
        calls.push("external-customer");
        return null;
      },
      listNonterminalSubscriptionIds: async () => {
        calls.push("subscriptions");
        return [];
      },
    });

    await expect(
      performPolarOrganizationDeletionStep(client, {
        state: "customer_identified",
        externalCustomerId: "samebase_external",
        customerId: "customer-id",
      }),
    ).resolves.toEqual({ state: "completed" });
    expect(calls).toEqual(["checkout", "customer", "external-customer", "subscriptions"]);
  });

  it("reconciles an unknown revoke outcome before it deletes the Customer", async () => {
    let subscriptionExists = true;
    let customerExists = true;
    let revokeAttempts = 0;
    const client = createClient({
      customerExists: async () => customerExists,
      findCustomerIdByExternalId: async () => (customerExists ? "customer-id" : null),
      listNonterminalSubscriptionIds: async () => (subscriptionExists ? ["subscription-id"] : []),
      revokeSubscription: async () => {
        revokeAttempts += 1;
        subscriptionExists = false;
        throw new Error("provider response was lost");
      },
      deleteCustomer: async () => {
        customerExists = false;
      },
    });

    const cleanup = {
      state: "customer_identified" as const,
      externalCustomerId: "samebase_external",
      customerId: "customer-id",
    };
    await expect(performPolarOrganizationDeletionStep(client, cleanup)).rejects.toThrow(
      "provider response was lost",
    );
    await expect(performPolarOrganizationDeletionStep(client, cleanup)).resolves.toEqual({
      state: "completed",
    });
    expect(revokeAttempts).toBe(1);
  });

  it("stops for staff attention when the external Customer identity changes", async () => {
    const client = createClient({
      findCustomerIdByExternalId: async () => "different-customer-id",
    });

    await expect(
      performPolarOrganizationDeletionStep(client, {
        state: "customer_identified",
        externalCustomerId: "samebase_external",
        customerId: "customer-id",
      }),
    ).rejects.toThrow(OrganizationDeletionAttentionError);
  });
});
