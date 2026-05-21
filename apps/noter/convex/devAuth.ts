import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../../../runtime/localWorktreePasswordAuth";
import { internal } from "./_generated/api";
import { resolveDeploymentProfile, resolvePasswordAuthMode } from "./deploymentProfile";
import { internalAction, internalMutation, type DatabaseWriter } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getConnectionByUserAndKind } from "./providerConnections";
import { readOptionalEnv } from "./oauthUtils";

const { boolean, null: vNull, object, optional, string } = v;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isMissingPasswordAccountError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("does not exist") || error.message.includes("not found"))
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

function readRequiredPreviewSeedPasswordAccountConfig(): {
  email: string;
  password: string;
} {
  const previewEmail = readSeedValue("PREVIEW_SEED_AUTH_EMAIL");
  const previewPassword = readSeedValue("PREVIEW_SEED_AUTH_PASSWORD");
  if (previewEmail === undefined && previewPassword === undefined) {
    throw new Error("PREVIEW_SEED_AUTH_EMAIL and PREVIEW_SEED_AUTH_PASSWORD are required");
  }
  if (previewEmail === undefined || previewPassword === undefined) {
    throw new Error(
      previewEmail === undefined
        ? "PREVIEW_SEED_AUTH_EMAIL is required when PREVIEW_SEED_AUTH_PASSWORD is set"
        : "PREVIEW_SEED_AUTH_PASSWORD is required when PREVIEW_SEED_AUTH_EMAIL is set",
    );
  }
  return {
    email: normalizeEmail(previewEmail),
    password: previewPassword,
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
  const passwordAuthMode = resolvePasswordAuthMode(resolveDeploymentProfile());
  switch (passwordAuthMode) {
    case "local_worktree_seed":
      return {
        email: normalizeEmail(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL),
        password: LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
      };
    case "preview_seed":
      return readRequiredPreviewSeedPasswordAccountConfig();
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
  if (existing) {
    await db.patch(existing._id, {
      auth: {
        method: "api_key",
        credential,
      },
      ...(accountId ? { accountId } : {}),
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
    accountId,
    createdAt: now,
    updatedAt: now,
  });
}

const seedProviderConnectionsArgs = object({
  email: string(),
  githubApiKey: optional(string()),
  convexManagementApiKey: optional(string()),
  convexTeamId: optional(string()),
  convexTeamSlug: optional(string()),
  cloudflareApiKey: optional(string()),
  cloudflareAccountId: optional(string()),
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

    // Seeded preview/local password accounts must skip the waitlist gate so
    // operators do not need a parallel code-side allowlist for dev access.
    if (user.isApproved !== true) {
      await ctx.db.patch(user._id, { isApproved: true });
    }

    if (args.githubApiKey) {
      await upsertGithubApiKey(ctx.db, user._id, args.githubApiKey);
    }

    if (args.convexManagementApiKey || args.convexTeamId || args.convexTeamSlug) {
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
        args.convexTeamSlug,
      );
    }

    if (args.cloudflareApiKey || args.cloudflareAccountId) {
      if (!args.cloudflareApiKey) {
        throw new Error("Cloudflare API key must be provided when setting Cloudflare seed details");
      }
      await upsertCloudflareApiKey(
        ctx.db,
        user._id,
        args.cloudflareApiKey,
        args.cloudflareAccountId,
      );
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
    const { email, password } = readSeedPasswordAccountConfig();
    const githubApiKey = readSeedValue("DEV_SEED_GITHUB_API_KEY");
    const convexManagementApiKey = readSeedValue("DEV_SEED_CONVEX_MANAGEMENT_API_KEY");
    const convexTeamId = readSeedValue("DEV_SEED_CONVEX_TEAM_ID");
    const convexTeamSlug = readSeedValue("DEV_SEED_CONVEX_TEAM_SLUG");
    const cloudflareApiKey = readSeedValue("DEV_SEED_CLOUDFLARE_API_KEY");
    const cloudflareAccountId = readSeedValue("DEV_SEED_CLOUDFLARE_ACCOUNT_ID");
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

    await ctx.runMutation(internal.devAuth.seedProviderConnectionsForEmail, seedArgs);

    return { email, created };
  },
});
