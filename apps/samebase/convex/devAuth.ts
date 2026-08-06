import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../../../runtime/localWorktreePasswordAuth";
import { internal } from "./_generated/api";
import { resolveDeploymentProfile, resolvePasswordAuthMode } from "./deploymentProfile";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { readOptionalEnv } from "./oauthUtils";
import { normalizeAccountEmail } from "../shared/accountPresentation";
import { vGitHubOwnerType } from "./organizationModel";
import { getSelectedProviderConnectionForOrganization } from "./providerConnections";
import type { CloudflareDefaultAccount } from "./providerConnectionModel";
import { normalizeGitHubOwnerLogin } from "./organizations";
import { toSafeRepoName } from "../shared/repoName";

const { array, boolean, id, literal, null: vNull, object, optional, string, union } = v;

function readSeedValue(envName: string): string | undefined {
  const value = readOptionalEnv(envName);
  if (value === null) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readRequiredSeedPasswordAccountConfig(args: {
  emailEnvName: string;
  passwordEnvName: string;
}): {
  email: string;
  password: string;
} {
  const email = readSeedValue(args.emailEnvName);
  const password = readSeedValue(args.passwordEnvName);
  if (email === undefined && password === undefined) {
    throw new Error(`${args.emailEnvName} and ${args.passwordEnvName} are required`);
  }
  if (email === undefined || password === undefined) {
    throw new Error(
      email === undefined
        ? `${args.emailEnvName} is required when ${args.passwordEnvName} is set`
        : `${args.passwordEnvName} is required when ${args.emailEnvName} is set`,
    );
  }
  return {
    email: normalizeAccountEmail(email),
    password,
  };
}

function requireSeedValue(value: string | undefined, envName: string): string {
  if (value === undefined) {
    throw new Error(`${envName} is required`);
  }
  return value;
}

function readSeedGitHubOwnerType(value: string): "organization" | "user" {
  switch (value) {
    case "organization":
    case "user":
      return value;
    default:
      throw new Error('DEV_SEED_GITHUB_OWNER_TYPE must be "organization" or "user"');
  }
}

const vSeedWorktreeOrganizationConfig = object({
  githubOwnerId: string(),
  githubOwnerType: vGitHubOwnerType,
  githubOwnerLogin: string(),
  githubInstallationId: string(),
  convexConnection: union(
    vNull(),
    object({
      credential: string(),
      teamId: string(),
      teamSlug: optional(string()),
    }),
  ),
  cloudflareConnection: union(
    vNull(),
    object({
      credential: string(),
      accountId: optional(string()),
    }),
  ),
});
type SeedWorktreeOrganizationConfig = Infer<typeof vSeedWorktreeOrganizationConfig>;

function readSeedWorktreeOrganizationConfig(): SeedWorktreeOrganizationConfig | null {
  const githubOwnerId = readSeedValue("DEV_SEED_GITHUB_OWNER_ID");
  const githubOwnerType = readSeedValue("DEV_SEED_GITHUB_OWNER_TYPE");
  const githubOwnerLogin = readSeedValue("DEV_SEED_GITHUB_OWNER_LOGIN");
  const githubInstallationId = readSeedValue("DEV_SEED_GITHUB_INSTALLATION_ID");
  const convexCredential = readSeedValue("DEV_SEED_CONVEX_MANAGEMENT_API_KEY");
  const convexTeamId = readSeedValue("DEV_SEED_CONVEX_TEAM_ID");
  const convexTeamSlug = readSeedValue("DEV_SEED_CONVEX_TEAM_SLUG");
  const cloudflareCredential = readSeedValue("DEV_SEED_CLOUDFLARE_API_KEY");
  const cloudflareAccountId = readSeedValue("DEV_SEED_CLOUDFLARE_ACCOUNT_ID");

  const githubValues = [githubOwnerId, githubOwnerType, githubOwnerLogin, githubInstallationId];
  if (githubValues.every((value) => value === undefined)) {
    const hasProviderSeed = [
      convexCredential,
      convexTeamId,
      convexTeamSlug,
      cloudflareCredential,
      cloudflareAccountId,
    ].some((value) => value !== undefined);
    if (hasProviderSeed) {
      throw new Error("GitHub owner and installation seed values are required for provider seeds");
    }
    return null;
  }

  let convexConnection: SeedWorktreeOrganizationConfig["convexConnection"] = null;
  if (
    convexCredential !== undefined ||
    convexTeamId !== undefined ||
    convexTeamSlug !== undefined
  ) {
    convexConnection = {
      credential: requireSeedValue(convexCredential, "DEV_SEED_CONVEX_MANAGEMENT_API_KEY"),
      teamId: requireSeedValue(convexTeamId, "DEV_SEED_CONVEX_TEAM_ID"),
      ...(convexTeamSlug === undefined ? {} : { teamSlug: convexTeamSlug }),
    };
  }

  let cloudflareConnection: SeedWorktreeOrganizationConfig["cloudflareConnection"] = null;
  if (cloudflareCredential !== undefined || cloudflareAccountId !== undefined) {
    cloudflareConnection = {
      credential: requireSeedValue(cloudflareCredential, "DEV_SEED_CLOUDFLARE_API_KEY"),
      ...(cloudflareAccountId === undefined ? {} : { accountId: cloudflareAccountId }),
    };
  }

  return {
    githubOwnerId: requireSeedValue(githubOwnerId, "DEV_SEED_GITHUB_OWNER_ID"),
    githubOwnerType: readSeedGitHubOwnerType(
      requireSeedValue(githubOwnerType, "DEV_SEED_GITHUB_OWNER_TYPE"),
    ),
    githubOwnerLogin: requireSeedValue(githubOwnerLogin, "DEV_SEED_GITHUB_OWNER_LOGIN"),
    githubInstallationId: requireSeedValue(githubInstallationId, "DEV_SEED_GITHUB_INSTALLATION_ID"),
    convexConnection,
    cloudflareConnection,
  };
}

/**
 * Password account seeding follows the explicit deployment profile instead of
 * inferring preview-vs-local behavior from env var presence alone.
 */
function readSeedPasswordAccountConfig():
  | {
      kind: "local_worktree_seed";
      email: string;
      password: string;
    }
  | {
      kind: "preview_seed";
      email: string;
      password: string;
    } {
  const deploymentProfile = resolveDeploymentProfile();
  const passwordAuthMode = resolvePasswordAuthMode(deploymentProfile);

  switch (passwordAuthMode) {
    case "local_worktree_seed":
      return {
        kind: passwordAuthMode,
        email: normalizeAccountEmail(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL),
        password: LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
      };
    case "preview_seed":
      return {
        kind: passwordAuthMode,
        ...readRequiredSeedPasswordAccountConfig({
          emailEnvName: "PREVIEW_SEED_AUTH_EMAIL",
          passwordEnvName: "PREVIEW_SEED_AUTH_PASSWORD",
        }),
      };
    case "manual":
    case "off":
      throw new Error("Password account seeding is disabled for this deployment profile");
    default:
      passwordAuthMode satisfies never;
      throw new Error("Unsupported password auth mode");
  }
}

export const approveSeedPasswordAccount = internalMutation({
  args: {
    userId: id("users"),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new Error(`Cannot approve missing seed user ${args.userId}`);
    }
    // Seeded preview/local password accounts must skip the pending access gate so
    // operators do not need a parallel code-side allowlist for dev access.
    if (user.isApproved !== true) {
      await ctx.db.patch(args.userId, { isApproved: true });
    }
    return null;
  },
});

export const seedWorktreeOrganization = internalMutation({
  args: {
    userId: id("users"),
    ...vSeedWorktreeOrganizationConfig.fields,
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    const organization = await ctx.runMutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId: args.userId,
        githubOwnerId: args.githubOwnerId,
        githubOwnerType: args.githubOwnerType,
        githubOwnerLogin: args.githubOwnerLogin,
        githubInstallationId: args.githubInstallationId,
      },
    );

    if (args.convexConnection !== null) {
      await ctx.runMutation(internal.providerConnections.createConnected, {
        organizationId: organization.organizationId,
        connectedByUserId: args.userId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: args.convexConnection.credential },
          teamId: args.convexConnection.teamId,
          ...(args.convexConnection.teamSlug === undefined
            ? {}
            : { teamSlug: args.convexConnection.teamSlug }),
        },
      });
    }

    if (args.cloudflareConnection !== null) {
      const defaultAccount: CloudflareDefaultAccount =
        args.cloudflareConnection.accountId === undefined
          ? { state: "not_selected" }
          : {
              state: "selected",
              accountId: args.cloudflareConnection.accountId,
              accountName: args.cloudflareConnection.accountId,
            };
      const selectedConnection = await getSelectedProviderConnectionForOrganization(ctx.db, {
        organizationId: organization.organizationId,
        kind: "cloudflare",
      });
      const connection = {
        kind: "cloudflare",
        auth: { method: "api_key", credential: args.cloudflareConnection.credential },
        defaultAccount,
      } as const;
      if (selectedConnection === null) {
        await ctx.runMutation(internal.providerConnections.createConnected, {
          organizationId: organization.organizationId,
          connectedByUserId: args.userId,
          connection,
        });
      } else {
        await ctx.runMutation(internal.providerConnections.reauthorizeConnected, {
          organizationId: organization.organizationId,
          connectedByUserId: args.userId,
          providerConnectionId: selectedConnection._id,
          connection,
        });
      }
    }

    return null;
  },
});

const ORGANIZATION_CONTEXT_ACCEPTANCE_OWNER_PREFIX = "org-context-";
const vOrganizationContextAcceptanceOrganization = object({
  access: union(literal("retain"), literal("remove")),
  ownerLogin: string(),
  repositories: array(string()),
});
type OrganizationContextAcceptanceOrganization = Infer<
  typeof vOrganizationContextAcceptanceOrganization
>;

function requireOrganizationContextAcceptanceOwnerLogin(ownerLogin: string): string {
  const normalizedOwnerLogin = normalizeGitHubOwnerLogin(ownerLogin);
  if (
    ownerLogin !== normalizedOwnerLogin ||
    !normalizedOwnerLogin.startsWith(ORGANIZATION_CONTEXT_ACCEPTANCE_OWNER_PREFIX)
  ) {
    throw new Error(
      `Acceptance organization owners must start with ${ORGANIZATION_CONTEXT_ACCEPTANCE_OWNER_PREFIX}.`,
    );
  }

  return normalizedOwnerLogin;
}

async function ensureOrganizationContextAcceptanceOrganization(
  ctx: MutationCtx,
  args: {
    organization: OrganizationContextAcceptanceOrganization;
    userId: Id<"users">;
  },
): Promise<Id<"organizations">> {
  const ownerLogin = requireOrganizationContextAcceptanceOwnerLogin(args.organization.ownerLogin);
  const githubOwnerId = `acceptance-owner:${ownerLogin}`;
  const githubInstallationId = `acceptance-installation:${ownerLogin}`;
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
      throw new Error(`Duplicate acceptance repository ${repositoryName}.`);
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
      ghRepoId: `acceptance-repository:${ownerLogin}/${repositoryName}`,
      ghRepoOwner: ownerLogin,
      ghRepoName: repositoryName,
      defaultBranch: "main",
      visibility: "private",
    });
    await ctx.runMutation(internal.vault.branches.upsertVaultBranchTree, {
      vaultId,
      branch: "main",
      commitSHA: `acceptance-commit:${ownerLogin}/${repositoryName}`,
      treeData: {
        sha: `acceptance-tree:${ownerLogin}/${repositoryName}`,
        tree: [
          {
            mode: "100644",
            path: "README.md",
            sha: `acceptance-blob:${ownerLogin}/${repositoryName}/README.md`,
            size: 24,
            type: "blob",
          },
        ],
        truncated: false,
      },
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

export const applyOrganizationContextAcceptanceFixture = internalMutation({
  args: {
    email: string(),
    organizations: array(vOrganizationContextAcceptanceOrganization),
  },
  returns: object({
    organizationIds: array(id("organizations")),
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
      throw new Error(`Expected one password account for ${email}.`);
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
      const ownerLogin = requireOrganizationContextAcceptanceOwnerLogin(organization.ownerLogin);
      if (owners.has(ownerLogin)) {
        throw new Error(`Duplicate acceptance organization ${ownerLogin}.`);
      }
      owners.add(ownerLogin);
      organizationIds.push(
        await ensureOrganizationContextAcceptanceOrganization(ctx, {
          organization,
          userId,
        }),
      );
    }

    return { organizationIds };
  },
});

const seedPasswordAccountUserResolution = union(
  object({
    kind: literal("existing"),
    userId: id("users"),
  }),
  object({
    kind: literal("missing"),
  }),
);
type SeedPasswordAccountUserResolution = Infer<typeof seedPasswordAccountUserResolution>;

export const resolveSeedPasswordAccountUser = internalMutation({
  args: {
    email: string(),
  },
  returns: seedPasswordAccountUserResolution,
  handler: async (ctx, args): Promise<SeedPasswordAccountUserResolution> => {
    const email = normalizeAccountEmail(args.email);
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .take(2);
    if (accounts.length > 1) {
      throw new Error(`Multiple password auth accounts exist for ${email}`);
    }
    if (accounts.length === 0) {
      return { kind: "missing" };
    }
    return { kind: "existing", userId: accounts[0].userId };
  },
});

const seedPasswordAccountReturns = object({
  email: string(),
  created: boolean(),
});
type SeedPasswordAccountResult = Infer<typeof seedPasswordAccountReturns>;

export const seedPasswordAccount = internalAction({
  args: {},
  returns: seedPasswordAccountReturns,
  handler: async (ctx): Promise<SeedPasswordAccountResult> => {
    const accountConfig = readSeedPasswordAccountConfig();
    const { email, password } = accountConfig;
    const worktreeOrganizationConfig =
      accountConfig.kind === "local_worktree_seed" ? readSeedWorktreeOrganizationConfig() : null;

    let created = false;
    let userId: Id<"users">;
    const resolution: SeedPasswordAccountUserResolution = await ctx.runMutation(
      internal.devAuth.resolveSeedPasswordAccountUser,
      {
        email,
      },
    );
    if (resolution.kind === "existing") {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: {
          id: email,
          secret: password,
        },
      });
      userId = resolution.userId;
    } else {
      const createdAccount = await createAccount(ctx, {
        provider: "password",
        account: {
          id: email,
          secret: password,
        },
        profile: {
          email,
          emailVerificationTime: Date.now(),
        },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: false,
      });
      userId = createdAccount.user._id;
      created = true;
    }

    await ctx.runMutation(internal.devAuth.approveSeedPasswordAccount, { userId });
    if (worktreeOrganizationConfig !== null) {
      await ctx.runMutation(internal.devAuth.seedWorktreeOrganization, {
        userId,
        ...worktreeOrganizationConfig,
      });
    }

    return { email, created };
  },
});
