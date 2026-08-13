import type { Checkout } from "@polar-sh/sdk/models/components/checkout";
import type { Customer } from "@polar-sh/sdk/models/components/customer";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import { ConvexError, Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { action, query } from "./functions";
import { findOrganizationMembership } from "./organizationAccess";
import {
  findBillingAccountForOrganization,
  patchBillingAccount,
  readBillingAccountState,
  requireBillingAccountForOrganization,
  requireOwnerBillingAccountForOrganization,
} from "./organizationBilling";
import {
  PRO_INCLUDED_ORGANIZATION_MEMBERS,
  readOrganizationMemberCapacity,
  readOrganizationMembershipCount,
} from "./organizationBillingLimits";
import { randomToken } from "./oauthUtils";
import { reconcilePolarCustomerBilling, type PolarBillingState } from "./polarBillingState";
import {
  canClearPolarCheckoutAfterObservation,
  isDefinitivePolarCheckoutFailure,
  isOpenPolarCheckoutForAttempt,
  matchesPolarCheckoutReservation,
  type PolarCheckoutReservation,
} from "./polarCheckout";
import {
  createPolarClient,
  readPolarErrorLogFields,
  readPolarCheckoutProductId,
  readPolarProductCatalog,
  resolvePolarServer,
  type PolarServer,
} from "./polarClient";
import { readActiveUser, vActiveUserDoc } from "./userLifecycle";
import { normalizeAccountEmail, resolveAccountPresentation } from "../shared/accountPresentation";
import schema from "./schema";
import { vOrganizationMembershipRole } from "./organizationModel";

const { boolean, id, literal, null: vNull, number, object, optional, string, union } = v;

const vBillingPlan = union(literal("free"), literal("pro"));

const vBillingStatus = union(literal("inactive"), literal("active"), literal("past_due"));

const vBillingPayerState = union(
  literal("unassigned"),
  literal("viewer"),
  literal("another_owner"),
);

const vViewerBillingStatus = object({
  plan: vBillingPlan,
  status: vBillingStatus,
  currentPeriodEndAt: optional(number()),
  cancelAtPeriodEnd: optional(boolean()),
  provider: optional(literal("polar")),
  payerState: vBillingPayerState,
  canManageBilling: boolean(),
  hasSubscription: boolean(),
  memberCount: number(),
  includedMembers: number(),
  memberCapacity: number(),
  billingLimited: boolean(),
});
type ViewerBillingStatus = Infer<typeof vViewerBillingStatus>;

const vPolarBillingChange = union(
  literal("upgrade_to_pro"),
  literal("downgrade_to_free"),
  literal("add_member_seat"),
  literal("remove_member_seat"),
);

const vPolarBillingChangeResult = union(
  object({ state: literal("checkout"), url: string() }),
  object({ state: literal("updated") }),
);
type PolarBillingChangeResult = Infer<typeof vPolarBillingChangeResult>;

const vPolarPortalSession = object({ url: string() });

const vPolarBillingReconciliationResult = union(
  object({ state: literal("observed"), plan: vBillingPlan, hasSubscription: boolean() }),
  object({ state: literal("unavailable") }),
);
type PolarBillingReconciliationResult = Infer<typeof vPolarBillingReconciliationResult>;

const vPolarCustomerSeed = object({
  externalCustomerId: string(),
  githubOwnerLogin: string(),
  memberCount: number(),
  payerUserId: id("users"),
  payerName: optional(string()),
  payerEmail: string(),
});
type PolarCustomerSeed = Infer<typeof vPolarCustomerSeed>;

const vOrganizationBillingAccountDoc = schema.tables.organizationBillingAccounts.validator.extend({
  _id: id("organizationBillingAccounts"),
  _creationTime: number(),
});

const vUserBillingAccount = object({
  account: vOrganizationBillingAccountDoc,
  role: vOrganizationMembershipRole,
  user: vActiveUserDoc,
});

function isOrganizationSettingsPath(url: URL, githubOwnerLoginNormalized: string): boolean {
  const segments = url.pathname.split("/");
  if (
    segments.length !== 4 ||
    segments[0] !== "" ||
    segments[1] !== "org" ||
    segments[3] !== "settings"
  ) {
    return false;
  }

  try {
    return decodeURIComponent(segments[2]).toLowerCase() === githubOwnerLoginNormalized;
  } catch {
    return false;
  }
}

export function validateOrganizationBillingReturnUrls(args: {
  githubOwnerLogin: string;
  successUrl: string;
  returnUrl: string;
  server: PolarServer;
}): { successUrl: string; returnUrl: string } {
  let success: URL;
  let ret: URL;
  try {
    success = new URL(args.successUrl);
    ret = new URL(args.returnUrl);
  } catch {
    throw new ConvexError("Invalid checkout return URL.");
  }

  if (success.origin !== ret.origin) {
    throw new ConvexError("Checkout return URLs must share the same origin.");
  }

  const githubOwnerLogin = args.githubOwnerLogin.trim().toLowerCase();
  if (!githubOwnerLogin) {
    throw new ConvexError("Checkout return URL owner is unavailable.");
  }
  if (
    !isOrganizationSettingsPath(success, githubOwnerLogin) ||
    !isOrganizationSettingsPath(ret, githubOwnerLogin)
  ) {
    throw new ConvexError("Checkout return URLs must target this organization settings page.");
  }

  if (args.server === "production") {
    if (success.origin !== "https://samebase.com") {
      throw new ConvexError("Checkout return URL origin is not allowed.");
    }
  } else {
    const hostname = success.hostname;
    if (success.protocol !== "http:") {
      throw new ConvexError("Checkout return URL must be http in local development.");
    }
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new ConvexError("Checkout return URL host is not allowed.");
    }
  }

  return { successUrl: success.toString(), returnUrl: ret.toString() };
}

function hasPolarSubscription(state: PolarBillingState): boolean {
  return state.status === "active" || state.status === "past_due";
}

async function reconcilePolarBillingTwiceIfNeeded(
  ctx: Parameters<typeof reconcilePolarCustomerBilling>[0],
  args: Parameters<typeof reconcilePolarCustomerBilling>[1],
): Promise<PolarBillingState> {
  const first = await reconcilePolarCustomerBilling(ctx, args);
  if (first !== null) {
    return first;
  }
  const second = await reconcilePolarCustomerBilling(ctx, args);
  if (second === null) {
    throw new Error("Polar billing observation was superseded twice.");
  }
  return second;
}

function isPolarNotFound(error: unknown): boolean {
  return error instanceof PolarError && error.statusCode === 404;
}

function requireExpectedPolarTeamCustomer(
  customer: Customer,
  externalCustomerId: string,
): Extract<Customer, { type: "team" }> {
  if (
    customer.type !== "team" ||
    customer.externalId !== externalCustomerId ||
    customer.deletedAt !== null
  ) {
    throw new Error("Polar billing customer is not the expected active team Customer.");
  }
  return customer;
}

async function ensurePolarTeamCustomer(
  polar: ReturnType<typeof createPolarClient>,
  seed: PolarCustomerSeed,
): Promise<Extract<Customer, { type: "team" }>> {
  let customer: Customer;
  try {
    customer = await polar.customers.getExternal({ externalId: seed.externalCustomerId });
  } catch (error) {
    if (!isPolarNotFound(error)) {
      throw error;
    }
    try {
      customer = await polar.customers.create({
        type: "team",
        externalId: seed.externalCustomerId,
        name: seed.githubOwnerLogin,
        owner: {
          externalId: seed.payerUserId,
          email: seed.payerEmail,
          ...(seed.payerName ? { name: seed.payerName } : {}),
        },
      });
    } catch (createError) {
      try {
        customer = await polar.customers.getExternal({ externalId: seed.externalCustomerId });
      } catch {
        throw createError;
      }
    }
  }

  const teamCustomer = requireExpectedPolarTeamCustomer(customer, seed.externalCustomerId);
  const payerMember = await polar.customers.members.getExternal({
    externalId: seed.externalCustomerId,
    memberExternalId: seed.payerUserId,
  });
  if (
    payerMember.customerId !== teamCustomer.id ||
    payerMember.externalId !== seed.payerUserId ||
    payerMember.role !== "owner"
  ) {
    throw new Error("Polar billing payer is not the expected team Customer owner Member.");
  }
  return teamCustomer;
}

export const getViewerBillingStatus = query({
  access: "access_dashboard",
  args: { organizationId: id("organizations") },
  returns: vViewerBillingStatus,
  handler: async (ctx, args): Promise<ViewerBillingStatus> => {
    const billing = await requireBillingAccountForOrganization(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    const state = readBillingAccountState(billing.account);
    const capacity = readOrganizationMemberCapacity({ account: billing.account, organization });
    const memberCount = await readOrganizationMembershipCount(ctx.db, args.organizationId);
    const payerState =
      state.polarBillingUserId === undefined
        ? "unassigned"
        : state.polarBillingUserId === ctx.viewer.userId
          ? "viewer"
          : "another_owner";

    return {
      provider: state.provider,
      plan: state.plan,
      status: state.status,
      currentPeriodEndAt: state.currentPeriodEndAt,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      payerState,
      canManageBilling:
        billing.role === "owner" &&
        payerState !== "another_owner" &&
        ctx.viewer.accessKeys.includes("access_dashboard"),
      hasSubscription: capacity.hasVerifiedSubscription,
      memberCount,
      includedMembers: capacity.includedMembers,
      memberCapacity: capacity.capacity,
      billingLimited: memberCount > capacity.capacity,
    };
  },
});

export const getBillingAccountForOrganization = internalQuery({
  args: { userId: id("users"), organizationId: id("organizations") },
  returns: union(vUserBillingAccount, v.null()),
  handler: async (ctx, args) => await findBillingAccountForOrganization(ctx.db, args),
});

export const confirmCurrentBillingPayer = internalQuery({
  args: { userId: id("users"), organizationId: id("organizations") },
  returns: vNull(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const membership = await findOrganizationMembership(ctx.db, args);
    const account = await ctx.db
      .query("organizationBillingAccounts")
      .withIndex("by_organization", (builder) => builder.eq("organizationId", args.organizationId))
      .unique();
    if (
      user === null ||
      readActiveUser(user) === null ||
      membership?.role !== "owner" ||
      account?.polarBillingUserId !== args.userId
    ) {
      throw new ConvexError("Only the designated billing payer can manage this subscription.");
    }
    return null;
  },
});

export const reservePolarTeamCustomerIdentity = internalMutation({
  args: { userId: id("users"), organizationId: id("organizations") },
  returns: vPolarCustomerSeed,
  handler: async (ctx, args): Promise<PolarCustomerSeed> => {
    const billing = await requireOwnerBillingAccountForOrganization(ctx.db, args);
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    const state = readBillingAccountState(billing.account);
    if (state.polarBillingUserId !== undefined && state.polarBillingUserId !== args.userId) {
      throw new ConvexError("Only the designated billing payer can manage this subscription.");
    }

    const externalCustomerId =
      state.polarExternalCustomerId?.trim() || `samebase_${randomToken(24)}`;
    if (
      state.polarBillingUserId !== args.userId ||
      state.polarExternalCustomerId !== externalCustomerId
    ) {
      await patchBillingAccount(ctx.db, billing.account, {
        polarBillingUserId: args.userId,
        polarExternalCustomerId: externalCustomerId,
      });
    }

    const accountPresentation = resolveAccountPresentation(billing.user);
    return {
      externalCustomerId,
      githubOwnerLogin: organization.githubOwnerLogin,
      memberCount: await readOrganizationMembershipCount(ctx.db, args.organizationId),
      payerUserId: args.userId,
      ...(accountPresentation.kind === "displayName"
        ? { payerName: accountPresentation.label }
        : {}),
      payerEmail: normalizeAccountEmail(billing.user.email),
    };
  },
});

function requireBillingChangeAllowed(state: PolarBillingState): void {
  if (state.status === "past_due") {
    throw new ConvexError("Resolve the past-due subscription in the billing portal first.");
  }
  if (state.status === "active" && state.cancelAtPeriodEnd) {
    throw new ConvexError("Reactivate the subscription in the billing portal first.");
  }
}

export const requestPolarBillingChange = action({
  access: "access_dashboard",
  args: object({
    organizationId: id("organizations"),
    change: vPolarBillingChange,
    successUrl: string(),
    returnUrl: string(),
  }),
  returns: vPolarBillingChangeResult,
  handler: async (ctx, args): Promise<PolarBillingChangeResult> => {
    const userId = ctx.viewer.userId;
    const organizationId = args.organizationId;
    const catalog = readPolarProductCatalog();
    if (catalog === null) {
      throw new ConvexError("Polar billing products are not configured yet.");
    }
    let checkoutProductId: string | null = null;
    if (args.change === "upgrade_to_pro") {
      try {
        checkoutProductId = readPolarCheckoutProductId(catalog);
      } catch {
        throw new ConvexError("Polar checkout is not configured yet.");
      }
    }
    const currentBilling = await ctx.runQuery(internal.billing.getBillingAccountForOrganization, {
      userId,
      organizationId,
    });
    if (currentBilling === null) {
      throw new Error("User not found.");
    }
    if (currentBilling.role !== "owner") {
      throw new ConvexError("Organization owner access is required.");
    }
    const currentState = readBillingAccountState(currentBilling.account);
    if (
      args.change === "add_member_seat" &&
      (currentState.plan !== "pro" || currentState.status === "inactive")
    ) {
      throw new ConvexError("Upgrade to Pro before adding member seats.");
    }
    if (
      args.change === "remove_member_seat" &&
      (currentState.plan !== "pro" || currentState.status === "inactive")
    ) {
      throw new ConvexError("This organization has no paid member seats.");
    }
    if (args.change === "downgrade_to_free" && currentState.status === "inactive") {
      throw new ConvexError("This organization already has Free.");
    }
    const githubOwnerLogin = await ctx.runQuery(
      internal.organizations.getExternalReturnOwnerLogin,
      { organizationId },
    );
    const { successUrl, returnUrl } = validateOrganizationBillingReturnUrls({
      githubOwnerLogin,
      successUrl: args.successUrl,
      returnUrl: args.returnUrl,
      server: resolvePolarServer(),
    });
    let seed: PolarCustomerSeed = await ctx.runMutation(
      internal.billing.reservePolarTeamCustomerIdentity,
      { userId, organizationId },
    );
    const polar = createPolarClient();
    try {
      await ensurePolarTeamCustomer(polar, seed);
    } catch (error) {
      console.error("billing:polar:team_customer_failed", readPolarErrorLogFields(error));
      throw new ConvexError("Samebase could not verify the Polar team Customer.");
    }

    let observed: PolarBillingState;
    try {
      observed = await reconcilePolarBillingTwiceIfNeeded(ctx, {
        polar,
        externalCustomerId: seed.externalCustomerId,
      });
    } catch (error) {
      console.warn(
        "billing:polar:subscription_reconciliation_failed",
        readPolarErrorLogFields(error),
      );
      throw new ConvexError("Samebase could not verify your current subscription.");
    }
    requireBillingChangeAllowed(observed);

    seed = await ctx.runMutation(internal.billing.reservePolarTeamCustomerIdentity, {
      userId,
      organizationId,
    });
    const observedSubscription = observed.status === "inactive" ? null : observed;
    if (args.change === "upgrade_to_pro" && observedSubscription !== null) {
      throw new ConvexError("This organization already has Pro.");
    }
    if (args.change === "downgrade_to_free" && observedSubscription === null) {
      throw new ConvexError("This organization already has Free.");
    }

    let targetSeats: number;
    if (args.change === "add_member_seat") {
      if (observedSubscription === null) {
        throw new ConvexError("Upgrade to Pro before adding member seats.");
      }
      if (observedSubscription.polarSeatQuantity > seed.memberCount) {
        throw new ConvexError("This organization already has an available member seat.");
      }
      targetSeats = Math.max(
        seed.memberCount > observedSubscription.polarSeatQuantity
          ? seed.memberCount
          : seed.memberCount + 1,
        PRO_INCLUDED_ORGANIZATION_MEMBERS,
      );
    } else if (args.change === "remove_member_seat") {
      if (observedSubscription === null) {
        throw new ConvexError("This organization has no paid member seats.");
      }
      const minimumSeats = Math.max(seed.memberCount, PRO_INCLUDED_ORGANIZATION_MEMBERS);
      if (observedSubscription.polarSeatQuantity <= minimumSeats) {
        throw new ConvexError("This organization has no unused member seat.");
      }
      targetSeats = observedSubscription.polarSeatQuantity - 1;
    } else {
      targetSeats =
        observedSubscription?.polarSeatQuantity ??
        Math.max(seed.memberCount, PRO_INCLUDED_ORGANIZATION_MEMBERS);
    }

    if (observedSubscription !== null) {
      await ctx.runQuery(internal.billing.confirmCurrentBillingPayer, {
        userId,
        organizationId,
      });
      try {
        const providerSubscription = await polar.subscriptions.update({
          id: observedSubscription.subscriptionId,
          subscriptionUpdate:
            args.change === "downgrade_to_free"
              ? { cancelAtPeriodEnd: true }
              : {
                  seats: targetSeats,
                  prorationBehavior: args.change === "remove_member_seat" ? "prorate" : "invoice",
                },
        });
        const updated = await reconcilePolarBillingTwiceIfNeeded(ctx, {
          polar,
          externalCustomerId: seed.externalCustomerId,
        });
        if (updated.status === "inactive" || updated.polarSeatQuantity !== targetSeats) {
          throw new Error("Polar billing update did not reach the requested state.");
        }
        if (args.change === "downgrade_to_free") {
          if (
            providerSubscription.id !== observedSubscription.subscriptionId ||
            providerSubscription.seats !== targetSeats ||
            !providerSubscription.cancelAtPeriodEnd ||
            !updated.cancelAtPeriodEnd
          ) {
            throw new Error("Polar did not schedule the requested cancellation.");
          }
        }
      } catch (error) {
        console.error("billing:polar:subscription_update_failed", readPolarErrorLogFields(error));
        throw new ConvexError("Polar could not update this subscription.");
      }
      await ctx.runQuery(internal.billing.confirmCurrentBillingPayer, {
        userId,
        organizationId,
      });
      return { state: "updated" };
    }

    if (checkoutProductId === null) {
      throw new Error("Only Pro checkout can create a Polar subscription.");
    }
    const productId = checkoutProductId;

    let reservation: PolarCheckoutReservation = await ctx.runMutation(
      internal.polarCheckout.reserveAttempt,
      { userId, organizationId },
    );
    if (reservation.state === "open") {
      let storedCheckout: Checkout;
      try {
        storedCheckout = await polar.checkouts.get({ id: reservation.checkoutId });
      } catch (error) {
        console.error("billing:polar:checkout_refresh_failed", readPolarErrorLogFields(error));
        throw new ConvexError("Samebase could not verify your open checkout.");
      }

      const checkoutSeats = storedCheckout.seats;
      if (
        checkoutSeats != null &&
        checkoutSeats >= targetSeats &&
        isOpenPolarCheckoutForAttempt({
          attemptId: reservation.attemptId,
          checkout: storedCheckout,
          externalCustomerId: seed.externalCustomerId,
          productId,
          seatQuantity: checkoutSeats,
          returnUrl,
          successUrl,
        })
      ) {
        await ctx.runQuery(internal.billing.confirmCurrentBillingPayer, {
          userId,
          organizationId,
        });
        return { state: "checkout", url: storedCheckout.url };
      }
      if (
        !matchesPolarCheckoutReservation({
          attemptId: reservation.attemptId,
          checkout: storedCheckout,
          externalCustomerId: seed.externalCustomerId,
        }) ||
        (storedCheckout.status !== "expired" && storedCheckout.status !== "failed")
      ) {
        throw new ConvexError("A different Polar checkout is already open.");
      }

      const cleared: boolean = await ctx.runMutation(internal.polarCheckout.clearOpen, {
        organizationId,
        attemptId: reservation.attemptId,
        checkoutId: reservation.checkoutId,
      });
      if (!cleared) {
        throw new ConvexError("Samebase could not verify your open checkout.");
      }
      reservation = await ctx.runMutation(internal.polarCheckout.reserveAttempt, {
        userId,
        organizationId,
      });
    }

    if (reservation.state !== "pending" || !reservation.canCreate) {
      throw new ConvexError(
        "The previous checkout result must be inspected before another can start.",
      );
    }

    let checkout: Checkout;
    try {
      checkout = await polar.checkouts.create({
        products: [productId],
        externalCustomerId: seed.externalCustomerId,
        seats: targetSeats,
        minSeats: targetSeats,
        maxSeats: targetSeats,
        successUrl,
        returnUrl,
        allowTrial: false,
        metadata: {
          source: "samebase_organization",
          seat_quantity: targetSeats,
          samebase_checkout_attempt_id: reservation.attemptId,
        },
      });
    } catch (error) {
      if (isDefinitivePolarCheckoutFailure(error)) {
        await ctx.runMutation(internal.polarCheckout.clearPending, {
          organizationId,
          attemptId: reservation.attemptId,
        });
      }
      console.error("billing:polar:checkout_failed", readPolarErrorLogFields(error));
      throw new ConvexError("Polar checkout could not be started.");
    }

    if (
      !isOpenPolarCheckoutForAttempt({
        attemptId: reservation.attemptId,
        checkout,
        externalCustomerId: seed.externalCustomerId,
        productId,
        seatQuantity: targetSeats,
        returnUrl,
        successUrl,
      })
    ) {
      throw new ConvexError("Samebase could not verify your open checkout.");
    }

    const recorded: boolean = await ctx.runMutation(internal.polarCheckout.recordOpen, {
      organizationId,
      attemptId: reservation.attemptId,
      checkoutId: checkout.id,
    });
    if (!recorded) {
      throw new ConvexError("Polar checkout could not be started.");
    }
    await ctx.runQuery(internal.billing.confirmCurrentBillingPayer, {
      userId,
      organizationId,
    });
    return { state: "checkout", url: checkout.url };
  },
});

export const createPolarCustomerPortalSession = action({
  access: "access_dashboard",
  args: object({ organizationId: id("organizations"), returnUrl: string() }),
  returns: vPolarPortalSession,
  handler: async (ctx, args): Promise<{ url: string }> => {
    const userId = ctx.viewer.userId;
    const currentBilling = await ctx.runQuery(internal.billing.getBillingAccountForOrganization, {
      userId,
      organizationId: args.organizationId,
    });
    if (currentBilling === null) {
      throw new Error("User not found.");
    }
    const state = readBillingAccountState(currentBilling.account);
    if (currentBilling.role !== "owner" || state.polarBillingUserId !== userId) {
      throw new ConvexError("Only the designated billing payer can manage this subscription.");
    }
    const externalCustomerId = state.polarExternalCustomerId?.trim();
    if (!externalCustomerId) {
      throw new ConvexError("No billing account exists yet.");
    }
    const organization = await ctx.runQuery(internal.organizations.getExternalReturnOwnerLogin, {
      organizationId: args.organizationId,
    });
    const { returnUrl } = validateOrganizationBillingReturnUrls({
      githubOwnerLogin: organization,
      successUrl: args.returnUrl,
      returnUrl: args.returnUrl,
      server: resolvePolarServer(),
    });

    let portalUrl: string;
    try {
      const session = await createPolarClient().customerSessions.create({
        externalCustomerId,
        externalMemberId: userId,
        returnUrl,
      });
      portalUrl = session.customerPortalUrl;
    } catch (error) {
      console.error("billing:polar:portal_failed", readPolarErrorLogFields(error));
      throw new ConvexError("The billing portal could not be opened.");
    }
    await ctx.runQuery(internal.billing.confirmCurrentBillingPayer, {
      userId,
      organizationId: args.organizationId,
    });
    return { url: portalUrl };
  },
});

export const reconcileViewerBillingFromPolar = action({
  access: "access_dashboard",
  args: { organizationId: id("organizations") },
  returns: vPolarBillingReconciliationResult,
  handler: async (ctx, args): Promise<PolarBillingReconciliationResult> => {
    const userId = ctx.viewer.userId;
    const currentBilling = await ctx.runQuery(internal.billing.getBillingAccountForOrganization, {
      userId,
      organizationId: args.organizationId,
    });
    if (currentBilling === null) {
      return { state: "unavailable" };
    }
    const storedBilling = readBillingAccountState(currentBilling.account);
    const externalCustomerId = storedBilling.polarExternalCustomerId?.trim();
    if (
      currentBilling.role !== "owner" ||
      storedBilling.polarBillingUserId !== userId ||
      !externalCustomerId
    ) {
      return { state: "unavailable" };
    }

    try {
      const polar = createPolarClient();
      const state = await reconcilePolarBillingTwiceIfNeeded(ctx, {
        polar,
        externalCustomerId,
      });
      const attempt = storedBilling.polarCheckoutAttempt;
      if (attempt?.state === "open") {
        try {
          const checkout = await polar.checkouts.get({ id: attempt.checkoutId });
          if (
            matchesPolarCheckoutReservation({
              attemptId: attempt.attemptId,
              checkout,
              externalCustomerId,
            }) &&
            canClearPolarCheckoutAfterObservation({
              checkout,
              hasSubscription: hasPolarSubscription(state),
            })
          ) {
            await ctx.runMutation(internal.polarCheckout.clearOpen, {
              organizationId: args.organizationId,
              attemptId: attempt.attemptId,
              checkoutId: attempt.checkoutId,
            });
          }
        } catch (error) {
          console.warn(
            "billing:polar:checkout_reconciliation_failed",
            readPolarErrorLogFields(error),
          );
        }
      }
      await ctx.runQuery(internal.billing.confirmCurrentBillingPayer, {
        userId,
        organizationId: args.organizationId,
      });
      return {
        state: "observed",
        plan: state.plan,
        hasSubscription: hasPolarSubscription(state),
      };
    } catch (error) {
      console.warn("billing:polar:reconciliation_failed", readPolarErrorLogFields(error));
      return { state: "unavailable" };
    }
  },
});
