import type { Polar } from "@polar-sh/sdk";
import {
  CheckoutStatus,
  type CheckoutStatus as PolarCheckoutStatus,
} from "@polar-sh/sdk/models/components/checkoutstatus";
import {
  SubscriptionStatus,
  type SubscriptionStatus as PolarSubscriptionStatus,
} from "@polar-sh/sdk/models/components/subscriptionstatus";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";

import type { ActiveOrganizationDeletionProviderCleanup } from "./model";

const POLAR_PAGE_SIZE = 1;

type PolarUnsettledCheckoutQuery = {
  externalCustomerId?: string;
  customerId?: string;
  status: PolarCheckoutStatus[];
  limit: number;
};

type PolarCheckoutListClient = {
  list: (query: PolarUnsettledCheckoutQuery) => Promise<{ result: { items: readonly unknown[] } }>;
};

export const POLAR_ORGANIZATION_DELETION_NONTERMINAL_SUBSCRIPTION_STATUSES: PolarSubscriptionStatus[] =
  [
    SubscriptionStatus.Incomplete,
    SubscriptionStatus.Trialing,
    SubscriptionStatus.Active,
    SubscriptionStatus.PastDue,
    SubscriptionStatus.Paused,
  ];

export class OrganizationDeletionAttentionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationDeletionAttentionError";
  }
}

function isPolarNotFound(error: unknown): boolean {
  return error instanceof PolarError && error.statusCode === 404;
}

export async function polarHasUnsettledCheckout(
  checkouts: PolarCheckoutListClient,
  identity: { externalCustomerId: string } | { externalCustomerId: string; customerId: string },
): Promise<boolean> {
  const statuses: PolarCheckoutStatus[] = [CheckoutStatus.Open, CheckoutStatus.Confirmed];
  const external = await checkouts.list({
    externalCustomerId: identity.externalCustomerId,
    status: statuses,
    limit: 1,
  });
  if (external.result.items.length > 0) {
    return true;
  }
  if (!("customerId" in identity)) {
    return false;
  }

  const internal = await checkouts.list({
    customerId: identity.customerId,
    status: statuses,
    limit: 1,
  });
  return internal.result.items.length > 0;
}

async function findCustomerByExternalId(polar: Polar, externalCustomerId: string) {
  try {
    return await polar.customers.getExternal({ externalId: externalCustomerId });
  } catch (error) {
    if (isPolarNotFound(error)) {
      return null;
    }
    throw error;
  }
}

async function findCustomerById(polar: Polar, customerId: string) {
  try {
    return await polar.customers.get({ id: customerId });
  } catch (error) {
    if (isPolarNotFound(error)) {
      return null;
    }
    throw error;
  }
}

async function listNonterminalSubscriptions(polar: Polar, customerId: string) {
  const page = await polar.subscriptions.list({
    customerId,
    status: POLAR_ORGANIZATION_DELETION_NONTERMINAL_SUBSCRIPTION_STATUSES,
    limit: POLAR_PAGE_SIZE,
  });
  return page.result.items;
}

export type PolarOrganizationDeletionClient = {
  hasUnsettledCheckout: (
    identity: { externalCustomerId: string } | { externalCustomerId: string; customerId: string },
  ) => Promise<boolean>;
  findCustomerIdByExternalId: (externalCustomerId: string) => Promise<string | null>;
  customerExists: (customerId: string) => Promise<boolean>;
  listNonterminalSubscriptionIds: (customerId: string) => Promise<string[]>;
  revokeSubscription: (subscriptionId: string) => Promise<void>;
  deleteCustomer: (customerId: string) => Promise<void>;
};

export function createPolarOrganizationDeletionClient(
  polar: Polar,
): PolarOrganizationDeletionClient {
  return {
    hasUnsettledCheckout: async (identity) =>
      await polarHasUnsettledCheckout(polar.checkouts, identity),
    findCustomerIdByExternalId: async (externalCustomerId) =>
      (await findCustomerByExternalId(polar, externalCustomerId))?.id ?? null,
    customerExists: async (customerId) => (await findCustomerById(polar, customerId)) !== null,
    listNonterminalSubscriptionIds: async (customerId) =>
      (await listNonterminalSubscriptions(polar, customerId)).map(
        (subscription) => subscription.id,
      ),
    revokeSubscription: async (subscriptionId) => await revokeSubscription(polar, subscriptionId),
    deleteCustomer: async (customerId) => {
      try {
        await polar.customers.delete({ id: customerId, anonymize: true });
      } catch (error) {
        if (!isPolarNotFound(error)) {
          throw error;
        }
      }
    },
  };
}

async function revokeSubscription(polar: Polar, subscriptionId: string): Promise<void> {
  try {
    await polar.subscriptions.revoke({ id: subscriptionId });
  } catch (error) {
    if (!isPolarNotFound(error)) {
      throw error;
    }
  }
}

export type PolarOrganizationDeletionStepResult =
  | { state: "customer_identified"; customerId: string }
  | { state: "waiting_for_checkout" }
  | { state: "needs_more" }
  | { state: "completed" };

/** Performs one bounded, provider-read-led Polar cleanup step. */
export async function performPolarOrganizationDeletionStep(
  polar: PolarOrganizationDeletionClient,
  cleanup: Exclude<ActiveOrganizationDeletionProviderCleanup, { state: "not_required" }>,
): Promise<PolarOrganizationDeletionStepResult> {
  if (cleanup.state === "completed") {
    return { state: "completed" };
  }

  if (cleanup.state === "pending_customer_lookup") {
    if (
      await polar.hasUnsettledCheckout({
        externalCustomerId: cleanup.externalCustomerId,
      })
    ) {
      return { state: "waiting_for_checkout" };
    }
    const customerId = await polar.findCustomerIdByExternalId(cleanup.externalCustomerId);
    if (customerId === null) {
      return { state: "completed" };
    }
    return { state: "customer_identified", customerId };
  }

  const identity = {
    externalCustomerId: cleanup.externalCustomerId,
    customerId: cleanup.customerId,
  };
  if (await polar.hasUnsettledCheckout(identity)) {
    return { state: "waiting_for_checkout" };
  }

  if (!(await polar.customerExists(cleanup.customerId))) {
    const externalCustomerId = await polar.findCustomerIdByExternalId(cleanup.externalCustomerId);
    if (externalCustomerId !== null) {
      throw new OrganizationDeletionAttentionError(
        "Polar Customer identity changed during organization deletion.",
      );
    }
    const subscriptionIds = await polar.listNonterminalSubscriptionIds(cleanup.customerId);
    if (subscriptionIds.length > 0) {
      throw new OrganizationDeletionAttentionError(
        "Polar subscriptions still need cleanup for this organization.",
      );
    }
    return { state: "completed" };
  }

  const subscriptionIds = await polar.listNonterminalSubscriptionIds(cleanup.customerId);
  const subscriptionId = subscriptionIds.at(0);
  if (subscriptionId !== undefined) {
    await polar.revokeSubscription(subscriptionId);
    return { state: "needs_more" };
  }

  await polar.deleteCustomer(cleanup.customerId);

  const [customerAfterDelete, externalCustomerAfterDelete, subscriptionsAfterDelete] =
    await Promise.all([
      polar.customerExists(cleanup.customerId),
      polar.findCustomerIdByExternalId(cleanup.externalCustomerId),
      polar.listNonterminalSubscriptionIds(cleanup.customerId),
    ]);
  if (
    customerAfterDelete ||
    externalCustomerAfterDelete !== null ||
    subscriptionsAfterDelete.length > 0 ||
    (await polar.hasUnsettledCheckout(identity))
  ) {
    throw new OrganizationDeletionAttentionError(
      "Polar billing cleanup could not be verified for this organization.",
    );
  }

  return { state: "completed" };
}
