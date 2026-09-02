import type { Octokit } from "@octokit/rest";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { action } from "./functions";
import {
  createGitHubInstallationOctokit,
  createGitHubRepositoryInstallationOctokit,
  readGitHubAppInstallation,
} from "./githubApp";
import {
  requireActiveOrganizationActor,
  requireOrganizationAccessContext,
  requireOrganizationMembershipRecord,
  requireRepositoryForUser,
} from "./organizationAccess";
import { vGitHubOwnerType } from "./organizationModel";
import {
  requireActiveRepositoryDeletionAuthority,
  requireActiveRepositoryProvisioningAuthority,
} from "./repositoryWorkflowAuthority";

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
    kind: literal("repository"),
    repositoryId: id("repositories"),
  }),
);
export type GitHubAppAccessTarget = Infer<typeof vGitHubAppAccessTarget>;

const githubAppInstallationAccessFields = {
  organizationId: id("organizations"),
  githubInstallationId: string(),
  githubOwnerId: string(),
  githubOwnerType: vGitHubOwnerType,
  githubOwnerLogin: string(),
};

export const vGitHubAppInstallationAccess = object(githubAppInstallationAccessFields);
export type GitHubAppInstallationAccess = Infer<typeof vGitHubAppInstallationAccess>;
export type GitHubAppAccess = GitHubAppInstallationAccess & { octokit: Octokit };

const vGitHubAppTokenAccess = union(
  object({
    kind: literal("installation"),
    ...githubAppInstallationAccessFields,
  }),
  object({
    kind: literal("repository"),
    ...githubAppInstallationAccessFields,
    githubRepositoryDatabaseId: string(),
  }),
);
type GitHubAppTokenAccess = Infer<typeof vGitHubAppTokenAccess>;

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
  returns: vGitHubAppTokenAccess,
  handler: async (ctx, args) => {
    await requireActiveOrganizationActor(ctx.db, args.userId);
    let organizationId: Id<"organizations">;
    let repositoryId: string | null = null;
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
      case "repository": {
        const repository = await requireRepositoryForUser(ctx.db, {
          userId: args.userId,
          repositoryId: args.target.repositoryId,
        });
        organizationId = repository.organizationId;
        if (repository.state === "connected") {
          repositoryId = repository.githubRepositoryDatabaseId;
        }
        break;
      }
    }

    const access = await loadInstallationAccessForOrganization(ctx, organizationId);
    return repositoryId === null
      ? { kind: "installation" as const, ...access }
      : { kind: "repository" as const, ...access, githubRepositoryDatabaseId: repositoryId };
  },
});

export const loadInstallationAccessForProviderStatus = internalQuery({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
  },
  returns: vGitHubAppInstallationAccess,
  handler: async (ctx, args) => {
    await requireOrganizationMembershipRecord(ctx.db, args);
    return await loadInstallationAccessForOrganization(ctx, args.organizationId);
  },
});

export const loadInstallationAccessForProvisioningRun = internalQuery({
  args: {
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    repositoryId: id("repositories"),
  },
  returns: vGitHubAppInstallationAccess,
  handler: async (ctx, args) => {
    const authority = await requireActiveRepositoryProvisioningAuthority(ctx.db, args);
    return await loadInstallationAccessForOrganization(ctx, authority.organizationId);
  },
});

export const loadInstallationAccessForRepositoryDeletionRun = internalQuery({
  args: {
    runId: id("workflow_repositoryDeletion_runs"),
  },
  returns: vGitHubAppInstallationAccess,
  handler: async (ctx, args) => {
    const authority = await requireActiveRepositoryDeletionAuthority(ctx.db, args);
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
  const access: GitHubAppTokenAccess = await ctx.runQuery(
    internal.githubAppAccess.loadInstallationAccess,
    {
      userId: args.userId,
      target: args.target,
    },
  );
  const octokit =
    access.kind === "repository"
      ? await createGitHubRepositoryInstallationOctokit(
          access.githubInstallationId,
          access.githubRepositoryDatabaseId,
        )
      : createGitHubInstallationOctokit(access.githubInstallationId);
  return {
    organizationId: access.organizationId,
    githubInstallationId: access.githubInstallationId,
    githubOwnerId: access.githubOwnerId,
    githubOwnerType: access.githubOwnerType,
    githubOwnerLogin: access.githubOwnerLogin,
    octokit,
  };
}

export async function resolveGitHubAppAccessForProvisioningRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
  },
): Promise<GitHubAppAccess> {
  const access: GitHubAppInstallationAccess = await ctx.runQuery(
    internal.githubAppAccess.loadInstallationAccessForProvisioningRun,
    {
      runId: args.runId,
      userId: args.userId,
      repositoryId: args.repositoryId,
    },
  );
  return {
    ...access,
    octokit: createGitHubInstallationOctokit(access.githubInstallationId),
  };
}

export async function resolveGitHubAppAccessForRepositoryDeletionRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    runId: Id<"workflow_repositoryDeletion_runs">;
  },
): Promise<GitHubAppAccess> {
  const access: GitHubAppInstallationAccess = await ctx.runQuery(
    internal.githubAppAccess.loadInstallationAccessForRepositoryDeletionRun,
    {
      runId: args.runId,
    },
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
      const installationAccess = await ctx.runQuery(
        internal.githubAppAccess.loadInstallationAccessForProviderStatus,
        {
          userId: ctx.viewer.userId,
          organizationId: args.organizationId,
        },
      );
      access = {
        ...installationAccess,
        octokit: createGitHubInstallationOctokit(installationAccess.githubInstallationId),
      };
    } catch (error) {
      console.warn("github:installation_access_probe_failed", { check: "initialization" }, error);
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
      console.warn(
        "github:installation_access_probe_failed",
        { check: "repositories" },
        repositoriesResult.reason,
      );
    }
    if (installationResult.status === "rejected") {
      console.warn(
        "github:installation_access_probe_failed",
        { check: "installation" },
        installationResult.reason,
      );
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
