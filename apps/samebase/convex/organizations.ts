import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { query } from "./functions";
import { requireOrganizationOwnerAccessContext } from "./organizationAccess";
import { vGitHubOwnerType, vOrganizationMembershipRole } from "./organizationModel";

const { boolean, id, object, string } = v;

const vOrganizationSummary = object({
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

export const listForViewer = query({
  access: "access_user_preferences",
  args: {},
  returns: v.array(vOrganizationSummary),
  handler: async (ctx) => {
    const organizations = [];

    for await (const membership of ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (query) => query.eq("userId", ctx.viewer.userId))) {
      const organization = await ctx.db.get(membership.organizationId);
      if (organization === null) {
        throw new Error("Organization membership refers to a missing organization.");
      }

      organizations.push({
        organizationId: organization._id,
        githubOwnerId: organization.githubOwnerId,
        githubOwnerType: organization.githubOwnerType,
        githubOwnerLogin: organization.githubOwnerLogin,
        role: membership.role,
      });
    }

    return organizations.sort(
      (left, right) =>
        left.githubOwnerLogin.localeCompare(right.githubOwnerLogin) ||
        left.organizationId.localeCompare(right.organizationId),
    );
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
    if (user === null || user.accountDeletion !== undefined) {
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
