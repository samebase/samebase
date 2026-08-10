import type { Octokit } from "@octokit/rest";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { action } from "./functions";
import { createGitHubInstallationOctokit, readGitHubAppInstallation } from "./githubApp";
import {
  requireActiveOrganizationActor,
  requireOrganizationAccessContext,
  requireVaultForUser,
} from "./organizationAccess";
import { vGitHubOwnerType } from "./organizationModel";
import {
  requireActiveVaultDeletionAuthority,
  requireActiveVaultProvisioningAuthority,
} from "./vaultWorkflowAuthority";

const { array, id, literal, object, optional, string, union } = v;

export const vGitHubAppAccessTarget = union(
  object({
    kind: literal("organization"),
    organizationId: id("organizations"),
  }),
  object({
    kind: literal("owner"),
    githubOwnerLogin: string(),
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

const vGitHubInstallationPermission = object({
  access: union(literal("read"), literal("write")),
  key: string(),
});

const vGitHubInstallationAccessCheck = object({
  key: union(literal("repositories"), literal("installation")),
  status: union(literal("ok"), literal("error"), literal("not_run")),
});

const vViewerInstallationStatus = object({
  status: union(literal("connected"), literal("unavailable")),
  checks: array(vGitHubInstallationAccessCheck),
  permissions: array(vGitHubInstallationPermission),
  repositorySelection: optional(union(literal("all"), literal("selected"))),
});
type ViewerInstallationStatus = Infer<typeof vViewerInstallationStatus>;

async function loadInstallationAccessForOrganization(
  ctx: Pick<QueryCtx, "db">,
  organizationId: Id<"organizations">,
): Promise<GitHubAppInstallationAccess> {
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
}

export const loadInstallationAccess = internalQuery({
  args: {
    userId: id("users"),
    target: vGitHubAppAccessTarget,
  },
  returns: vGitHubAppInstallationAccess,
  handler: async (ctx, args) => {
    await requireActiveOrganizationActor(ctx.db, args.userId);
    let organizationId: Id<"organizations">;
    switch (args.target.kind) {
      case "organization":
        await requireOrganizationAccessContext(ctx.db, {
          userId: args.userId,
          organizationId: args.target.organizationId,
        });
        organizationId = args.target.organizationId;
        break;
      case "owner": {
        const githubOwnerLoginNormalized = args.target.githubOwnerLogin.trim().toLowerCase();
        if (githubOwnerLoginNormalized.length === 0) {
          throw new Error("GitHub owner login is required.");
        }
        const organization = await ctx.db
          .query("organizations")
          .withIndex("by_github_owner_login_normalized", (query) =>
            query.eq("githubOwnerLoginNormalized", githubOwnerLoginNormalized),
          )
          .unique();
        if (organization === null) {
          throw new Error("GitHub owner is not available to this user.");
        }
        await requireOrganizationAccessContext(ctx.db, {
          userId: args.userId,
          organizationId: organization._id,
        });
        organizationId = organization._id;
        break;
      }
      case "vault": {
        const vault = await requireVaultForUser(ctx.db, {
          userId: args.userId,
          vaultId: args.target.vaultId,
        });
        organizationId = vault.organizationId;
        break;
      }
    }

    return await loadInstallationAccessForOrganization(ctx, organizationId);
  },
});

export const loadInstallationAccessForProvisioningRun = internalQuery({
  args: {
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    vaultId: id("vaults"),
  },
  returns: vGitHubAppInstallationAccess,
  handler: async (ctx, args) => {
    const authority = await requireActiveVaultProvisioningAuthority(ctx.db, args);
    return await loadInstallationAccessForOrganization(ctx, authority.organizationId);
  },
});

export const loadInstallationAccessForVaultDeletionRun = internalQuery({
  args: {
    runId: id("workflow_vaultDeletion_runs"),
  },
  returns: vGitHubAppInstallationAccess,
  handler: async (ctx, args) => {
    const authority = await requireActiveVaultDeletionAuthority(ctx.db, args);
    return await loadInstallationAccessForOrganization(ctx, authority.organizationId);
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

export async function resolveGitHubAppAccessForProvisioningRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<GitHubAppAccess> {
  const access: GitHubAppInstallationAccess = await ctx.runQuery(
    internal.githubAppAccess.loadInstallationAccessForProvisioningRun,
    args,
  );
  return {
    ...access,
    octokit: createGitHubInstallationOctokit(access.githubInstallationId),
  };
}

export async function resolveGitHubAppAccessForVaultDeletionRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    runId: Id<"workflow_vaultDeletion_runs">;
  },
): Promise<GitHubAppAccess> {
  const access: GitHubAppInstallationAccess = await ctx.runQuery(
    internal.githubAppAccess.loadInstallationAccessForVaultDeletionRun,
    args,
  );
  return {
    ...access,
    octokit: createGitHubInstallationOctokit(access.githubInstallationId),
  };
}

export const checkViewerInstallation = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: vViewerInstallationStatus,
  handler: async (ctx, args): Promise<ViewerInstallationStatus> => {
    let access: GitHubAppAccess;
    try {
      access = await resolveGitHubAppAccess(ctx, {
        userId: ctx.viewer.userId,
        target: {
          kind: "organization",
          organizationId: args.organizationId,
        },
      });
    } catch {
      return {
        status: "unavailable",
        checks: [
          {
            key: "repositories",
            status: "not_run",
          },
          {
            key: "installation",
            status: "not_run",
          },
        ],
        permissions: [],
      };
    }

    const [repositoriesResult, installationResult] = await Promise.allSettled([
      access.octokit.request("GET /installation/repositories", { per_page: 1 }),
      readGitHubAppInstallation(access.githubInstallationId).then((installation) => {
        if (
          installation.githubOwnerId !== access.githubOwnerId ||
          installation.githubOwnerType !== access.githubOwnerType
        ) {
          throw new Error("GitHub App installation owner verification failed.");
        }
        return installation;
      }),
    ]);
    const checks: ViewerInstallationStatus["checks"] = [
      {
        key: "repositories",
        status: repositoriesResult.status === "fulfilled" ? "ok" : "error",
      },
      {
        key: "installation",
        status: installationResult.status === "fulfilled" ? "ok" : "error",
      },
    ];
    if (repositoriesResult.status === "rejected") {
      console.warn("github:installation_access_probe_failed", {
        check: "repositories",
        errorName:
          repositoriesResult.reason instanceof Error ? repositoriesResult.reason.name : "unknown",
      });
    }
    if (installationResult.status === "rejected") {
      console.warn("github:installation_access_probe_failed", {
        check: "installation",
        errorName:
          installationResult.reason instanceof Error ? installationResult.reason.name : "unknown",
      });
    }

    if (installationResult.status === "rejected") {
      return {
        status: "unavailable",
        checks,
        permissions: [],
      };
    }

    return {
      status: repositoriesResult.status === "fulfilled" ? "connected" : "unavailable",
      checks,
      permissions: installationResult.value.permissions,
      repositorySelection: installationResult.value.repositorySelection,
    };
  },
});

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
