import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { Octokit } from "@octokit/rest";
import { Infer, v } from "convex/values";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../../../runtime/localWorktreePasswordAuth";
import { internal } from "./_generated/api";
import { resolveDeploymentProfile, resolvePasswordAuthMode } from "./deploymentProfile";
import { internalAction, internalMutation, type DatabaseWriter } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  buildSeedCloudflareDefaultAccount,
  getDefaultProviderConnectionForOrganization,
  selectProviderConnection,
} from "./providerConnections";
import { readOptionalEnv } from "./oauthUtils";
import { normalizeAccountEmail } from "../shared/accountPresentation";
import { ensureOrganizationForUser } from "./organizations";
import { requireOrganizationAccessContext } from "./organizationAccess";

const { boolean, id, literal, object, optional, string, union } = v;

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

/**
 * Password account seeding follows the explicit deployment profile instead of
 * inferring preview-vs-local behavior from env var presence alone.
 */
function readSeedPasswordAccountConfig(): {
  email: string;
  password: string;
} {
  const deploymentProfile = resolveDeploymentProfile();
  const passwordAuthMode = resolvePasswordAuthMode(deploymentProfile);

  switch (passwordAuthMode) {
    case "local_worktree_seed":
      return {
        email: normalizeAccountEmail(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL),
        password: LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
      };
    case "preview_seed":
      return readRequiredSeedPasswordAccountConfig({
        emailEnvName: "PREVIEW_SEED_AUTH_EMAIL",
        passwordEnvName: "PREVIEW_SEED_AUTH_PASSWORD",
      });
    case "manual":
    case "off":
      throw new Error("Password account seeding is disabled for this deployment profile");
    default:
      passwordAuthMode satisfies never;
      throw new Error("Unsupported password auth mode");
  }
}

async function upsertGithubApiKey(
  db: DatabaseWriter,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
  credential: string,
  accountId: string,
  username: string,
): Promise<void> {
  const existing = await getDefaultProviderConnectionForOrganization(db, {
    organizationId,
    kind: "github",
  });
  const now = Date.now();
  const connection = {
    state: "connected" as const,
    kind: "github" as const,
    organizationId,
    connectedByUserId: userId,
    auth: { method: "api_key" as const, credential },
    accountId,
    username,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  let providerConnectionId: Id<"providerConnections">;
  if (existing?.kind === "github" && existing.accountId === accountId) {
    await db.replace(existing._id, connection);
    providerConnectionId = existing._id;
  } else {
    if (existing?.state === "connected") {
      throw new Error("Seed GitHub account does not match the connected account.");
    }
    providerConnectionId = await db.insert("providerConnections", connection);
  }
  await selectProviderConnection(db, { organizationId, providerConnectionId, kind: "github" });
}

async function upsertConvexApiKey(
  db: DatabaseWriter,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
  credential: string,
  teamId: string,
  teamSlug: string | undefined,
): Promise<void> {
  const existing = await getDefaultProviderConnectionForOrganization(db, {
    organizationId,
    kind: "convex",
  });
  const now = Date.now();
  const connection = {
    state: "connected" as const,
    kind: "convex" as const,
    organizationId,
    connectedByUserId: userId,
    auth: { method: "api_key" as const, credential },
    teamId,
    ...(teamSlug !== undefined ? { teamSlug } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  let providerConnectionId: Id<"providerConnections">;
  if (existing?.kind === "convex" && existing.teamId === teamId) {
    await db.replace(existing._id, connection);
    providerConnectionId = existing._id;
  } else {
    if (existing?.state === "connected") {
      throw new Error("Seed Convex team does not match the connected team.");
    }
    providerConnectionId = await db.insert("providerConnections", connection);
  }
  await selectProviderConnection(db, { organizationId, providerConnectionId, kind: "convex" });
}

async function upsertCloudflareApiKey(
  db: DatabaseWriter,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
  credential: string,
  accountId?: string,
): Promise<void> {
  const existing = await getDefaultProviderConnectionForOrganization(db, {
    organizationId,
    kind: "cloudflare",
  });
  const now = Date.now();
  const connection = {
    state: "connected" as const,
    kind: "cloudflare" as const,
    organizationId,
    connectedByUserId: userId,
    auth: { method: "api_key" as const, credential },
    defaultAccount: buildSeedCloudflareDefaultAccount(accountId),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  let providerConnectionId: Id<"providerConnections">;
  if (existing?.kind === "cloudflare") {
    await db.replace(existing._id, connection);
    providerConnectionId = existing._id;
  } else {
    if (existing?.state === "connected") {
      throw new Error("Seed Cloudflare connection conflicts with the connected provider.");
    }
    providerConnectionId = await db.insert("providerConnections", connection);
  }
  await selectProviderConnection(db, {
    organizationId,
    providerConnectionId,
    kind: "cloudflare",
  });
}

const seedPasswordAccountStateArgs = object({
  userId: id("users"),
  organizationId: optional(id("organizations")),
  githubApiKey: optional(string()),
  githubAccountId: optional(string()),
  githubUsername: optional(string()),
  convexManagementApiKey: optional(string()),
  convexTeamId: optional(string()),
  convexTeamSlug: optional(string()),
  cloudflareApiKey: optional(string()),
  cloudflareAccountId: optional(string()),
});
type SeedPasswordAccountStateArgs = Infer<typeof seedPasswordAccountStateArgs>;

const seedPasswordAccountProviderSeed = union(
  object({
    state: literal("complete"),
    organizationId: id("organizations"),
  }),
  object({ state: literal("organization_required") }),
);
type SeedPasswordAccountProviderSeed = Infer<typeof seedPasswordAccountProviderSeed>;

export const seedPasswordAccountState = internalMutation({
  args: seedPasswordAccountStateArgs,
  returns: seedPasswordAccountProviderSeed,
  handler: async (ctx, args): Promise<SeedPasswordAccountProviderSeed> => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new Error(`Cannot prepare missing seed user ${args.userId}`);
    }
    // Seeded preview/local password accounts must skip the pending access gate so
    // operators do not need a parallel code-side allowlist for dev access.
    if (user.isApproved !== true) {
      await ctx.db.patch(args.userId, { isApproved: true });
    }
    await ensureOrganizationForUser(ctx.db, args.userId);

    let organizationId: Id<"organizations">;
    if (args.organizationId !== undefined) {
      const access = await requireOrganizationAccessContext(ctx.db, {
        userId: args.userId,
        organizationId: args.organizationId,
      });
      organizationId = access.organizationId;
    } else {
      const memberships = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_user", (query) => query.eq("userId", args.userId))
        .take(2);
      if (memberships.length !== 1) {
        return { state: "organization_required" };
      }
      const [membership] = memberships;
      const organization = await ctx.db.get(membership.organizationId);
      if (organization === null) {
        throw new Error("The seed account membership refers to a missing organization.");
      }
      organizationId = membership.organizationId;
    }

    if (args.githubApiKey) {
      if (!args.githubAccountId || !args.githubUsername) {
        throw new Error("GitHub seed identity is required with the GitHub API key.");
      }
      await upsertGithubApiKey(
        ctx.db,
        args.userId,
        organizationId,
        args.githubApiKey,
        args.githubAccountId,
        args.githubUsername,
      );
    }

    if (args.convexManagementApiKey || args.convexTeamId || args.convexTeamSlug) {
      if (!args.convexManagementApiKey || !args.convexTeamId) {
        throw new Error(
          "Both DEV_SEED_CONVEX_MANAGEMENT_API_KEY and DEV_SEED_CONVEX_TEAM_ID are required",
        );
      }
      await upsertConvexApiKey(
        ctx.db,
        args.userId,
        organizationId,
        args.convexManagementApiKey,
        args.convexTeamId,
        args.convexTeamSlug,
      );
    }

    if (args.cloudflareApiKey || args.cloudflareAccountId) {
      if (!args.cloudflareApiKey) {
        throw new Error("Cloudflare API key must be provided when setting Cloudflare seed details");
      }
      await upsertCloudflareApiKey(
        ctx.db,
        args.userId,
        organizationId,
        args.cloudflareApiKey,
        args.cloudflareAccountId,
      );
    }

    return { state: "complete", organizationId };
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
  providerSeed: seedPasswordAccountProviderSeed,
});
type SeedPasswordAccountResult = Infer<typeof seedPasswordAccountReturns>;

export const seedPasswordAccount = internalAction({
  args: {
    organizationId: optional(id("organizations")),
  },
  returns: seedPasswordAccountReturns,
  handler: async (ctx, args): Promise<SeedPasswordAccountResult> => {
    const { email, password } = readSeedPasswordAccountConfig();
    const githubApiKey = readSeedValue("DEV_SEED_GITHUB_API_KEY");
    const convexManagementApiKey = readSeedValue("DEV_SEED_CONVEX_MANAGEMENT_API_KEY");
    const convexTeamId = readSeedValue("DEV_SEED_CONVEX_TEAM_ID");
    const convexTeamSlug = readSeedValue("DEV_SEED_CONVEX_TEAM_SLUG");
    const cloudflareApiKey = readSeedValue("DEV_SEED_CLOUDFLARE_API_KEY");
    const cloudflareAccountId = readSeedValue("DEV_SEED_CLOUDFLARE_ACCOUNT_ID");
    const seedArgs: Omit<SeedPasswordAccountStateArgs, "userId"> = {
      ...(args.organizationId !== undefined ? { organizationId: args.organizationId } : {}),
    };
    if (githubApiKey !== undefined) {
      const profile = await new Octokit({ auth: githubApiKey }).rest.users.getAuthenticated();
      if (!profile.data.login) {
        throw new Error("GitHub seed API key did not return an account login.");
      }
      seedArgs.githubApiKey = githubApiKey;
      seedArgs.githubAccountId = String(profile.data.id);
      seedArgs.githubUsername = profile.data.login;
    }
    if (convexManagementApiKey !== undefined) {
      seedArgs.convexManagementApiKey = convexManagementApiKey;
    }
    if (convexTeamId !== undefined) {
      seedArgs.convexTeamId = convexTeamId;
    }
    if (convexTeamSlug !== undefined) {
      seedArgs.convexTeamSlug = convexTeamSlug;
    }
    if (cloudflareApiKey !== undefined) {
      seedArgs.cloudflareApiKey = cloudflareApiKey;
    }
    if (cloudflareAccountId !== undefined) {
      seedArgs.cloudflareAccountId = cloudflareAccountId;
    }

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

    const providerSeed: SeedPasswordAccountProviderSeed = await ctx.runMutation(
      internal.devAuth.seedPasswordAccountState,
      {
        ...seedArgs,
        userId,
      },
    );

    return { email, created, providerSeed };
  },
});
