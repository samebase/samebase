import Google from "@auth/core/providers/google";
import GitHub from "@auth/core/providers/github";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { guard } from "@samebase/dependent/main";
import { buildAuthTokenProfileCustomClaims } from "../shared/authTokenClaims";
import { normalizeAccountEmail } from "../shared/accountPresentation";
import { internal } from "./_generated/api";
import { createOrUpdateSamebaseUser, requireAuthSessionUserCanSignIn } from "./authAccountLinking";
import {
  assertPasswordAuthFlowAllowed,
  assertPasswordAuthLogLevelAllowed,
  resolveDeploymentProfile,
  resolvePasswordAuthMode,
} from "./deploymentProfile";
import {
  fetchVerifiedGitHubOAuthProfile,
  GITHUB_SIGN_IN_AUTHORIZATION_PARAMS,
  readGitHubSignInProfile,
} from "./githubSignIn";
import { isAgentBrowserHandoffTokenValue, sha256Hex } from "./mcp/tokens";
import { readOptionalEnv } from "./oauthUtils";

const isNonEmptyString = guard<unknown, string>((value) =>
  typeof value === "string" && value.trim().length > 0 ? value : null,
);

const googleClientId = readOptionalEnv("AUTH_GOOGLE_ID");
const googleClientSecret = readOptionalEnv("AUTH_GOOGLE_SECRET");
const githubClientId = readOptionalEnv("AUTH_GITHUB_ID");
const githubClientSecret = readOptionalEnv("AUTH_GITHUB_SECRET");

if ((googleClientId === null) !== (googleClientSecret === null)) {
  throw new Error(
    `Missing required environment variable: ${
      googleClientId === null ? "AUTH_GOOGLE_ID" : "AUTH_GOOGLE_SECRET"
    }`,
  );
}
if ((githubClientId === null) !== (githubClientSecret === null)) {
  throw new Error(
    `Missing required environment variable: ${
      githubClientId === null ? "AUTH_GITHUB_ID" : "AUTH_GITHUB_SECRET"
    }`,
  );
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  jwt: {
    customClaims: async (ctx, { userId }) => {
      // Convex Auth types this callback with AnyDataModel, so validate before reading claims.
      const user: unknown = await ctx.db.get("users", userId);
      return buildAuthTokenProfileCustomClaims(user);
    },
  },
  providers: [
    ConvexCredentials({
      id: "agent-browser-handoff",
      authorize: async (params, ctx) => {
        const rawToken = params["token"];
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
          currentUserId: currentUserId ?? undefined,
          currentSessionId: currentSessionId ?? undefined,
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
    Password({
      profile: (params) => {
        assertPasswordAuthLogLevelAllowed(readOptionalEnv("AUTH_LOG_LEVEL"));
        const passwordAuthMode = resolvePasswordAuthMode(resolveDeploymentProfile());
        const rawFlow = params["flow"];
        if (!isNonEmptyString(rawFlow)) {
          throw new Error("Missing password authentication flow");
        }
        assertPasswordAuthFlowAllowed(passwordAuthMode, rawFlow);
        const rawEmail = params["email"];
        if (!isNonEmptyString(rawEmail)) {
          throw new Error("Missing `email` for password authentication");
        }
        return {
          email: normalizeAccountEmail(rawEmail),
        };
      },
    }),
    ...(googleClientId && googleClientSecret
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            allowDangerousEmailAccountLinking: false,
            authorization: {
              params: { prompt: "select_account" },
            },
            profile: (profile) => {
              if (!isNonEmptyString(profile.email)) {
                throw new Error("Google did not provide an email address.");
              }
              if (profile.email_verified !== true) {
                throw new Error("Google did not verify the email address.");
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
    ...(githubClientId && githubClientSecret
      ? [
          GitHub({
            clientId: githubClientId,
            clientSecret: githubClientSecret,
            allowDangerousEmailAccountLinking: false,
            authorization: {
              params: GITHUB_SIGN_IN_AUTHORIZATION_PARAMS,
            },
            userinfo: {
              url: "https://api.github.com/user",
              request: async (context: { tokens: { access_token?: string } }) => {
                const accessToken = context.tokens.access_token;
                if (!isNonEmptyString(accessToken)) {
                  throw new Error("GitHub did not provide an access token.");
                }
                return await fetchVerifiedGitHubOAuthProfile({ accessToken, fetch });
              },
            },
            profile: (profile) => {
              const githubProfile = readGitHubSignInProfile(profile);
              return {
                id: githubProfile.providerAccountId,
                name: githubProfile.name,
                email: githubProfile.email,
                image: githubProfile.image,
                emailVerified: true,
                githubLogin: githubProfile.login,
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
      requireAuthSessionUserCanSignIn(user);
    },
    createOrUpdateUser: createOrUpdateSamebaseUser,
  },
});
