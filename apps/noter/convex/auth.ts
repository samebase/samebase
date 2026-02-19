import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { isAdminUser, isAllowedEmail } from "./users";
import type { Doc } from "./_generated/dataModel";

type UserPatch = Partial<Doc<"users">>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

  if (isAdminUser(patch.githubUsername) || isAllowedEmail(patch.email)) {
    patch.isApproved = true;
  }

  return patch;
}

function readRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!isNonEmptyString(value)) {
    throw new Error(`Missing ${key}. Set ${key} in the environment.`);
  }
  return value;
}

const githubClientId = readRequiredEnv("AUTH_GITHUB_ID");
const githubClientSecret = readRequiredEnv("AUTH_GITHUB_SECRET");
const googleClientId = readRequiredEnv("AUTH_GOOGLE_ID");
const googleClientSecret = readRequiredEnv("AUTH_GOOGLE_SECRET");

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
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

      if (args.existingUserId) {
        await ctx.db.patch(args.existingUserId, patch);
        return args.existingUserId;
      }

      return await ctx.db.insert("users", patch);
    },
  },
});
