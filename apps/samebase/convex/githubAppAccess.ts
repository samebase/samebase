import type { Octokit } from "@octokit/rest";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type ActionCtx } from "./_generated/server";
import { createGitHubInstallationOctokit } from "./githubApp";
import { requireOrganizationAccessContext, requireVaultForUser } from "./organizationAccess";
import { vGitHubOwnerType } from "./organizationModel";

const { id, literal, object, string, union } = v;

export const vGitHubAppAccessTarget = union(
  object({
    kind: literal("organization"),
    organizationId: id("organizations"),
  }),
  object({
    kind: literal("vault"),
    vaultId: id("vaults"),
  }),
);
export type GitHubAppAccessTarget = Infer<typeof vGitHubAppAccessTarget>;

export const vGitHubAppInstallationAccess = object({
  organizationId: id("organizations"),
  githubInstallationId: string(),
  githubOwnerId: string(),
  githubOwnerType: vGitHubOwnerType,
  githubOwnerLogin: string(),
});
export type GitHubAppInstallationAccess = Infer<typeof vGitHubAppInstallationAccess>;
export type GitHubAppAccess = GitHubAppInstallationAccess & { octokit: Octokit };

export const loadInstallationAccess = internalQuery({
  args: {
    userId: id("users"),
    target: vGitHubAppAccessTarget,
  },
  returns: vGitHubAppInstallationAccess,
  handler: async (ctx, args) => {
    let organizationId: Id<"organizations">;
    switch (args.target.kind) {
      case "organization":
        await requireOrganizationAccessContext(ctx.db, {
          userId: args.userId,
          organizationId: args.target.organizationId,
        });
        organizationId = args.target.organizationId;
        break;
      case "vault": {
        const vault = await requireVaultForUser(ctx.db, {
          userId: args.userId,
          vaultId: args.target.vaultId,
        });
        organizationId = vault.organizationId;
        break;
      }
    }

    const organization = await ctx.db.get(organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    if (organization.githubInstallationId.trim().length === 0) {
      throw new Error("GitHub App installation is not connected.");
    }

    return {
      organizationId: organization._id,
      githubInstallationId: organization.githubInstallationId,
      githubOwnerId: organization.githubOwnerId,
      githubOwnerType: organization.githubOwnerType,
      githubOwnerLogin: organization.githubOwnerLogin,
    };
  },
});

export async function resolveGitHubAppAccess(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    target: GitHubAppAccessTarget;
  },
): Promise<GitHubAppAccess> {
  const access: GitHubAppInstallationAccess = await ctx.runQuery(
    internal.githubAppAccess.loadInstallationAccess,
    args,
  );
  return {
    ...access,
    octokit: createGitHubInstallationOctokit(access.githubInstallationId),
  };
}

/** Require a GitHub repository response to belong to the selected organization owner. */
export function requireGitHubRepositoryOwnerId(args: {
  expectedOwnerId: string;
  repositoryOwnerId: unknown;
}): string {
  if (
    typeof args.repositoryOwnerId !== "number" ||
    !Number.isSafeInteger(args.repositoryOwnerId) ||
    args.repositoryOwnerId <= 0
  ) {
    throw new Error("GitHub repository response did not include a valid owner ID.");
  }

  const repositoryOwnerId = String(args.repositoryOwnerId);
  if (repositoryOwnerId !== args.expectedOwnerId) {
    throw new Error("GitHub repository owner does not match the selected organization.");
  }
  return repositoryOwnerId;
}
