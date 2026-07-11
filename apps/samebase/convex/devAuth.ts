import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../../../runtime/localWorktreePasswordAuth";
import { internal } from "./_generated/api";
import {
  assertProductionReviewSeedPasswordAuthConfig,
  resolveDeploymentProfile,
  resolvePasswordAuthMode,
} from "./deploymentProfile";
import { internalAction, internalMutation, type DatabaseWriter } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  buildSeedCloudflareDefaultAccount,
  getConnectionByUserAndKind,
} from "./providerConnections";
import { readOptionalEnv } from "./oauthUtils";
import { normalizeAccountEmail } from "../shared/accountPresentation";

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

/**
 * Password account seeding follows the explicit deployment profile instead of
 * inferring preview-vs-local behavior from env var presence alone.
 */
function readSeedPasswordAccountConfig(): {
  email: string;
  password: string;
  shouldLinkViaEmail: boolean;
} {
  const deploymentProfile = resolveDeploymentProfile();
  const passwordAuthMode = resolvePasswordAuthMode(deploymentProfile);
  if (deploymentProfile.kind === "production") {
    const reviewEmail = readSeedValue("OPENAI_REVIEW_AUTH_EMAIL");
    const reviewPassword = readSeedValue("OPENAI_REVIEW_AUTH_PASSWORD");
    if (reviewEmail !== undefined || reviewPassword !== undefined) {
      assertProductionReviewSeedPasswordAuthConfig({
        OPENAI_REVIEW_AUTH_EMAIL: reviewEmail,
        OPENAI_REVIEW_AUTH_PASSWORD: reviewPassword,
      });
    }
  }

  switch (passwordAuthMode) {
    case "local_worktree_seed":
      return {
        email: normalizeAccountEmail(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL),
        password: LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
        shouldLinkViaEmail: false,
      };
    case "preview_seed":
      return {
        ...readRequiredSeedPasswordAccountConfig({
          emailEnvName: "PREVIEW_SEED_AUTH_EMAIL",
          passwordEnvName: "PREVIEW_SEED_AUTH_PASSWORD",
        }),
        shouldLinkViaEmail: false,
      };
    case "production_review_seed":
      return {
        ...readRequiredSeedPasswordAccountConfig({
          emailEnvName: "OPENAI_REVIEW_AUTH_EMAIL",
          passwordEnvName: "OPENAI_REVIEW_AUTH_PASSWORD",
        }),
        shouldLinkViaEmail: true,
      };
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
  credential: string,
): Promise<void> {
  const existing = await getConnectionByUserAndKind(db, userId, "github");
  const now = Date.now();
  if (existing) {
    await db.patch(existing._id, {
      auth: {
        method: "api_key",
        credential,
      },
      updatedAt: now,
    });
    return;
  }
  await db.insert("providerConnections", {
    kind: "github",
    userId,
    auth: {
      method: "api_key",
      credential,
    },
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertConvexApiKey(
  db: DatabaseWriter,
  userId: Id<"users">,
  credential: string,
  teamId: string,
  teamSlug: string | undefined,
): Promise<void> {
  const existing = await getConnectionByUserAndKind(db, userId, "convex");
  const now = Date.now();
  if (existing) {
    await db.patch(existing._id, {
      auth: {
        method: "api_key",
        credential,
      },
      teamId,
      teamSlug,
      updatedAt: now,
    });
    return;
  }
  const connection = {
    kind: "convex",
    userId,
    auth: {
      method: "api_key",
      credential,
    },
    teamId,
    ...(teamSlug !== undefined ? { teamSlug } : {}),
    createdAt: now,
    updatedAt: now,
  } as const;
  await db.insert("providerConnections", connection);
}

async function upsertCloudflareApiKey(
  db: DatabaseWriter,
  userId: Id<"users">,
  credential: string,
  accountId?: string,
): Promise<void> {
  const existing = await getConnectionByUserAndKind(db, userId, "cloudflare");
  const now = Date.now();
  const defaultAccount = buildSeedCloudflareDefaultAccount(accountId);
  if (existing) {
    await db.patch(existing._id, {
      auth: {
        method: "api_key",
        credential,
      },
      defaultAccount,
      updatedAt: now,
    });
    return;
  }
  await db.insert("providerConnections", {
    kind: "cloudflare",
    userId,
    auth: {
      method: "api_key",
      credential,
    },
    defaultAccount,
    createdAt: now,
    updatedAt: now,
  });
}

const seedProviderConnectionsArgs = object({
  userId: id("users"),
  githubApiKey: optional(string()),
  convexManagementApiKey: optional(string()),
  convexTeamId: optional(string()),
  convexTeamSlug: optional(string()),
  cloudflareApiKey: optional(string()),
  cloudflareAccountId: optional(string()),
});
type SeedProviderConnectionsArgs = Infer<typeof seedProviderConnectionsArgs>;

export const seedProviderConnectionsForUser = internalMutation({
  args: seedProviderConnectionsArgs,
  returns: vNull(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new Error(`Cannot seed provider connections for missing user ${args.userId}`);
    }
    // Seeded preview/local password accounts must skip the pending access gate so
    // operators do not need a parallel code-side allowlist for dev access.
    if (user.isApproved !== true) {
      await ctx.db.patch(args.userId, { isApproved: true });
    }

    if (args.githubApiKey) {
      await upsertGithubApiKey(ctx.db, args.userId, args.githubApiKey);
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
        args.cloudflareApiKey,
        args.cloudflareAccountId,
      );
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
    verifiedUserId: optional(id("users")),
  }),
);
type SeedPasswordAccountUserResolution = Infer<typeof seedPasswordAccountUserResolution>;

export const resolveSeedPasswordAccountUser = internalMutation({
  args: {
    email: string(),
    shouldLinkViaEmail: boolean(),
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
    if (!args.shouldLinkViaEmail) {
      if (accounts.length === 0) {
        return { kind: "missing" };
      }
      return { kind: "existing", userId: accounts[0].userId };
    }

    const verifiedUserIds: Id<"users">[] = [];
    for await (const user of ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))) {
      if (user.emailVerificationTime !== undefined) {
        verifiedUserIds.push(user._id);
        if (verifiedUserIds.length > 1) {
          break;
        }
      }
    }
    if (verifiedUserIds.length !== 1) {
      throw new Error(
        `Expected exactly one verified user for ${email}; found ${verifiedUserIds.length}`,
      );
    }
    const verifiedUserId = verifiedUserIds[0];
    if (accounts.length === 0) {
      return { kind: "missing", verifiedUserId };
    }
    const account = accounts[0];
    if (account.userId !== verifiedUserId) {
      throw new Error(
        `Review password account for ${email} is linked to ${account.userId}, not verified user ${verifiedUserId}`,
      );
    }
    return { kind: "existing", userId: verifiedUserId };
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
    const { email, password, shouldLinkViaEmail } = readSeedPasswordAccountConfig();
    const githubApiKey = readSeedValue("DEV_SEED_GITHUB_API_KEY");
    const convexManagementApiKey = readSeedValue("DEV_SEED_CONVEX_MANAGEMENT_API_KEY");
    const convexTeamId = readSeedValue("DEV_SEED_CONVEX_TEAM_ID");
    const convexTeamSlug = readSeedValue("DEV_SEED_CONVEX_TEAM_SLUG");
    const cloudflareApiKey = readSeedValue("DEV_SEED_CLOUDFLARE_API_KEY");
    const cloudflareAccountId = readSeedValue("DEV_SEED_CLOUDFLARE_ACCOUNT_ID");
    const seedArgs: Omit<SeedProviderConnectionsArgs, "userId"> = {};
    if (githubApiKey !== undefined) {
      seedArgs.githubApiKey = githubApiKey;
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
        shouldLinkViaEmail,
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
        shouldLinkViaEmail,
        shouldLinkViaPhone: false,
      });
      if (
        resolution.verifiedUserId !== undefined &&
        createdAccount.user._id !== resolution.verifiedUserId
      ) {
        throw new Error(
          `Created review password account linked to ${createdAccount.user._id}, not verified user ${resolution.verifiedUserId}`,
        );
      }
      userId = createdAccount.user._id;
      created = true;
    }

    await ctx.runMutation(internal.devAuth.seedProviderConnectionsForUser, {
      ...seedArgs,
      userId,
    });

    return { email, created };
  },
});
