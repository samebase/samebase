import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { DatabaseReader, DatabaseWriter } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getConnectionByUserAndKind } from "./providerConnections";
import { isRecord, readString } from "./jsonUtils";
import { isAllowedEmail } from "./users";
import { readOptionalEnv, readRequiredEnv } from "./oauthUtils";

type UserPatch = {
  name?: string;
  email?: string;
  image?: string;
  emailVerificationTime?: number;
  phoneVerificationTime?: number;
  isApproved?: boolean;
};

const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
const RAILWAY_GRAPHQL_URL = "https://backboard.railway.com/graphql/v2";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Provider request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRailwayConnectionDetails(token: string): Promise<{
  accountId: string;
  email?: string;
  name?: string;
}> {
  const response = await fetchWithTimeout(RAILWAY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "query RailwaySeedProfile { me { id email name } }",
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload)) {
    throw new Error("Invalid DEV_SEED_RAILWAY_API_KEY");
  }
  const graphQlErrors = payload["errors"];
  if (Array.isArray(graphQlErrors) && graphQlErrors.length > 0) {
    throw new Error("Invalid DEV_SEED_RAILWAY_API_KEY");
  }
  const data = payload["data"];
  if (!isRecord(data)) {
    throw new Error("Railway API key response is missing data");
  }
  const me = data["me"];
  if (!isRecord(me)) {
    throw new Error("Railway API key response is missing user profile");
  }
  const accountId = readString(me, "id");
  if (!accountId) {
    throw new Error("Railway API key response is missing account ID");
  }
  return {
    accountId,
    email: readString(me, "email"),
    name: readString(me, "name"),
  };
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

async function upsertSeedNetlifyConnection(
  db: DatabaseWriter,
  userId: Id<"users">,
): Promise<void> {
  const credential = readOptionalEnv("DEV_SEED_NETLIFY_API_KEY");
  const teamId = readOptionalEnv("DEV_SEED_NETLIFY_TEAM_ID");
  if (credential === null || teamId === null) {
    return;
  }
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

async function upsertSeedRailwayConnection(
  db: DatabaseWriter,
  userId: Id<"users">,
): Promise<void> {
  const credential = readOptionalEnv("DEV_SEED_RAILWAY_API_KEY");
  if (credential === null) {
    return;
  }

  let details: {
    accountId: string;
    email?: string;
    name?: string;
  };
  try {
    details = await fetchRailwayConnectionDetails(credential);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("auth:seed:railway:skipped", { message });
    return;
  }

  const existing = await getConnectionByUserAndKind(db, userId, "railway");
  const now = Date.now();
  if (existing) {
    await db.patch(existing._id, {
      auth: {
        method: "api_key",
        credential,
      },
      accountId: details.accountId,
      email: details.email,
      name: details.name,
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
    accountId: details.accountId,
    email: details.email,
    name: details.name,
    createdAt: now,
    updatedAt: now,
  });
}

async function applyAutoSeedProviderKeys(
  db: DatabaseWriter,
  userId: Id<"users">,
) {
  if (!isAnonymousWorktreeDeployment()) {
    return;
  }
  await upsertSeedGithubConnection(db, userId);
  await upsertSeedConvexConnection(db, userId);
  await upsertSeedNetlifyConnection(db, userId);
  await upsertSeedRailwayConnection(db, userId);
}

const googleClientId = readOptionalEnv("AUTH_GOOGLE_ID");
const googleClientSecret = readOptionalEnv("AUTH_GOOGLE_SECRET");
const passwordAuthEnabled = isDevelopmentDeployment();
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
