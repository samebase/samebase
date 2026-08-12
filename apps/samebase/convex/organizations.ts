import { ConvexError, v } from "convex/values";

import type { Id, TableNames } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { requireOrganizationOwnerAccessContext } from "./organizationAccess";
import { vGitHubOwnerType, vOrganizationMembershipRole } from "./organizationModel";
import { readActiveUser } from "./userLifecycle";

const { boolean, id, object, string } = v;
const ORGANIZATION_DELETION_ROW_LIMIT = 500;

const vOrganizationSummary = object({
  canCreateRepository: boolean(),
  organizationId: id("organizations"),
  githubOwnerId: string(),
  githubOwnerType: vGitHubOwnerType,
  githubOwnerLogin: string(),
  role: vOrganizationMembershipRole,
});

const vCreateOrReconnectResult = object({
  organizationId: id("organizations"),
  created: boolean(),
});

export function normalizeGitHubOwnerLogin(login: string): string {
  return login.trim().toLowerCase();
}

function requireProviderIdentity(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

async function deleteRows<TableName extends TableNames>(
  ctx: Pick<MutationCtx, "db">,
  rows: Array<{ _id: Id<TableName> }>,
): Promise<void> {
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

export const listForViewer = query({
  access: "access_user_preferences",
  args: {},
  returns: v.array(vOrganizationSummary),
  handler: async (ctx) => {
    const organizations = [];
    const [githubSignInAccount, githubUserAuthorization] = await Promise.all([
      ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (query) =>
          query.eq("userId", ctx.viewer.userId).eq("provider", "github"),
        )
        .unique(),
      ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", ctx.viewer.userId))
        .unique(),
    ]);

    for await (const membership of ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (query) => query.eq("userId", ctx.viewer.userId))) {
      const organization = await ctx.db.get(membership.organizationId);
      if (organization === null) {
        throw new Error("Organization membership refers to a missing organization.");
      }

      organizations.push({
        canCreateRepository:
          organization.githubOwnerType === "organization" ||
          (githubSignInAccount?.providerAccountId === organization.githubOwnerId &&
            githubUserAuthorization?.githubUserId === organization.githubOwnerId),
        organizationId: organization._id,
        githubOwnerId: organization.githubOwnerId,
        githubOwnerType: organization.githubOwnerType,
        githubOwnerLogin: organization.githubOwnerLogin,
        role: membership.role,
      });
    }

    return organizations.sort(
      (left, right) =>
        normalizeGitHubOwnerLogin(left.githubOwnerLogin).localeCompare(
          normalizeGitHubOwnerLogin(right.githubOwnerLogin),
        ) || left.organizationId.localeCompare(right.organizationId),
    );
  },
});

export const getExternalReturnOwnerLogin = internalQuery({
  args: {
    organizationId: id("organizations"),
  },
  returns: string(),
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }

    return organization.githubOwnerLoginNormalized;
  },
});

/** Create a GitHub-backed organization or reconnect its verified installation. */
export const createOrReconnectVerifiedOrganization = internalMutation({
  args: {
    userId: id("users"),
    githubOwnerId: string(),
    githubOwnerType: vGitHubOwnerType,
    githubOwnerLogin: string(),
    githubInstallationId: string(),
  },
  returns: vCreateOrReconnectResult,
  handler: async (ctx, args) => {
    const githubOwnerId = requireProviderIdentity(args.githubOwnerId, "GitHub owner ID");
    const githubOwnerLogin = requireProviderIdentity(args.githubOwnerLogin, "GitHub owner login");
    const githubOwnerLoginNormalized = normalizeGitHubOwnerLogin(githubOwnerLogin);
    const githubInstallationId = requireProviderIdentity(
      args.githubInstallationId,
      "GitHub installation ID",
    );

    const user = await ctx.db.get(args.userId);
    if (user === null || readActiveUser(user) === null) {
      throw new Error("An active Samebase user is required.");
    }

    const [existingOrganization, organizationForLogin, organizationForInstallation] =
      await Promise.all([
        ctx.db
          .query("organizations")
          .withIndex("by_github_owner_id", (query) => query.eq("githubOwnerId", githubOwnerId))
          .unique(),
        ctx.db
          .query("organizations")
          .withIndex("by_github_owner_login_normalized", (query) =>
            query.eq("githubOwnerLoginNormalized", githubOwnerLoginNormalized),
          )
          .unique(),
        ctx.db
          .query("organizations")
          .withIndex("by_github_installation_id", (query) =>
            query.eq("githubInstallationId", githubInstallationId),
          )
          .unique(),
      ]);

    if (existingOrganization !== null) {
      await requireOrganizationOwnerAccessContext(ctx.db, {
        userId: args.userId,
        organizationId: existingOrganization._id,
      });
      if (organizationForLogin !== null && organizationForLogin._id !== existingOrganization._id) {
        throw new Error("GitHub owner login is already connected to another organization.");
      }
      if (
        organizationForInstallation !== null &&
        organizationForInstallation._id !== existingOrganization._id
      ) {
        throw new Error("GitHub installation is already connected to another organization.");
      }

      await ctx.db.patch(existingOrganization._id, {
        githubOwnerType: args.githubOwnerType,
        githubOwnerLogin,
        githubOwnerLoginNormalized,
        githubInstallationId,
      });

      return {
        organizationId: existingOrganization._id,
        created: false,
      };
    }

    if (organizationForLogin !== null) {
      throw new Error("GitHub owner login is already connected to another organization.");
    }
    if (organizationForInstallation !== null) {
      throw new Error("GitHub installation is already connected to another organization.");
    }

    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId,
      githubOwnerType: args.githubOwnerType,
      githubOwnerLogin,
      githubOwnerLoginNormalized,
      githubInstallationId,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: args.userId,
      role: "owner",
    });
    await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
    });

    return {
      organizationId,
      created: true,
    };
  },
});

/** Delete one organization while its last active owner is still authenticated. */
export const deleteOrganization = mutation({
  access: "access_user_preferences",
  args: {
    organizationId: id("organizations"),
    deletionConfirmationText: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new ConvexError("Organization not found.");
    }
    await requireOrganizationOwnerAccessContext(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: organization._id,
    });
    if (organization.githubOwnerLogin !== args.deletionConfirmationText) {
      throw new ConvexError("Organization confirmation does not match.");
    }

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_user", (query) =>
        query.eq("organizationId", organization._id),
      )
      .take(2);
    const soleMembership = memberships[0];
    if (
      memberships.length !== 1 ||
      soleMembership.role !== "owner" ||
      soleMembership.userId !== ctx.viewer.userId
    ) {
      throw new ConvexError("Remove every other member before you delete this organization.");
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
      throw new ConvexError("Resolve organization billing before you delete this organization.");
    }

    const vault = await ctx.db
      .query("vaults")
      .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
      .first();
    if (vault !== null) {
      throw new ConvexError("Remove every Samebase vault before you delete this organization.");
    }

    const [vaultCloudflareWorker, vaultConvexProject, provisioningRun] = await Promise.all([
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .first(),
      ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .first(),
      ctx.db
        .query("workflow_vaultProvisioning_runs")
        .withIndex("by_organization_and_user_and_state_and_updated_at", (query) =>
          query.eq("organizationId", organization._id),
        )
        .first(),
    ]);
    if (vaultCloudflareWorker !== null || vaultConvexProject !== null || provisioningRun !== null) {
      throw new ConvexError("Finish organization vault cleanup before deletion.");
    }

    const deletionRuns = await ctx.db
      .query("workflow_vaultDeletion_runs")
      .withIndex("by_organization_and_updated_at", (query) =>
        query.eq("organizationId", organization._id),
      )
      .take(ORGANIZATION_DELETION_ROW_LIMIT + 1);
    if (
      deletionRuns.length > ORGANIZATION_DELETION_ROW_LIMIT ||
      deletionRuns.some((run) => run.state !== "succeeded")
    ) {
      throw new ConvexError("Finish organization vault cleanup before deletion.");
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
        .take(ORGANIZATION_DELETION_ROW_LIMIT + 1),
      ctx.db
        .query("ui_vaultFolderAssignments")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .take(ORGANIZATION_DELETION_ROW_LIMIT + 1),
      ctx.db
        .query("ui_vaultFolders")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .take(ORGANIZATION_DELETION_ROW_LIMIT + 1),
      ctx.db
        .query("githubAppSetupStates")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .take(ORGANIZATION_DELETION_ROW_LIMIT + 1),
      ctx.db
        .query("organizationInvitations")
        .withIndex("by_organization_and_state_and_expires_at", (query) =>
          query.eq("organizationId", organization._id),
        )
        .take(ORGANIZATION_DELETION_ROW_LIMIT + 1),
      ctx.db
        .query("ui_vaultOrganizationTree_settings")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .take(ORGANIZATION_DELETION_ROW_LIMIT + 1),
      ctx.db
        .query("organizationProviderCredentials")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .take(ORGANIZATION_DELETION_ROW_LIMIT + 1),
      ctx.db
        .query("providerOAuthCallbackStates")
        .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
        .take(ORGANIZATION_DELETION_ROW_LIMIT + 1),
    ]);
    const cleanupRows = [
      deletionEvents,
      folderAssignments,
      folders,
      githubSetupStates,
      invitations,
      organizationTreeSettings,
      providerCredentials,
      providerOAuthStates,
    ];
    if (cleanupRows.some((rows) => rows.length > ORGANIZATION_DELETION_ROW_LIMIT)) {
      throw new ConvexError("Organization data cleanup requires Samebase support.");
    }

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
