import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { getAuthUserId } from "@convex-dev/auth/server";
import { convexAuth } from "@convex-dev/auth/server";
import { isAdminUser } from "./users";
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

  if (isAdminUser(patch.githubUsername)) {
    patch.isApproved = true;
  }

  return patch;
}

function readEnvAny(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (isNonEmptyString(value)) {
      return value;
    }
  }
  return undefined;
}

const githubClientId = readEnvAny([
  "GITHUB_CLIENT_ID",
  "GITHUB_ID",
  "AUTH_GITHUB_ID",
]);
const githubClientSecret = readEnvAny([
  "GITHUB_CLIENT_SECRET",
  "GITHUB_SECRET",
  "AUTH_GITHUB_SECRET",
]);
const googleClientId = readEnvAny([
  "GOOGLE_CLIENT_ID",
  "GOOGLE_ID",
  "AUTH_GOOGLE_ID",
]);
const googleClientSecret = readEnvAny([
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_SECRET",
  "AUTH_GOOGLE_SECRET",
]);

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
      const sessionUserId = await getAuthUserId(ctx);

      if (args.existingUserId) {
        await ctx.db.patch(args.existingUserId, patch);
        return args.existingUserId;
      }

      if (sessionUserId) {
        await ctx.db.patch(sessionUserId, patch);
        return sessionUserId;
      }

      return await ctx.db.insert("users", patch);
    },
  },
});
