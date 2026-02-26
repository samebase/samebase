import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { isAdminUser, isAllowedEmail } from "./users";
import type { Doc } from "./_generated/dataModel";
import { readOptionalEnv, readRequiredEnv } from "./oauthUtils";

type UserPatch = Partial<Doc<"users">>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFlagEnabled(key: string): boolean {
  const value = readOptionalEnv(key);
  return value !== null && value.toLowerCase() === "true";
}

function isDevelopmentDeployment(): boolean {
  const deployment = readOptionalEnv("CONVEX_DEPLOYMENT");
  return deployment !== null && deployment.startsWith("dev:");
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

  if (isNonEmptyString(profile.githubUsername)) {
    patch.githubUsername = profile.githubUsername;
  }
  if (isNonEmptyString(profile.githubAccessToken)) {
    patch.githubAccessToken = profile.githubAccessToken;
  }
  if (isNonEmptyString(profile.githubRefreshToken)) {
    patch.githubRefreshToken = profile.githubRefreshToken;
  }
  if (isNumber(profile.githubExpiresAt)) {
    patch.githubExpiresAt = profile.githubExpiresAt;
  }

  if (profile.emailVerified === true) {
    patch.emailVerificationTime = Date.now();
  }
  if (profile.phoneVerified === true) {
    patch.phoneVerificationTime = Date.now();
  }

  if (isSignInAllowed(patch.githubUsername, patch.email)) {
    patch.isApproved = true;
  }

  return patch;
}

function isSignInAllowed(
  githubUsername: string | null | undefined,
  email: string | null | undefined,
): boolean {
  return isAdminUser(githubUsername, email) || isAllowedEmail(email);
}

function applyAutoSeedProviderKeys(
  patch: UserPatch,
  existingUser: Doc<"users"> | null,
) {
  if (!isFlagEnabled("AUTH_AUTO_SEED_PROVIDER_KEYS")) {
    return;
  }

  const githubAccessToken =
    patch.githubAccessToken ?? existingUser?.githubAccessToken;
  if (!isNonEmptyString(githubAccessToken)) {
    const envToken = readOptionalEnv("GITHUB_TOKEN");
    if (envToken !== null) {
      patch.githubAccessToken = envToken;
    }
  }

  const convexAccessToken =
    patch.convexAccessToken ?? existingUser?.convexAccessToken;
  if (!isNonEmptyString(convexAccessToken)) {
    const envToken = readOptionalEnv("CONVEX_MANAGEMENT_TOKEN");
    if (envToken !== null) {
      patch.convexAccessToken = envToken;
    }
  }
  const convexTeamId = patch.convexTeamId ?? existingUser?.convexTeamId;
  if (!isNonEmptyString(convexTeamId)) {
    const envTeamId = readOptionalEnv("CONVEX_TEAM_ID");
    if (envTeamId !== null) {
      patch.convexTeamId = envTeamId;
    }
  }

  const netlifyAccessToken =
    patch.netlifyAccessToken ?? existingUser?.netlifyAccessToken;
  if (!isNonEmptyString(netlifyAccessToken)) {
    const envToken = readOptionalEnv("NETLIFY_ACCESS_TOKEN");
    if (envToken !== null) {
      patch.netlifyAccessToken = envToken;
    }
  }
  const netlifyTeamId = patch.netlifyTeamId ?? existingUser?.netlifyTeamId;
  if (!isNonEmptyString(netlifyTeamId)) {
    const envTeamId = readOptionalEnv("NETLIFY_TEAM_ID");
    if (envTeamId !== null) {
      patch.netlifyTeamId = envTeamId;
    }
  }
}

const githubClientId = readRequiredEnv("AUTH_GITHUB_ID");
const githubClientSecret = readRequiredEnv("AUTH_GITHUB_SECRET");
const googleClientId = readOptionalEnv("AUTH_GOOGLE_ID");
const googleClientSecret = readOptionalEnv("AUTH_GOOGLE_SECRET");
const passwordAuthEnabled =
  isDevelopmentDeployment() || isFlagEnabled("AUTH_ENABLE_PASSWORD");
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
    GitHub({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      authorization: {
        params: {
          scope: "repo delete_repo user user:email codespace read:packages",
        },
      },

      profile: (profile, tokens) => {
        return {
          id: profile.id.toString(),
          // login: profile.login,
          name: profile.name,
          email: profile.email,
          image: profile.avatar_url,

          githubUsername: profile.login,
          githubAccessToken: tokens.access_token,
          githubRefreshToken: tokens.refresh_token,
          githubExpiresAt: tokens.expires_at,
        };
      },
    }),
  ],

  callbacks: {
    createOrUpdateUser: async (ctx, args) => {
      const patch = buildUserPatch(args.profile);
      const existingUser = args.existingUserId
        ? await ctx.db.get(args.existingUserId)
        : null;

      let githubUsernameForAccessCheck = patch.githubUsername;
      let emailForAccessCheck = patch.email;

      if (existingUser) {
        if (!githubUsernameForAccessCheck) {
          githubUsernameForAccessCheck = existingUser.githubUsername;
        }
        if (!emailForAccessCheck) {
          emailForAccessCheck = existingUser.email;
        }
      }

      if (!isSignInAllowed(githubUsernameForAccessCheck, emailForAccessCheck)) {
        throw new Error("Access denied: account is not allowlisted");
      }

      applyAutoSeedProviderKeys(patch, existingUser);

      if (args.existingUserId) {
        await ctx.db.patch(args.existingUserId, patch);
        return args.existingUserId;
      }

      return await ctx.db.insert("users", patch);
    },
  },
});
