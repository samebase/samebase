import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { guard } from "@samebase/dependent/main";
import { buildAuthTokenProfileCustomClaims } from "../shared/authTokenClaims";
import { env, type DatabaseWriter } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  assertPasswordAuthFlowAllowed,
  assertProductionReviewPasswordEmailAllowed,
  resolveDeploymentProfile,
  resolvePasswordAuthMode,
} from "./deploymentProfile";
import {
  buildSeedCloudflareDefaultAccount,
  getConnectionByUserAndKind,
} from "./providerConnections";
import { readOptionalEnv } from "./oauthUtils";

type UserPatch = {
  name?: string;
  email?: string;
  image?: string;
  emailVerificationTime?: number;
  phoneVerificationTime?: number;
};

const isNonEmptyString = guard<unknown, string>((value) =>
  typeof value === "string" && value.trim().length > 0 ? value : null,
);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildUserPatch(profile: Record<string, unknown>): UserPatch {
  const patch: UserPatch = {};

  if (isNonEmptyString(profile.name)) {
    patch.name = profile.name;
  }
  if (isNonEmptyString(profile.email)) {
    patch.email = profile.email;
  }
  if (isNonEmptyString(profile.image)) {
    patch.image = profile.image;
  }

  if (profile.emailVerified === true) {
    patch.emailVerificationTime = Date.now();
  }
  if (profile.phoneVerified === true) {
    patch.phoneVerificationTime = Date.now();
  }

  return patch;
}

async function upsertSeedGithubConnection(db: DatabaseWriter, userId: Id<"users">): Promise<void> {
  const credential = readOptionalEnv("DEV_SEED_GITHUB_API_KEY");
  if (credential === null) {
    return;
  }
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

async function upsertSeedConvexConnection(db: DatabaseWriter, userId: Id<"users">): Promise<void> {
  const credential = readOptionalEnv("DEV_SEED_CONVEX_MANAGEMENT_API_KEY");
  const teamId = readOptionalEnv("DEV_SEED_CONVEX_TEAM_ID");
  const teamSlug = readOptionalEnv("DEV_SEED_CONVEX_TEAM_SLUG");
  if (credential === null || teamId === null) {
    return;
  }
  const existing = await getConnectionByUserAndKind(db, userId, "convex");
  const now = Date.now();
  if (existing) {
    await db.patch(existing._id, {
      auth: {
        method: "api_key",
        credential,
      },
      teamId,
      teamSlug: teamSlug ?? undefined,
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
    ...(teamSlug !== null ? { teamSlug } : {}),
    createdAt: now,
    updatedAt: now,
  } as const;
  await db.insert("providerConnections", connection);
}

async function upsertSeedCloudflareConnection(
  db: DatabaseWriter,
  userId: Id<"users">,
): Promise<void> {
  const credential = readOptionalEnv("DEV_SEED_CLOUDFLARE_API_KEY");
  if (credential === null) {
    return;
  }
  const accountId = readOptionalEnv("DEV_SEED_CLOUDFLARE_ACCOUNT_ID");
  const existing = await getConnectionByUserAndKind(db, userId, "cloudflare");
  const now = Date.now();
  const defaultAccount = buildSeedCloudflareDefaultAccount(accountId);
  if (existing) {
    await db.patch(existing._id, {
      auth: {
        method: "api_key",
        credential,
      },
      ...(accountId ? { defaultAccount } : {}),
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

async function applyAutoSeedProviderKeys(db: DatabaseWriter, userId: Id<"users">) {
  const deploymentProfile = resolveDeploymentProfile();
  if (deploymentProfile.kind !== "local_worktree" && deploymentProfile.kind !== "preview") {
    return;
  }
  await upsertSeedGithubConnection(db, userId);
  await upsertSeedConvexConnection(db, userId);
  await upsertSeedCloudflareConnection(db, userId);
}

const googleClientId = readOptionalEnv("AUTH_GOOGLE_ID");
const googleClientSecret = readOptionalEnv("AUTH_GOOGLE_SECRET");
const passwordAuthMode = resolvePasswordAuthMode(resolveDeploymentProfile());
const passwordAuthEnabled = passwordAuthMode !== "off";
if ((googleClientId === null) !== (googleClientSecret === null)) {
  throw new Error(
    `Missing required environment variable: ${
      googleClientId === null ? "AUTH_GOOGLE_ID" : "AUTH_GOOGLE_SECRET"
    }`,
  );
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  jwt: {
    customClaims: async (ctx, { userId }) => {
      // Convex Auth types this callback with AnyDataModel, so validate before reading claims.
      const user: unknown = await ctx.db.get("users", userId);
      const authProvider = await ctx.runQuery(internal.users.getPrimaryAuthProviderForToken, {
        userId,
      });
      return buildAuthTokenProfileCustomClaims(user, authProvider);
    },
  },
  providers: [
    ...(passwordAuthEnabled
      ? [
          Password({
            profile: (params) => {
              if (params.flow === "signIn" || params.flow === "signUp") {
                assertPasswordAuthFlowAllowed(passwordAuthMode, params.flow);
              }
              const rawEmail = params.email;
              if (!isNonEmptyString(rawEmail)) {
                throw new Error("Missing `email` for password authentication");
              }
              const email = normalizeEmail(rawEmail);
              assertProductionReviewPasswordEmailAllowed({
                email,
                passwordAuthMode,
                reviewEmail: env.OPENAI_REVIEW_AUTH_EMAIL,
              });
              return {
                email,
              };
            },
          }),
        ]
      : []),
    ...(googleClientId && googleClientSecret
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            profile: (profile) => ({
              id: profile.sub,
              name: profile.name,
              email: profile.email,
              image: profile.picture,
              emailVerified: profile.email_verified,
            }),
          }),
        ]
      : []),
  ],

  callbacks: {
    createOrUpdateUser: async (ctx, args) => {
      const patch = buildUserPatch(args.profile);

      // Always persist the auth user row first so invite access can be driven
      // from `users.isApproved` instead of a hardcoded email list.
      const userId = args.existingUserId
        ? args.existingUserId
        : await ctx.db.insert("users", patch);

      if (args.existingUserId) {
        await ctx.db.patch(args.existingUserId, patch);
      }

      await applyAutoSeedProviderKeys(ctx.db, userId);
      return userId;
    },
  },
});
