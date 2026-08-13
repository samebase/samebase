import type { Octokit } from "@octokit/rest";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { action } from "./functions";
import {
  createGitHubInstallationOctokit,
  createGitHubRepositoriesInstallationOctokit,
  readGitHubAppInstallation,
} from "./githubApp";
import { resolveGitHubInstallationRepositoryIdentity } from "./githubRepoApi";
import {
  requireActiveOrganizationActor,
  requireOrganizationAccessContext,
  requireVaultForUser,
} from "./organizationAccess";
import { vGitHubOwnerType } from "./organizationModel";
import { normalizeGitHubOwnerLogin } from "./organizations";
import {
  requireActiveVaultDeletionAuthority,
  requireActiveVaultProvisioningAuthority,
} from "./vaultWorkflowAuthority";
import { isLiveConnectedVault } from "./vault/state";

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
const githubVaultAccessCapability = Symbol("GitHubVaultAccess");
export type GitHubVaultAccess = {
  readonly [githubVaultAccessCapability]: true;
  readonly octokit: Octokit;
  readonly ghRepoId: string;
  readonly githubOwnerId: string;
  readonly githubOwnerLogin: string;
  readonly repositoryName: string;
  readonly repositoryDefaultBranch: string;
};

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
  const access = await loadGitHubAppInstallationAccess(ctx, args);
  return {
    ...access,
    octokit: createGitHubInstallationOctokit(access.githubInstallationId),
  };
}

export async function loadGitHubAppInstallationAccess(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    target: GitHubAppAccessTarget;
  },
): Promise<GitHubAppInstallationAccess> {
  const access: GitHubAppInstallationAccess = await ctx.runQuery(
    internal.githubAppAccess.loadInstallationAccess,
    {
      userId: args.userId,
      target: args.target,
    },
  );
  return access;
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
    {
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    },
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
    {
      runId: args.runId,
    },
  );
  return {
    ...access,
    octokit: createGitHubInstallationOctokit(access.githubInstallationId),
  };
}

export async function resolveGitHubRepositoryAccess(args: {
  access: GitHubAppInstallationAccess;
  ghRepoId: string;
}): Promise<GitHubVaultAccess> {
  const octokit = await createGitHubRepositoriesInstallationOctokit(
    args.access.githubInstallationId,
    [args.ghRepoId],
  );
  const repository = await resolveGitHubInstallationRepositoryIdentity({
    octokit,
    expectedRepoId: args.ghRepoId,
    expectedOwnerId: args.access.githubOwnerId,
  });
  if (
    normalizeGitHubOwnerLogin(repository.ownerLogin) !==
    normalizeGitHubOwnerLogin(args.access.githubOwnerLogin)
  ) {
    throw new Error(
      "GitHub owner login changed. An organization owner must reconnect the GitHub App.",
    );
  }
  return {
    [githubVaultAccessCapability]: true,
    octokit,
    ghRepoId: args.ghRepoId,
    githubOwnerId: args.access.githubOwnerId,
    githubOwnerLogin: args.access.githubOwnerLogin,
    repositoryName: repository.repositoryName,
    repositoryDefaultBranch: repository.defaultBranch,
  };
}

export async function resolveGitHubVaultAccessForProvisioningRun(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    ghRepoId: string;
    expectedRepositoryName: string;
  },
): Promise<GitHubVaultAccess> {
  const access = await resolveGitHubAppAccessForProvisioningRun(ctx, args);
  const githubAccess = await resolveGitHubRepositoryAccess({
    access,
    ghRepoId: args.ghRepoId,
  });
  if (githubAccess.repositoryName !== args.expectedRepositoryName) {
    await ctx.runMutation(internal.vault.records.refreshGitHubRepositoryNameForProvisioningRun, {
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
      expectedGhRepoId: args.ghRepoId,
      expectedGithubOwnerId: access.githubOwnerId,
      expectedRepositoryName: args.expectedRepositoryName,
      repositoryName: githubAccess.repositoryName,
    });
  }
  return githubAccess;
}

export async function resolveGitHubVaultAccess(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<GitHubVaultAccess> {
  const vault = await ctx.runQuery(internal.vault.records.getByIdForUser, {
    userId: args.userId,
    vaultId: args.vaultId,
  });
  if (!isLiveConnectedVault(vault)) {
    throw new Error("GitHub repository is not connected.");
  }
  const access = await loadGitHubAppInstallationAccess(ctx, {
    userId: args.userId,
    target: { kind: "organization", organizationId: vault.organizationId },
  });
  const githubAccess = await resolveGitHubRepositoryAccess({
    access,
    ghRepoId: vault.ghRepoId,
  });
  if (githubAccess.repositoryName !== vault.name) {
    await ctx.runMutation(internal.vault.records.refreshGitHubRepositoryName, {
      userId: args.userId,
      vaultId: vault._id,
      expectedGhRepoId: vault.ghRepoId,
      expectedGithubOwnerId: access.githubOwnerId,
      expectedRepositoryName: vault.name,
      repositoryName: githubAccess.repositoryName,
    });
  }
  return githubAccess;
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
