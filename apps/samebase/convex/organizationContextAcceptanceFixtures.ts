import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { resolveDeploymentProfile } from "./deploymentProfile";
import { normalizeGitHubOwnerLogin } from "./organizations";
import { normalizeAccountEmail } from "../shared/accountPresentation";
import { toSafeRepoName } from "../shared/repoName";

const { array, literal, object, string, union } = v;

const ACCEPTANCE_OWNER_PREFIX = "org-context-";
const vAcceptanceOrganization = object({
  access: union(literal("retain"), literal("remove")),
  ownerLogin: string(),
  repositories: array(string()),
});
type AcceptanceOrganization = Infer<typeof vAcceptanceOrganization>;

function requireAcceptanceOwnerLogin(ownerLogin: string): string {
  const normalizedOwnerLogin = normalizeGitHubOwnerLogin(ownerLogin);
  if (
    ownerLogin !== normalizedOwnerLogin ||
    !normalizedOwnerLogin.startsWith(ACCEPTANCE_OWNER_PREFIX)
  ) {
    throw new Error(
      "Acceptance organization owners must start with " + ACCEPTANCE_OWNER_PREFIX + ".",
    );
  }

  return normalizedOwnerLogin;
}

async function ensureAcceptanceOrganization(
  ctx: MutationCtx,
  args: {
    organization: AcceptanceOrganization;
    userId: Id<"users">;
  },
): Promise<Id<"organizations">> {
  const ownerLogin = requireAcceptanceOwnerLogin(args.organization.ownerLogin);
  const githubOwnerId = "acceptance-owner:" + ownerLogin;
  const githubInstallationId = "acceptance-installation:" + ownerLogin;
  const existingOrganization = await ctx.db
    .query("organizations")
    .withIndex("by_github_owner_login_normalized", (query) =>
      query.eq("githubOwnerLoginNormalized", ownerLogin),
    )
    .unique();

  let organizationId: Id<"organizations">;
  if (existingOrganization === null) {
    organizationId = await ctx.db.insert("organizations", {
      githubOwnerId,
      githubOwnerType: "organization",
      githubOwnerLogin: ownerLogin,
      githubOwnerLoginNormalized: ownerLogin,
      githubInstallationId,
    });
    await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
    });
  } else {
    if (
      existingOrganization.githubOwnerId !== githubOwnerId ||
      existingOrganization.githubInstallationId !== githubInstallationId
    ) {
      throw new Error("Acceptance organization owner is already used by non-fixture data.");
    }
    organizationId = existingOrganization._id;
  }

  const existingMembership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization_and_user", (query) =>
      query.eq("organizationId", organizationId).eq("userId", args.userId),
    )
    .unique();
  if (existingMembership === null) {
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: args.userId,
      role: "owner",
    });
  } else if (existingMembership.role !== "owner") {
    await ctx.db.patch(existingMembership._id, { role: "owner" });
  }

  const repositoryNames = new Set<string>();
  for (const repositoryName of args.organization.repositories) {
    if (
      repositoryName.length === 0 ||
      repositoryName !== repositoryName.toLowerCase() ||
      toSafeRepoName(repositoryName) !== repositoryName
    ) {
      throw new Error("Acceptance repository names must be lowercase safe repository names.");
    }
    if (repositoryNames.has(repositoryName)) {
      throw new Error("Duplicate acceptance repository " + repositoryName + ".");
    }
    repositoryNames.add(repositoryName);

    const existingVault = await ctx.db
      .query("vaults")
      .withIndex("by_organization_and_name", (query) =>
        query.eq("organizationId", organizationId).eq("name", repositoryName),
      )
      .unique();
    let vaultId: Id<"vaults">;
    let runId: Id<"workflow_vaultProvisioning_runs">;
    if (existingVault?.state === "connected") {
      if (existingVault.githubMode !== "connect_existing_repository") {
        throw new Error("Acceptance vault has an unsupported existing state.");
      }
      vaultId = existingVault._id;
      runId = existingVault.runId;
    } else if (existingVault === null) {
      const created = await ctx.runMutation(
        internal.vault.records.createInitializingExistingRepositoryVaultForUser,
        {
          organizationId,
          userId: args.userId,
          ghRepoOwner: ownerLogin,
          ghRepoName: repositoryName,
        },
      );
      vaultId = created.vaultId;
      runId = created.runId;
    } else if (
      existingVault.state === "provisioning" &&
      existingVault.githubMode === "connect_existing_repository"
    ) {
      vaultId = existingVault._id;
      runId = existingVault.runId;
    } else {
      throw new Error("Acceptance vault has an unsupported existing state.");
    }

    await ctx.runMutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
      vaultId,
      runId,
      userId: args.userId,
      ghRepoId: "acceptance-repository:" + ownerLogin + "/" + repositoryName,
      ghRepoOwner: ownerLogin,
      ghRepoName: repositoryName,
      defaultBranch: "main",
      visibility: "private",
    });

    const run = await ctx.db.get(runId);
    if (run === null) {
      throw new Error("Acceptance vault provisioning run was not found.");
    }
    if (run.state !== "succeeded" || run.currentStep !== "finish") {
      const completedAt = Date.now();
      await ctx.db.patch(runId, {
        completedAt,
        currentStep: "finish",
        state: "succeeded",
        updatedAt: completedAt,
      });
    }
  }

  if (args.organization.access === "remove") {
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_user", (query) =>
        query.eq("organizationId", organizationId).eq("userId", args.userId),
      )
      .unique();
    if (membership !== null) {
      await ctx.db.delete(membership._id);
    }
  }

  return organizationId;
}

export const apply = internalMutation({
  args: {
    email: string(),
    organizations: array(vAcceptanceOrganization),
  },
  returns: object({
    organizationIds: array(v.id("organizations")),
  }),
  handler: async (ctx, args) => {
    if (resolveDeploymentProfile().kind !== "local_worktree") {
      throw new Error("Organization context acceptance fixtures require a local worktree.");
    }
    if (args.organizations.length > 3) {
      throw new Error(
        "Organization context acceptance fixtures support at most three organizations.",
      );
    }

    const email = normalizeAccountEmail(args.email);
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (query) =>
        query.eq("provider", "password").eq("providerAccountId", email),
      )
      .take(2);
    if (accounts.length !== 1) {
      throw new Error("Expected one password account for " + email + ".");
    }

    const userId = accounts[0].userId;
    const user = await ctx.db.get(userId);
    if (user === null || user.accountDeletion !== undefined) {
      throw new Error("An active acceptance user is required.");
    }
    if (user.isApproved !== true) {
      await ctx.db.patch(userId, { isApproved: true });
    }

    const owners = new Set<string>();
    const organizationIds: Id<"organizations">[] = [];
    for (const organization of args.organizations) {
      if (organization.repositories.length > 3) {
        throw new Error(
          "Organization context acceptance fixtures support at most three repositories.",
        );
      }
      const ownerLogin = requireAcceptanceOwnerLogin(organization.ownerLogin);
      if (owners.has(ownerLogin)) {
        throw new Error("Duplicate acceptance organization " + ownerLogin + ".");
      }
      owners.add(ownerLogin);
      organizationIds.push(
        await ensureAcceptanceOrganization(ctx, {
          organization,
          userId,
        }),
      );
    }

    return { organizationIds };
  },
});
