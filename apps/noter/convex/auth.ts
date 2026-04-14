import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { DatabaseWriter } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getConnectionByUserAndKind } from "./providerConnections";
import { isAllowedEmail } from "./users";
import { readOptionalEnv } from "./oauthUtils";

type UserPatch = {
  name?: string;
  email?: string;
  image?: string;
  emailVerificationTime?: number;
  phoneVerificationTime?: number;
  isApproved?: boolean;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLocalhostUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function isLocalConvexDeployment(): boolean {
  const cloudUrl = readOptionalEnv("CONVEX_CLOUD_URL");
  if (cloudUrl !== null && isLocalhostUrl(cloudUrl)) {
    return true;
  }
  const siteUrl = readOptionalEnv("CONVEX_SITE_URL");
  return siteUrl !== null && isLocalhostUrl(siteUrl);
}

function readDeploymentName(rawDeployment: string): string | null {
  const [_, ...rest] = rawDeployment.split(":");
  if (rest.length === 0) {
    return null;
  }
  const deploymentName = rest.join(":").trim();
  return deploymentName.length > 0 ? deploymentName : null;
}

function isDevelopmentDeployment(): boolean {
  const deployment = readOptionalEnv("CONVEX_DEPLOYMENT");
  if (deployment !== null) {
    return deployment.startsWith("dev:");
  }

  const daytonaDeployKey = readOptionalEnv("DAYTONA_CONVEX_DEPLOY_KEY");
  if (daytonaDeployKey !== null) {
    const [daytonaDeployment] = daytonaDeployKey.split("|", 1);
    return daytonaDeployment.startsWith("dev:");
  }

  const siteUrl = readOptionalEnv("SITE_URL");
  return siteUrl !== null && siteUrl.includes("localhost");
}

function isAnonymousWorktreeDeployment(): boolean {
  const deployment = readOptionalEnv("CONVEX_DEPLOYMENT");
  if (deployment !== null) {
    const deploymentName = readDeploymentName(deployment);
    return (
      deploymentName !== null &&
      (deploymentName.startsWith("anonymous-") ||
        deploymentName.startsWith("local-"))
    );
  }

  const daytonaDeployKey = readOptionalEnv("DAYTONA_CONVEX_DEPLOY_KEY");
  if (daytonaDeployKey === null) {
    return false;
  }
  const [daytonaDeployment] = daytonaDeployKey.split("|", 1);
  const deploymentName = readDeploymentName(daytonaDeployment);
  return (
    deploymentName !== null &&
    (deploymentName.startsWith("anonymous-") ||
      deploymentName.startsWith("local-"))
  );
}

function hasAnySeedProviderCredential(): boolean {
  return (
    readOptionalEnv("DEV_SEED_GITHUB_API_KEY") !== null ||
    readOptionalEnv("DEV_SEED_CONVEX_MANAGEMENT_API_KEY") !== null ||
    readOptionalEnv("DEV_SEED_CLOUDFLARE_API_KEY") !== null
  );
}

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

  if (isSignInAllowed(patch.email)) {
    patch.isApproved = true;
  }

  return patch;
}

function isSignInAllowed(email: string | null | undefined): boolean {
  return isAllowedEmail(email);
}

async function upsertSeedGithubConnection(
  db: DatabaseWriter,
  userId: Id<"users">,
): Promise<void> {
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

async function upsertSeedConvexConnection(
  db: DatabaseWriter,
  userId: Id<"users">,
): Promise<void> {
  const credential = readOptionalEnv("DEV_SEED_CONVEX_MANAGEMENT_API_KEY");
  const teamId = readOptionalEnv("DEV_SEED_CONVEX_TEAM_ID");
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

async function upsertSeedCloudflareConnection(
  db: DatabaseWriter,
  userId: Id<"users">,
): Promise<void> {
  const credential = readOptionalEnv("DEV_SEED_CLOUDFLARE_API_KEY");
  if (credential === null) {
    return;
  }
  const seededAccountId = readOptionalEnv("DEV_SEED_CLOUDFLARE_ACCOUNT_ID");
  const existing = await getConnectionByUserAndKind(db, userId, "cloudflare");
  const now = Date.now();
  if (existing) {
    await db.patch(existing._id, {
      auth: {
        method: "api_key",
        credential,
      },
      ...(seededAccountId ? { accountId: seededAccountId } : {}),
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
    ...(seededAccountId ? { accountId: seededAccountId } : {}),
    createdAt: now,
    updatedAt: now,
  });
}

async function applyAutoSeedProviderKeys(
  db: DatabaseWriter,
  userId: Id<"users">,
) {
  // Preview deployments no longer create a password account during
  // `convex deploy --preview-create ...`; instead we attach any configured seed
  // provider connections the first time an allowlisted user actually signs in.
  if (!isAnonymousWorktreeDeployment() && !hasAnySeedProviderCredential()) {
    return;
  }
  await upsertSeedGithubConnection(db, userId);
  await upsertSeedConvexConnection(db, userId);
  await upsertSeedCloudflareConnection(db, userId);
}

const googleClientId = readOptionalEnv("AUTH_GOOGLE_ID");
const googleClientSecret = readOptionalEnv("AUTH_GOOGLE_SECRET");
const passwordAuthEnabled =
  isLocalConvexDeployment() ||
  isDevelopmentDeployment() ||
  isAnonymousWorktreeDeployment();
if ((googleClientId === null) !== (googleClientSecret === null)) {
  throw new Error(
    `Missing required environment variable: ${
      googleClientId === null ? "AUTH_GOOGLE_ID" : "AUTH_GOOGLE_SECRET"
    }`,
  );
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ...(passwordAuthEnabled
      ? [
          Password({
            profile: (params) => {
              const rawEmail = params.email;
              if (!isNonEmptyString(rawEmail)) {
                throw new Error("Missing `email` for password authentication");
              }
              return {
                email: normalizeEmail(rawEmail),
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
      const existingUser = args.existingUserId
        ? await ctx.db.get(args.existingUserId)
        : null;

      const emailForAccessCheck = patch.email ?? existingUser?.email;
      if (!isSignInAllowed(emailForAccessCheck)) {
        throw new Error("Access denied: account is not allowlisted");
      }

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
