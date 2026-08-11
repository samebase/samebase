import { v, type Infer } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { query } from "./functions";
import { requireOrganizationOwnerAccessContext } from "./organizationAccess";
import { vGitHubOwnerType, vOrganizationMembershipRole } from "./organizationModel";
import { readActiveUser } from "./userLifecycle";

const { boolean, id, literal, object, string, union } = v;

const vOrganizationSummary = object({
  canCreateRepository: boolean(),
  organizationId: id("organizations"),
  githubOwnerId: string(),
  githubOwnerType: vGitHubOwnerType,
  githubOwnerLogin: string(),
  deletionState: union(literal("not_deleting"), literal("deleting"), literal("delete_failed")),
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
    const organizations: Array<Infer<typeof vOrganizationSummary>> = [];
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
        deletionState: organization.deletion?.state ?? "not_deleting",
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

      if (args.githubOwnerType !== existingOrganization.githubOwnerType) {
        const billingAccount = await ctx.db
          .query("organizationBillingAccounts")
          .withIndex("by_organization", (query) =>
            query.eq("organizationId", existingOrganization._id),
          )
          .unique();
        if (billingAccount === null) {
          throw new Error("Organization billing account is required.");
        }
        if (
          billingAccount.provider === "polar" ||
          billingAccount.polarExternalCustomerId ||
          billingAccount.polarBillingUserId ||
          billingAccount.status !== "inactive"
        ) {
          throw new Error("Organization billing must be removed before GitHub owner type changes.");
        }
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
