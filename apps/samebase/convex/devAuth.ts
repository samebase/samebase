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
import { normalizeGitHubOwnerLogin } from "./organizations";
import { toSafeRepoName } from "../shared/repoName";
import {
  discoverPreviewSeedGitHubAppInstallations,
  type PreviewSeedGitHubAppInstallation,
} from "./githubApp";
import { getOrganizationProviderConfiguration } from "./organizationProviderCredentials";
import { hashOrganizationProviderSnapshot } from "./providerAuthFingerprint";
import { readActiveUser } from "./userLifecycle";
import { CURRENT_TERMS_VERSION } from "./users";

const { array, boolean, id, literal, object, optional, string, union } = v;
const PREVIEW_SEED_GITHUB_OWNERS = [
  { githubOwnerLogin: "nicu-chiciuc", githubOwnerType: "user" },
  { githubOwnerLogin: "samebase", githubOwnerType: "organization" },
] as const;

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

const vSeedProviderCredentials = object({
  convexConnection: union(
    v.null(),
    object({
      credential: string(),
      teamId: string(),
      teamSlug: optional(string()),
    }),
  ),
  cloudflareConnection: union(
    v.null(),
    object({
      credential: string(),
      accountId: string(),
    }),
  ),
});
type SeedProviderCredentials = Infer<typeof vSeedProviderCredentials>;

const vSeedOrganizationConfig = object({
  githubOwnerId: string(),
  githubOwnerType: vGitHubOwnerType,
  githubOwnerLogin: string(),
  githubInstallationId: string(),
  ...vSeedProviderCredentials.fields,
});
type SeedOrganizationConfig = Infer<typeof vSeedOrganizationConfig>;

function readSeedProviderCredentials(): SeedProviderCredentials {
  const convexCredential = readSeedValue("DEV_SEED_CONVEX_MANAGEMENT_API_KEY");
  const convexTeamId = readSeedValue("DEV_SEED_CONVEX_TEAM_ID");
  const convexTeamSlug = readSeedValue("DEV_SEED_CONVEX_TEAM_SLUG");
  const cloudflareCredential = readSeedValue("DEV_SEED_CLOUDFLARE_API_KEY");
  const cloudflareAccountId = readSeedValue("DEV_SEED_CLOUDFLARE_ACCOUNT_ID");

  let convexConnection: SeedProviderCredentials["convexConnection"] = null;
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

  let cloudflareConnection: SeedProviderCredentials["cloudflareConnection"] = null;
  if (cloudflareCredential !== undefined || cloudflareAccountId !== undefined) {
    cloudflareConnection = {
      credential: requireSeedValue(cloudflareCredential, "DEV_SEED_CLOUDFLARE_API_KEY"),
      accountId: requireSeedValue(cloudflareAccountId, "DEV_SEED_CLOUDFLARE_ACCOUNT_ID"),
    };
  }

  return { convexConnection, cloudflareConnection };
}

function readRequiredPreviewSeedProviderCredentials(): SeedProviderCredentials {
  const credentials = readSeedProviderCredentials();
  if (credentials.convexConnection === null || credentials.cloudflareConnection === null) {
    throw new Error(
      "Preview organization provider seeding requires DEV_SEED_CONVEX_MANAGEMENT_API_KEY, DEV_SEED_CONVEX_TEAM_ID, DEV_SEED_CLOUDFLARE_API_KEY, and DEV_SEED_CLOUDFLARE_ACCOUNT_ID",
    );
  }
  return credentials;
}

function selectPreviewSeedGitHubAppInstallations(
  installations: PreviewSeedGitHubAppInstallation[],
): PreviewSeedGitHubAppInstallation[] {
  return PREVIEW_SEED_GITHUB_OWNERS.map((owner) => {
    const matches = installations.filter(
      (installation) =>
        normalizeGitHubOwnerLogin(installation.githubOwnerLogin) === owner.githubOwnerLogin &&
        installation.githubOwnerType === owner.githubOwnerType,
    );
    const installation = matches.at(0);
    if (matches.length !== 1 || installation === undefined) {
      throw new Error(
        `Expected one preview GitHub App installation for ${owner.githubOwnerLogin}.`,
      );
    }
    return installation;
  });
}

function readSeedWorktreeOrganizationConfig(): SeedOrganizationConfig | null {
  const githubOwnerId = readSeedValue("DEV_SEED_GITHUB_OWNER_ID");
  const githubOwnerType = readSeedValue("DEV_SEED_GITHUB_OWNER_TYPE");
  const githubOwnerLogin = readSeedValue("DEV_SEED_GITHUB_OWNER_LOGIN");
  const githubInstallationId = readSeedValue("DEV_SEED_GITHUB_INSTALLATION_ID");
  const providerCredentials = readSeedProviderCredentials();

  const githubValues = [githubOwnerId, githubOwnerType, githubOwnerLogin, githubInstallationId];
  if (githubValues.every((value) => value === undefined)) {
    if (
      providerCredentials.convexConnection !== null ||
      providerCredentials.cloudflareConnection !== null
    ) {
      throw new Error("GitHub owner and installation seed values are required for provider seeds");
    }
    return null;
  }

  return {
    githubOwnerId: requireSeedValue(githubOwnerId, "DEV_SEED_GITHUB_OWNER_ID"),
    githubOwnerType: readSeedGitHubOwnerType(
      requireSeedValue(githubOwnerType, "DEV_SEED_GITHUB_OWNER_TYPE"),
    ),
    githubOwnerLogin: requireSeedValue(githubOwnerLogin, "DEV_SEED_GITHUB_OWNER_LOGIN"),
    githubInstallationId: requireSeedValue(githubInstallationId, "DEV_SEED_GITHUB_INSTALLATION_ID"),
    ...providerCredentials,
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
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new Error(`Cannot approve missing seed user ${args.userId}`);
    }
    const activeUser = readActiveUser(user);
    if (activeUser === null) {
      throw new Error(`Cannot approve inactive seed user ${args.userId}`);
    }
    // Seeded preview/local password accounts must skip the access and Terms gates.
    if (
      activeUser.isApproved !== true ||
      activeUser.termsAcceptedAt === undefined ||
      activeUser.termsVersion !== CURRENT_TERMS_VERSION
    ) {
      await ctx.db.patch(args.userId, {
        isApproved: true,
        termsAcceptedAt:
          activeUser.termsVersion === CURRENT_TERMS_VERSION
            ? (activeUser.termsAcceptedAt ?? Date.now())
            : Date.now(),
        termsVersion: CURRENT_TERMS_VERSION,
      });
    }
    return null;
  },
});

export const seedOrganizationWithProviderCredentials = internalMutation({
  args: {
    userId: id("users"),
    ...vSeedOrganizationConfig.fields,
  },
  returns: v.null(),
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
      const configuration = await getOrganizationProviderConfiguration(
        ctx.db,
        organization.organizationId,
      );
      const expectedProviderSnapshotHash = await hashOrganizationProviderSnapshot({
        provider: "convex",
        teamId: configuration.convexTeam?.teamId,
        credential: configuration.convexCredential,
      });
      await ctx.runMutation(internal.organizationProviderCredentials.connectConvex, {
        organizationId: organization.organizationId,
        connectedByUserId: args.userId,
        expectedProviderSnapshotHash,
        auth: { method: "api_key", credential: args.convexConnection.credential },
        teamId: args.convexConnection.teamId,
        teamSlug: args.convexConnection.teamSlug,
      });
    }

    if (args.cloudflareConnection !== null) {
      const configuration = await getOrganizationProviderConfiguration(
        ctx.db,
        organization.organizationId,
      );
      const expectedProviderSnapshotHash = await hashOrganizationProviderSnapshot({
        provider: "cloudflare",
        accountId: configuration.cloudflareAccount?.accountId,
        credential: configuration.cloudflareCredential,
      });
      await ctx.runMutation(internal.organizationProviderCredentials.connectCloudflare, {
        organizationId: organization.organizationId,
        connectedByUserId: args.userId,
        expectedProviderSnapshotHash,
        auth: { method: "api_key", credential: args.cloudflareConnection.credential },
        account: {
          accountId: args.cloudflareConnection.accountId,
          accountName: args.cloudflareConnection.accountId,
        },
      });
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
  const convexTeam = { teamId: `acceptance-convex-team:${ownerLogin}` };
  const cloudflareAccount = {
    accountId: `acceptance-cloudflare-account:${ownerLogin}`,
    accountName: `${ownerLogin} acceptance account`,
  };
  const existingOrganization = await ctx.db
    .query("organizations")
    .withIndex("by_github_owner_login_normalized", (query) =>
      query.eq("githubOwnerLoginNormalized", ownerLogin),
    )
    .unique();

  let organizationId: Id<"organizations">;
  if (existingOrganization === null) {
    organizationId = await ctx.db.insert("organizations", {
      cloudflareAccount,
      convexTeam,
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
    if (
      existingOrganization.convexTeam?.teamId !== convexTeam.teamId ||
      existingOrganization.cloudflareAccount?.accountId !== cloudflareAccount.accountId ||
      existingOrganization.cloudflareAccount.accountName !== cloudflareAccount.accountName
    ) {
      await ctx.db.patch(organizationId, { cloudflareAccount, convexTeam });
    }
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
    const ghRepoId = `acceptance-repository:${ownerLogin}/${repositoryName}`;

    const existingVault = await ctx.db
      .query("vaults")
      .withIndex("by_organization_and_name", (query) =>
        query.eq("organizationId", organizationId).eq("name", repositoryName),
      )
      .unique();
    let vaultId: Id<"vaults">;
    let runId: Id<"workflow_vaultProvisioning_runs">;
    let connectRepository: boolean;
    if (existingVault?.state === "connected") {
      if (existingVault.githubMode !== "connect_existing_repository") {
        throw new Error("Acceptance vault has an unsupported existing state.");
      }
      vaultId = existingVault._id;
      runId = existingVault.runId;
      connectRepository = false;
    } else if (existingVault === null) {
      const created = await ctx.runMutation(
        internal.vault.records.createInitializingExistingRepositoryVaultForUser,
        {
          organizationId,
          userId: args.userId,
          ghRepoId,
          ghRepoOwner: ownerLogin,
          ghRepoName: repositoryName,
        },
      );
      vaultId = created.vaultId;
      runId = created.runId;
      connectRepository = true;
    } else if (
      existingVault.state === "provisioning" &&
      existingVault.githubMode === "connect_existing_repository"
    ) {
      vaultId = existingVault._id;
      runId = existingVault.runId;
      connectRepository = true;
    } else {
      throw new Error("Acceptance vault has an unsupported existing state.");
    }

    if (connectRepository) {
      await ctx.runMutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
        vaultId,
        runId,
        userId: args.userId,
        ghRepoId,
        ghRepoOwner: ownerLogin,
        ghRepoName: repositoryName,
        defaultBranch: "main",
        visibility: "private",
      });
    }
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
    if (user === null) {
      throw new Error("An active acceptance user is required.");
    }
    const activeUser = readActiveUser(user);
    if (activeUser === null) {
      throw new Error("An active acceptance user is required.");
    }
    if (
      activeUser.isApproved !== true ||
      activeUser.termsAcceptedAt === undefined ||
      activeUser.termsVersion !== CURRENT_TERMS_VERSION
    ) {
      await ctx.db.patch(userId, {
        isApproved: true,
        termsAcceptedAt:
          activeUser.termsVersion === CURRENT_TERMS_VERSION
            ? (activeUser.termsAcceptedAt ?? Date.now())
            : Date.now(),
        termsVersion: CURRENT_TERMS_VERSION,
      });
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
    const previewSeed =
      accountConfig.kind === "preview_seed"
        ? {
            providerCredentials: readRequiredPreviewSeedProviderCredentials(),
            installations: selectPreviewSeedGitHubAppInstallations(
              await discoverPreviewSeedGitHubAppInstallations(
                requireSeedValue(
                  readSeedValue("DEV_SEED_GITHUB_API_KEY"),
                  "DEV_SEED_GITHUB_API_KEY",
                ),
              ),
            ),
          }
        : null;

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
          state: "active",
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
      await ctx.runMutation(internal.devAuth.seedOrganizationWithProviderCredentials, {
        userId,
        githubOwnerId: worktreeOrganizationConfig.githubOwnerId,
        githubOwnerType: worktreeOrganizationConfig.githubOwnerType,
        githubOwnerLogin: worktreeOrganizationConfig.githubOwnerLogin,
        githubInstallationId: worktreeOrganizationConfig.githubInstallationId,
        convexConnection: worktreeOrganizationConfig.convexConnection,
        cloudflareConnection: worktreeOrganizationConfig.cloudflareConnection,
      });
    }
    if (previewSeed !== null) {
      for (const installation of previewSeed.installations) {
        await ctx.runMutation(internal.devAuth.seedOrganizationWithProviderCredentials, {
          userId,
          githubOwnerId: installation.githubOwnerId,
          githubOwnerType: installation.githubOwnerType,
          githubOwnerLogin: installation.githubOwnerLogin,
          githubInstallationId: installation.githubInstallationId,
          convexConnection: previewSeed.providerCredentials.convexConnection,
          cloudflareConnection: previewSeed.providerCredentials.cloudflareConnection,
        });
      }
    }

    return { email, created };
  },
});
