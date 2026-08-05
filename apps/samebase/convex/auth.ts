import Google from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { guard } from "@samebase/dependent/main";
import { LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL } from "../../../runtime/localWorktreePasswordAuth";
import { buildAuthTokenProfileCustomClaims } from "../shared/authTokenClaims";
import { normalizeAccountEmail } from "../shared/accountPresentation";
import { internal } from "./_generated/api";
import {
  assertPasswordAuthFlowAllowed,
  assertPasswordAuthLogLevelAllowed,
  type PasswordAuthMode,
  resolveDeploymentProfile,
  resolvePasswordAuthMode,
} from "./deploymentProfile";
import { buildNewUserNotification } from "./newUserNotification";
import { isAgentBrowserHandoffTokenValue, sha256Hex } from "./mcp/tokens";
import { readOptionalEnv } from "./oauthUtils";

const isNonEmptyString = guard<unknown, string>((value) =>
  typeof value === "string" && value.trim().length > 0 ? value : null,
);

const isAuthSessionUser = guard<unknown, { accountDeletion?: unknown }>((value) =>
  typeof value === "object" && value !== null ? value : null,
);

function isDeletingAccountMarker(value: unknown) {
  return (
    typeof value === "object" && value !== null && "state" in value && value.state === "deleting"
  );
}

export function assertAuthSessionUserCanSignIn(user: unknown): void {
  if (!isAuthSessionUser(user)) {
    throw new Error("Account is unavailable.");
  }
  if (user.accountDeletion === undefined || isDeletingAccountMarker(user.accountDeletion)) {
    return;
  }
  throw new Error("Account deletion is already finalizing.");
}

const googleClientId = readOptionalEnv("AUTH_GOOGLE_ID");
const googleClientSecret = readOptionalEnv("AUTH_GOOGLE_SECRET");

function readSeededPasswordEmail(passwordAuthMode: PasswordAuthMode): string | null {
  switch (passwordAuthMode) {
    case "local_worktree_seed":
      return LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL;
    case "preview_seed":
      return readOptionalEnv("PREVIEW_SEED_AUTH_EMAIL");
    case "manual":
    case "off":
      return null;
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
    Password({
      profile: (params) => {
        assertPasswordAuthLogLevelAllowed(readOptionalEnv("AUTH_LOG_LEVEL"));
        const passwordAuthMode = resolvePasswordAuthMode(resolveDeploymentProfile());
        const rawFlow = params.flow;
        if (!isNonEmptyString(rawFlow)) {
          throw new Error("Missing password authentication flow");
        }
        assertPasswordAuthFlowAllowed(passwordAuthMode, rawFlow);
        const rawEmail = params.email;
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
      const user: unknown = await ctx.db.get("users", args.userId);
      assertAuthSessionUserCanSignIn(user);
      if (isAuthSessionUser(user) && isDeletingAccountMarker(user.accountDeletion)) {
        return;
      }
      const passwordAuthMode = resolvePasswordAuthMode(resolveDeploymentProfile());
      // Dashboard-created accounts must work before email delivery is configured.
      if (
        args.provider.id === "password" &&
        (passwordAuthMode === "manual" || passwordAuthMode === "off")
      ) {
        return;
      }
      const notification = buildNewUserNotification({
        existingUserId: args.existingUserId,
        profile: args.profile,
        providerId: args.provider.id,
        seededPasswordEmail: readSeededPasswordEmail(passwordAuthMode),
        userId: args.userId,
      });
      if (notification) {
        await ctx.scheduler.runAfter(0, internal.email.send, notification);
      }
    },
  },
});
