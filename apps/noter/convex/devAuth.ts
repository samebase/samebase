import {
  createAccount,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  type DatabaseWriter,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getConnectionByUserAndKind } from "./providerConnections";
import { fetchRailwayConnectionDetails } from "./railwayConnectionDetails";
import { readOptionalEnv } from "./oauthUtils";
import { isAllowedEmail } from "./users";

const DEV_SEED_EMAIL = "nicu@noter.md";
const DEV_SEED_PASSWORD = "pass1234";
const { boolean, null: vNull, object, optional, string } = v;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isMissingPasswordAccountError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("does not exist") ||
      error.message.includes("not found"))
  );
}

function readSeedValue(envName: string): string | undefined {
  const value = readOptionalEnv(envName);
  if (value === null) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
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
      teamSlug: undefined,
      updatedAt: now,
    });
    return;
  }
  await db.insert("providerConnections", {
    kind: "convex",
    userId,
    auth: {
      method: "api_key",
      credential,
    },
    teamId,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertNetlifyApiKey(
  db: DatabaseWriter,
  userId: Id<"users">,
  credential: string,
  teamId: string,
): Promise<void> {
  const existing = await getConnectionByUserAndKind(db, userId, "netlify");
  const now = Date.now();
  if (existing) {
    await db.patch(existing._id, {
      auth: {
        method: "api_key",
        credential,
      },
      teamId,
      teamSlug: teamId,
      updatedAt: now,
    });
    return;
  }
  await db.insert("providerConnections", {
    kind: "netlify",
    userId,
    auth: {
      method: "api_key",
      credential,
    },
    teamId,
    teamSlug: teamId,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertRailwayApiKey(
  db: DatabaseWriter,
  userId: Id<"users">,
  credential: string,
  accountId: string,
  email?: string,
  name?: string,
): Promise<void> {
  const existing = await getConnectionByUserAndKind(db, userId, "railway");
  const now = Date.now();
  if (existing) {
    await db.patch(existing._id, {
      auth: {
        method: "api_key",
        credential,
      },
      accountId,
      email,
      name,
      updatedAt: now,
    });
    return;
  }
  await db.insert("providerConnections", {
    kind: "railway",
    userId,
    auth: {
      method: "api_key",
      credential,
    },
    accountId,
    email,
    name,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertCloudflareApiKey(
  db: DatabaseWriter,
  userId: Id<"users">,
  credential: string,
): Promise<void> {
  const existing = await getConnectionByUserAndKind(db, userId, "cloudflare");
  const now = Date.now();
  if (existing) {
    await db.patch(existing._id, {
      auth: {
        method: "api_key",
        credential,
      },
      accountId: undefined,
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
    accountId: undefined,
    createdAt: now,
    updatedAt: now,
  });
}

const seedProviderConnectionsArgs = object({
  email: string(),
  githubApiKey: optional(string()),
  convexManagementApiKey: optional(string()),
  convexTeamId: optional(string()),
  netlifyApiKey: optional(string()),
  netlifyTeamId: optional(string()),
  railwayApiKey: optional(string()),
  railwayAccountId: optional(string()),
  railwayEmail: optional(string()),
  railwayName: optional(string()),
  cloudflareApiKey: optional(string()),
});
type SeedProviderConnectionsArgs = Infer<typeof seedProviderConnectionsArgs>;

export const seedProviderConnectionsForEmail = internalMutation({
  args: seedProviderConnectionsArgs,
  returns: vNull(),
  handler: async (ctx, args) => {
    const normalizedEmail = normalizeEmail(args.email);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalizedEmail))
      .first();
    if (!user) {
      return null;
    }

    if (args.githubApiKey) {
      await upsertGithubApiKey(ctx.db, user._id, args.githubApiKey);
    }

    if (args.convexManagementApiKey || args.convexTeamId) {
      if (!args.convexManagementApiKey || !args.convexTeamId) {
        throw new Error(
          "Both DEV_SEED_CONVEX_MANAGEMENT_API_KEY and DEV_SEED_CONVEX_TEAM_ID are required",
        );
      }
      await upsertConvexApiKey(
        ctx.db,
        user._id,
        args.convexManagementApiKey,
        args.convexTeamId,
      );
    }

    if (args.netlifyApiKey || args.netlifyTeamId) {
      if (!args.netlifyApiKey || !args.netlifyTeamId) {
        throw new Error(
          "Both DEV_SEED_NETLIFY_API_KEY and DEV_SEED_NETLIFY_TEAM_ID are required",
        );
      }
      await upsertNetlifyApiKey(
        ctx.db,
        user._id,
        args.netlifyApiKey,
        args.netlifyTeamId,
      );
    }

    if (
      args.railwayApiKey ||
      args.railwayAccountId ||
      args.railwayEmail ||
      args.railwayName
    ) {
      if (!args.railwayApiKey || !args.railwayAccountId) {
        throw new Error(
          "Railway API key and account ID must be provided together",
        );
      }
      await upsertRailwayApiKey(
        ctx.db,
        user._id,
        args.railwayApiKey,
        args.railwayAccountId,
        args.railwayEmail,
        args.railwayName,
      );
    }

    if (args.cloudflareApiKey) {
      await upsertCloudflareApiKey(ctx.db, user._id, args.cloudflareApiKey);
    }

    return null;
  },
});

export const seedPasswordAccount = internalAction({
  args: {},
  returns: object({
    email: string(),
    created: boolean(),
  }),
  handler: async (ctx) => {
    const email = normalizeEmail(DEV_SEED_EMAIL);
    const password = DEV_SEED_PASSWORD;
    const githubApiKey = readSeedValue("DEV_SEED_GITHUB_API_KEY");
    const convexManagementApiKey = readSeedValue(
      "DEV_SEED_CONVEX_MANAGEMENT_API_KEY",
    );
    const convexTeamId = readSeedValue("DEV_SEED_CONVEX_TEAM_ID");
    const netlifyApiKey = readSeedValue("DEV_SEED_NETLIFY_API_KEY");
    const netlifyTeamId = readSeedValue("DEV_SEED_NETLIFY_TEAM_ID");
    const railwayApiKey = readSeedValue("DEV_SEED_RAILWAY_API_KEY");
    const cloudflareApiKey = readSeedValue("DEV_SEED_CLOUDFLARE_API_KEY");
    const seedArgs: SeedProviderConnectionsArgs = { email };
    if (githubApiKey !== undefined) {
      seedArgs.githubApiKey = githubApiKey;
    }
    if (convexManagementApiKey !== undefined) {
      seedArgs.convexManagementApiKey = convexManagementApiKey;
    }
    if (convexTeamId !== undefined) {
      seedArgs.convexTeamId = convexTeamId;
    }
    if (netlifyApiKey !== undefined) {
      seedArgs.netlifyApiKey = netlifyApiKey;
    }
    if (netlifyTeamId !== undefined) {
      seedArgs.netlifyTeamId = netlifyTeamId;
    }
    if (railwayApiKey !== undefined) {
      try {
        const railwayProfile = await fetchRailwayConnectionDetails(
          railwayApiKey,
          {
            invalidApiKeyMessage: "Invalid DEV_SEED_RAILWAY_API_KEY",
            queryName: "RailwaySeedProfile",
          },
        );
        seedArgs.railwayApiKey = railwayApiKey;
        seedArgs.railwayAccountId = railwayProfile.accountId;
        if (railwayProfile.email !== undefined) {
          seedArgs.railwayEmail = railwayProfile.email;
        }
        if (railwayProfile.name !== undefined) {
          seedArgs.railwayName = railwayProfile.name;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("devAuth:seed:railway:skipped", { message });
      }
    }

    if (cloudflareApiKey !== undefined) {
      seedArgs.cloudflareApiKey = cloudflareApiKey;
    }

    if (!isAllowedEmail(email)) {
      throw new Error("Seed email is not allowlisted");
    }

    let created = false;
    try {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: {
          id: email,
          secret: password,
        },
      });
    } catch (error) {
      if (!isMissingPasswordAccountError(error)) {
        throw error;
      }
      await createAccount(ctx, {
        provider: "password",
        account: {
          id: email,
          secret: password,
        },
        profile: {
          email,
        },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: false,
      });
      created = true;
    }

    await ctx.runMutation(
      internal.devAuth.seedProviderConnectionsForEmail,
      seedArgs,
    );

    return { email, created };
  },
});
