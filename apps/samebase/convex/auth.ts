import Google from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { guard } from "@samebase/dependent/main";
import { LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL } from "../../../runtime/localWorktreePasswordAuth";
import { buildAuthTokenProfileCustomClaims } from "../shared/authTokenClaims";
import { normalizeAccountEmail } from "../shared/accountPresentation";
import { env, type DatabaseWriter } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  assertPasswordAuthFlowAllowed,
  assertProductionReviewPasswordEmailAllowed,
  resolveDeploymentProfile,
  resolvePasswordAuthMode,
} from "./deploymentProfile";
import { buildNewUserNotification } from "./newUserNotification";
import { isAgentBrowserHandoffTokenValue, sha256Hex } from "./mcp/tokens";
import {
  buildSeedCloudflareDefaultAccount,
  getConnectionByUserAndKind,
} from "./providerConnections";
import { readOptionalEnv } from "./oauthUtils";

const isNonEmptyString = guard<unknown, string>((value) =>
  typeof value === "string" && value.trim().length > 0 ? value : null,
);

const isAuthSessionUser = guard<unknown, { accountDeletion?: unknown }>((value) =>
  typeof value === "object" && value !== null ? value : null,
);

export function assertAuthSessionUserCanSignIn(user: unknown): void {
  if (!isAuthSessionUser(user)) {
    throw new Error("Account is unavailable.");
  }
  if (user.accountDeletion !== undefined) {
    throw new Error("Account deletion is already in progress.");
  }
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

function readSeededPasswordEmail(): string | null {
  switch (passwordAuthMode) {
    case "off":
      return null;
    case "local_worktree_seed":
      return LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL;
    case "preview_seed":
      return readOptionalEnv("PREVIEW_SEED_AUTH_EMAIL");
    case "production_review_seed":
      return env.OPENAI_REVIEW_AUTH_EMAIL ?? null;
    default:
      passwordAuthMode satisfies never;
      return null;
  }
}

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
    ConvexCredentials({
      id: "agent-browser-handoff",
      authorize: async (params, ctx) => {
        const rawToken = params.token;
        if (!isNonEmptyString(rawToken) || !isAgentBrowserHandoffTokenValue(rawToken)) {
          throw new Error("Browser handoff is invalid or no longer available.");
        }

        const [currentUserId, currentSessionId] = await Promise.all([
          getAuthUserId(ctx),
          getAuthSessionId(ctx),
        ]);
        const result = await ctx.runMutation(internal.agentBrowserHandoff.redeemForAuth, {
          tokenHash: await sha256Hex(rawToken),
          now: Date.now(),
          ...(currentUserId !== null ? { currentUserId } : {}),
          ...(currentSessionId !== null ? { currentSessionId } : {}),
        });
        if (!result.ok) {
          throw new Error("Browser handoff is invalid or no longer available.");
        }

        return {
          userId: result.userId,
          ...(result.sessionId !== undefined ? { sessionId: result.sessionId } : {}),
        };
      },
    }),
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
              const email = normalizeAccountEmail(rawEmail);
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
            profile: (profile) => {
              if (!isNonEmptyString(profile.email)) {
                throw new Error("Google did not provide an email address.");
              }
              return {
                id: profile.sub,
                name: profile.name,
                email: normalizeAccountEmail(profile.email),
                image: profile.picture,
                emailVerified: profile.email_verified,
              };
            },
          }),
        ]
      : []),
  ],

  callbacks: {
    beforeSessionCreation: async (ctx, { userId }) => {
      // Convex Auth exposes AnyDataModel here, so the database result must be
      // validated before reading Samebase-owned fields.
      const user: unknown = await ctx.db.get("users", userId);
      assertAuthSessionUserCanSignIn(user);
    },
    afterUserCreatedOrUpdated: async (ctx, args) => {
      await applyAutoSeedProviderKeys(ctx.db, args.userId);
      const notification = buildNewUserNotification({
        existingUserId: args.existingUserId,
        profile: args.profile,
        providerId: args.provider.id,
        seededPasswordEmail: readSeededPasswordEmail(),
        userId: args.userId,
      });
      if (notification) {
        await ctx.scheduler.runAfter(0, internal.email.send, notification);
      }
    },
  },
});
