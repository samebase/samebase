import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../../../runtime/localWorktreePasswordAuth";
import { internal } from "./_generated/api";
import { resolveDeploymentProfile, resolvePasswordAuthMode } from "./deploymentProfile";
import { internalAction, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { readOptionalEnv } from "./oauthUtils";
import { normalizeAccountEmail } from "../shared/accountPresentation";
import { vGitHubOwnerType } from "./organizationModel";
import { getSelectedProviderConnectionForOrganization } from "./providerConnections";
import type { CloudflareDefaultAccount } from "./providerConnectionModel";

const { boolean, id, literal, null: vNull, object, optional, string, union } = v;

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
