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
  if (!isAnonymousWorktreeDeployment()) {
    return;
  }

  const githubAccessToken =
    patch.githubAccessToken ?? existingUser?.githubAccessToken;
  if (!isNonEmptyString(githubAccessToken)) {
    const envApiKey = readOptionalEnv("DEV_SEED_GITHUB_API_KEY");
    if (envApiKey !== null) {
      patch.githubAccessToken = envApiKey;
    }
  }

  const convexAccessToken =
    patch.convexAccessToken ?? existingUser?.convexAccessToken;
  if (!isNonEmptyString(convexAccessToken)) {
    const envApiKey = readOptionalEnv("DEV_SEED_CONVEX_MANAGEMENT_API_KEY");
    if (envApiKey !== null) {
      patch.convexAccessToken = envApiKey;
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
    const envApiKey = readOptionalEnv("DEC_SEED_NETLIFY_API_KEY");
    if (envApiKey !== null) {
      patch.netlifyAccessToken = envApiKey;
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
