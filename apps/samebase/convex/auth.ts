import { setupGithub } from "@convex-dev/auth/methods/github/server";
import { setupGoogle } from "@convex-dev/auth/methods/google/server";
import { setupConvexAuth } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { normalizeAccountEmail } from "../shared/accountPresentation";
import { components, internal } from "./_generated/api";
import {
  assertPasswordAuthFlowAllowed,
  resolveDeploymentProfile,
  resolvePasswordAuthMode,
} from "./deploymentProfile";
import { mutation } from "./functions";
import { readPasswordAccount, writePasswordAccount } from "./identity/passwordAccounts";
import {
  requireUserCanSignIn,
  sendNewUserNotification,
  startCustomSignInSession,
  vTokenBundle,
} from "./identity/signIn";
import { readOptionalEnv } from "./oauthUtils";

const { literal, number, object, string, union } = v;

const auth = setupConvexAuth({ component: components.auth });
export const { signOut, refreshSession } = auth;

// OAuth sign-ins may return only to this deployment's app origins: SITE_URL, where the app runs,
// and CONVEX_SITE_URL, which serves the same build.
const allowedRedirectOrigins = [readOptionalEnv("SITE_URL"), readOptionalEnv("CONVEX_SITE_URL")]
  .filter((origin) => origin !== null)
  .map((origin) => new URL(origin).origin);

export const { startSignInWithGithub, completeSignInWithGithub } = setupGithub(auth, {
  component: components.authGithub,
  allowedRedirectOrigins,
}).attachUserCallbacks({
  createUser: internal.identity.signIn.createUser,
  onSignIn: internal.identity.signIn.onSignIn,
});

export const { startSignInWithGoogle, completeSignInWithGoogle } = setupGoogle(auth, {
  component: components.authGoogle,
  allowedRedirectOrigins,
}).attachUserCallbacks({
  createUser: internal.identity.signIn.createUser,
  onSignIn: internal.identity.signIn.onSignIn,
});

const vPasswordSignInResult = union(
  object({ status: literal("complete"), tokens: vTokenBundle }),
  object({
    status: literal("error"),
    userError: union(
      object({ error: literal("INVALID_CREDENTIALS") }),
      object({ error: literal("RATE_LIMITED"), retryAfterMs: number() }),
    ),
  }),
);

/**
Signs in to an existing password account. A wrong password returns an error result instead of
throwing, so the password component keeps the attempt in its per-user rate limit.
*/
export const signInWithPassword = mutation({
  access: "access_public",
  args: { email: string(), password: string() },
  returns: vPasswordSignInResult,
  handler: async (ctx, args) => {
    assertPasswordAuthFlowAllowed(resolvePasswordAuthMode(resolveDeploymentProfile()), "signIn");

    const account = await readPasswordAccount(ctx.db, normalizeAccountEmail(args.email));
    if (account === null) {
      return { status: "error" as const, userError: { error: "INVALID_CREDENTIALS" as const } };
    }
    const verification = await ctx.runMutation(components.authPassword.public.verifyPassword, {
      userId: account.userId,
      password: args.password,
    });
    if (!verification.success) {
      return {
        status: "error" as const,
        userError:
          verification.userError.error === "RATE_LIMITED"
            ? verification.userError
            : { error: "INVALID_CREDENTIALS" as const },
      };
    }

    requireUserCanSignIn(await ctx.db.get(account.userId));
    const tokens = await startCustomSignInSession(ctx, {
      providerName: "password",
      userId: account.userId,
    });
    return { status: "complete" as const, tokens };
  },
});

/** Creates a password account and signs in to it. Only local worktree backends allow it. */
export const signUpWithPassword = mutation({
  access: "access_public",
  args: { email: string(), password: string() },
  returns: object({ status: literal("complete"), tokens: vTokenBundle }),
  handler: async (ctx, args) => {
    assertPasswordAuthFlowAllowed(resolvePasswordAuthMode(resolveDeploymentProfile()), "signUp");

    const email = normalizeAccountEmail(args.email);
    const emailOwner = await ctx.db
      .query("users")
      .withIndex("email", (query) => query.eq("email", email))
      .first();
    if (emailOwner !== null) {
      throw new ConvexError("An account with this email already exists.");
    }

    const userId = await ctx.db.insert("users", { state: "active", email });
    await writePasswordAccount(ctx, { email, password: args.password, userId });
    await sendNewUserNotification(ctx, { email, name: undefined, providerId: "password", userId });
    const tokens = await startCustomSignInSession(ctx, { providerName: "password", userId });
    return { status: "complete" as const, tokens };
  },
});
