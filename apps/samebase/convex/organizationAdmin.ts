import { v } from "convex/values";

import { normalizeAccountEmail } from "../shared/accountPresentation";
import type { Id, TableNames } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { requireAnotherActiveOrganizationOwner } from "./organizationAccess";
import { vOrganizationMembershipRole } from "./organizationModel";
import { readActiveUser } from "./userLifecycle";

const vAddExistingUserResult = v.union(
  v.object({
    state: v.literal("added"),
    membershipId: v.id("organizationMemberships"),
  }),
  v.object({
    state: v.literal("already_member"),
    membershipId: v.id("organizationMemberships"),
  }),
  v.object({
    state: v.literal("updated"),
    membershipId: v.id("organizationMemberships"),
  }),
);

async function deleteRows<TableName extends TableNames>(
  ctx: Pick<MutationCtx, "db">,
  rows: Array<{ _id: Id<TableName> }>,
): Promise<void> {
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

/** Operator recovery: add or update an existing Samebase organization membership. */
export const addExistingUserToOrganization = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    role: vOrganizationMembershipRole,
    userEmail: v.string(),
  },
  returns: vAddExistingUserResult,
  handler: async (ctx, args) => {
    const userEmail = normalizeAccountEmail(args.userEmail);
    const [user, organization] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("email", (query) => query.eq("email", userEmail))
        .unique(),
      ctx.db.get(args.organizationId),
    ]);

    if (user === null) {
      throw new Error("User not found.");
    }
    const activeUser = readActiveUser(user);
    if (activeUser === null) {
      throw new Error("A deleting user cannot join an organization.");
    }
    if (activeUser.isApproved !== true) {
      throw new Error("An unapproved user cannot join an organization.");
    }
    if (organization === null) {
      throw new Error("Organization not found.");
    }

    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_user", (query) =>
        query.eq("organizationId", args.organizationId).eq("userId", activeUser._id),
      )
      .unique();
    if (membership !== null) {
      if (membership.role !== args.role) {
        if (membership.role === "owner" && args.role === "member") {
          await requireAnotherActiveOrganizationOwner(ctx.db, {
            organizationId: args.organizationId,
            excludedUserId: activeUser._id,
          });
        }
        await ctx.db.patch(membership._id, { role: args.role });
        return {
          state: "updated" as const,
          membershipId: membership._id,
        };
      }
      return {
        state: "already_member" as const,
        membershipId: membership._id,
      };
    }

    const membershipId = await ctx.db.insert("organizationMemberships", {
      organizationId: args.organizationId,
      userId: activeUser._id,
      role: args.role,
    });

    return {
      state: "added" as const,
      membershipId,
    };
  },
});

/** Operator-only local deletion after every vault has been removed. */
export const deleteOrganization = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedGithubOwnerLogin: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    if (organization.githubOwnerLogin !== args.expectedGithubOwnerLogin) {
      throw new Error("Organization confirmation does not match.");
    }

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_user", (query) =>
        query.eq("organizationId", organization._id),
      )
      .collect();
    const soleMembership = memberships[0];
    if (memberships.length !== 1 || soleMembership.role !== "owner") {
      throw new Error("Organization deletion requires exactly one owner membership.");
    }
    const soleOwner = await ctx.db.get(soleMembership.userId);
    if (soleOwner === null || readActiveUser(soleOwner) === null) {
      throw new Error("Organization deletion requires one active owner.");
    }

    const billing = await ctx.db
      .query("organizationBillingAccounts")
      .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
      .unique();
    if (billing === null) {
      throw new Error("Organization billing state is missing.");
    }
    if (
      billing.plan !== "free" ||
      billing.status !== "inactive" ||
      billing.polarExternalCustomerId ||
      billing.polarCheckoutAttempt
    ) {
      throw new Error("Paid or pending billing must be resolved before organization deletion.");
    }

    const vault = await ctx.db
      .query("vaults")
      .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
      .first();
    if (vault !== null) {
      throw new Error(
        "Delete every Samebase vault first. Keep provider resource deletion options off to preserve external infrastructure.",
      );
    }

    const [vaultCloudflareWorker, vaultConvexProject] = await Promise.all([
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .first(),
      ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .first(),
    ]);
    if (vaultCloudflareWorker !== null || vaultConvexProject !== null) {
      throw new Error("Organization vault cleanup must finish before deletion.");
    }

    const provisioningRun = await ctx.db
      .query("workflow_vaultProvisioning_runs")
      .withIndex("by_organization_and_user_and_state_and_updated_at", (query) =>
        query.eq("organizationId", organization._id),
      )
      .first();
    if (provisioningRun !== null) {
      throw new Error("Organization provisioning data must be resolved before deletion.");
    }

    const deletionRuns = await ctx.db
      .query("workflow_vaultDeletion_runs")
      .withIndex("by_organization_and_updated_at", (query) =>
        query.eq("organizationId", organization._id),
      )
      .collect();
    if (deletionRuns.some((run) => run.state !== "succeeded")) {
      throw new Error("Organization vault deletion work must finish before deletion.");
    }

    const [
      deletionEvents,
      folderAssignments,
      folders,
      githubSetupStates,
      invitations,
      organizationTreeSettings,
      providerCredentials,
      providerOAuthStates,
    ] = await Promise.all([
      ctx.db
        .query("workflow_vaultDeletion_events")
        .withIndex("by_organization_and_created_at", (query) =>
          query.eq("organizationId", organization._id),
        )
        .collect(),
      ctx.db
        .query("ui_vaultFolderAssignments")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .collect(),
      ctx.db
        .query("ui_vaultFolders")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .collect(),
      ctx.db
        .query("githubAppSetupStates")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .collect(),
      ctx.db
        .query("organizationInvitations")
        .withIndex("by_organization_and_state_and_expires_at", (query) =>
          query.eq("organizationId", organization._id),
        )
        .collect(),
      ctx.db
        .query("ui_vaultOrganizationTree_settings")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .collect(),
      ctx.db
        .query("organizationProviderCredentials")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .collect(),
      ctx.db
        .query("providerOAuthCallbackStates")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .collect(),
    ]);

    await deleteRows(ctx, deletionEvents);
    await deleteRows(ctx, deletionRuns);
    await deleteRows(ctx, folderAssignments);
    await deleteRows(ctx, folders);
    await deleteRows(ctx, githubSetupStates);
    await deleteRows(ctx, invitations);
    await deleteRows(ctx, organizationTreeSettings);
    await deleteRows(ctx, providerCredentials);
    await deleteRows(ctx, providerOAuthStates);
    await ctx.db.delete(billing._id);
    await ctx.db.delete(soleMembership._id);
    await ctx.db.delete(organization._id);

    return null;
  },
});
