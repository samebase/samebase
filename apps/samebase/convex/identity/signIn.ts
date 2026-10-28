import { parse } from "convex-helpers/validators";
import { createFunctionHandle } from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";

import { components, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { env, internalMutation, type MutationCtx } from "../_generated/server";
import { LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL } from "../../../../runtime/localWorktreePasswordAuth";
import { normalizeAccountEmail } from "../../shared/accountPresentation";
import {
  type PasswordAuthMode,
  resolveDeploymentProfile,
  resolvePasswordAuthMode,
} from "../deploymentProfile";
import { readOptionalEnv } from "../oauthUtils";
import { type AuthAccountProvider, vAuthAccountProvider } from "./accountModel";
import { readNonDeletedUser } from "./lifecycle";
import { buildNewUserNotification } from "./newUserNotification";

const { boolean, id, literal, null: vNull, number, object, optional, string, union } = v;

/**
The id_token claims of the identity hub that a sign-in reads. `sub` is pairwise: stable for
Samebase, different in every other app of the hub, and different for each connector.
`connector_account_id` is the connector's own account id: GitHub's numeric user id as a string, or
Google's `sub`. Convex Auth checks the issuer, audience, and expiry of the id_token, which it
received over TLS from the hub's token endpoint, but not the types of its claims, so `parse` checks
them and drops the other claims.
*/
const vHubClaims = object({
  sub: string(),
  connector: vAuthAccountProvider,
  connector_account_id: string(),
  email: optional(string()),
  email_verified: optional(boolean()),
  name: optional(string()),
  picture: optional(string()),
});

/**
The profile mapping of the hub methods in convex/auth.ts. The callbacks below find existing users by
the email, so only an address that the hub verified counts.
*/
export function readHubProfile(claims: unknown) {
  const { sub, email, email_verified, ...profile } = parse(vHubClaims, claims);
  return {
    id: sub,
    ...profile,
    ...(email_verified === true && email !== undefined ? { email } : {}),
  };
}

/**
The sign-ins that the `hub-github` and `hub-google` methods of convex/auth.ts hand to the user
callbacks, with the profile of `readHubProfile`. `accountId` and `profile.id` are the hub's pairwise
subject. The connector and its own account id are the provider and the account id of the
`authAccounts` key.
*/
const vHubSignInProvider = object({
  name: union(literal("hub-github"), literal("hub-google")),
  accountId: string(),
  profile: vHubClaims.omit("sub", "email_verified").extend({ id: string() }),
});
type HubSignInProvider = Infer<typeof vHubSignInProvider>;

/**
The session the core mints for a sign-in. The core declares no validator for it, so the custom
sign-in methods declare their results with this one.
*/
export const vTokenBundle = object({
  accessToken: string(),
  accessTokenExpiresAt: number(),
  refreshToken: string(),
  refreshTokenExpiresAt: number(),
  userId: string(),
});

type TokenBundle = Infer<typeof vTokenBundle>;

/** The core account names of the sign-in methods that Samebase builds on the core API. */
const vCustomSignInProviderName = union(literal("password"), literal("agentBrowserHandoff"));
type CustomSignInProviderName = Infer<typeof vCustomSignInProviderName>;

function readProviderLabel(provider: AuthAccountProvider): "Google" | "GitHub" {
  return provider === "google" ? "Google" : "GitHub";
}

/**
Reads the identity that a hub sign-in may use. The hub must attest a verified email: Samebase
matches existing accounts by it and stores it as the account email of a new user.
*/
function readHubIdentity(provider: HubSignInProvider) {
  const { connector, connector_account_id, email, name, picture } = provider.profile;
  if (email === undefined) {
    throw new ConvexError(
      `${readProviderLabel(connector)} did not provide a verified email address.`,
    );
  }
  return {
    provider: connector,
    providerAccountId: connector_account_id,
    email: normalizeAccountEmail(email),
    name,
    image: picture,
  };
}

/** Every new session is for an active user: deleting and deleted users cannot sign in. */
export function requireUserCanSignIn(user: Doc<"users"> | null): Doc<"users"> {
  if (user === null) {
    throw new ConvexError("Account is unavailable.");
  }
  switch (user.state) {
    case "active":
      return user;
    case "deleting":
      throw new ConvexError("Account deletion is in progress.");
    case "deleted":
      throw new ConvexError("Account is unavailable.");
    default:
      user satisfies never;
      throw new ConvexError("Account is unavailable.");
  }
}

function readSeededPasswordEmail(passwordAuthMode: PasswordAuthMode): string | null {
  switch (passwordAuthMode) {
    case "local_worktree_seed":
      return LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL;
    case "preview_seed":
      return readOptionalEnv("DEV_SEED_AUTH_EMAIL");
    case "manual":
    case "off":
      return null;
    default:
      passwordAuthMode satisfies never;
      return null;
  }
}

export async function sendNewUserNotification(
  ctx: MutationCtx,
  args: {
    email: string;
    name: string | undefined;
    providerId: string;
    userId: Id<"users">;
  },
) {
  const passwordAuthMode = resolvePasswordAuthMode(resolveDeploymentProfile());
  if (
    args.providerId === "password" &&
    (passwordAuthMode === "manual" || passwordAuthMode === "off")
  ) {
    return;
  }
  const notification = buildNewUserNotification({
    existingUserId: null,
    profile: { email: args.email, ...(args.name === undefined ? {} : { name: args.name }) },
    providerId: args.providerId,
    seededPasswordEmail: readSeededPasswordEmail(passwordAuthMode),
    userId: args.userId,
  });
  if (notification) {
    await ctx.scheduler.runAfter(0, internal.email.send, {
      to: notification.to,
      subject: notification.subject,
      text: notification.text,
    });
  }
}

/** One Samebase GitHub sign-in identity and one GitHub App user authorization use one GitHub user. */
async function assertGitHubAccessIdentity(
  ctx: MutationCtx,
  userId: Id<"users">,
  githubUserId: string,
) {
  const githubOwners = await ctx.db
    .query("githubUserAuthorizations")
    .withIndex("by_github_user", (query) => query.eq("githubUserId", githubUserId))
    .take(2);
  if (githubOwners.length > 1) {
    throw new Error("This GitHub account has conflicting Samebase access records.");
  }
  const githubOwner = githubOwners.at(0);
  if (githubOwner !== undefined && githubOwner.userId !== userId) {
    throw new ConvexError(
      "This GitHub account already provides access for another Samebase account.",
    );
  }

  const authorization = await ctx.db
    .query("githubUserAuthorizations")
    .withIndex("by_user", (query) => query.eq("userId", userId))
    .unique();
  if (authorization !== null && authorization.githubUserId !== githubUserId) {
    throw new ConvexError(
      "This Samebase account already uses a different GitHub account for access.",
    );
  }
}

/**
Called by the hub methods the first time the core sees a hub subject. The user is the one that
`authAccounts` already maps the connector's account to (every identity from before the hub), else
the user whose verified account email is the hub's verified email, else a new user. The core then
keeps the subject for that user, so a later sign-in finds it directly. `onSignIn` runs next and
records the identity.
*/
export const createUser = internalMutation({
  args: { provider: vHubSignInProvider },
  returns: id("users"),
  handler: async (ctx, args) => {
    const identity = readHubIdentity(args.provider);

    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (query) =>
        query.eq("provider", identity.provider).eq("providerAccountId", identity.providerAccountId),
      )
      .unique();
    if (account !== null) {
      return account.userId;
    }

    // A deleted row has no email, so the owner is active or deleting; onSignIn rejects deleting.
    const emailOwner = await ctx.db
      .query("users")
      .withIndex("email", (query) => query.eq("email", identity.email))
      .unique();
    const nonDeletedEmailOwner = emailOwner === null ? null : readNonDeletedUser(emailOwner);
    if (nonDeletedEmailOwner !== null) {
      if (nonDeletedEmailOwner.emailVerificationTime === undefined) {
        throw new ConvexError(
          `The email on this ${readProviderLabel(identity.provider)} account belongs to a Samebase account that cannot use it. Sign in with an existing method.`,
        );
      }
      return nonDeletedEmailOwner._id;
    }

    const userId = await ctx.db.insert("users", {
      state: "active",
      email: identity.email,
      emailVerificationTime: Date.now(),
      isApproved: env.AUTO_APPROVE_NEW_USERS === "true",
      ...(identity.name ? { name: identity.name } : {}),
      ...(identity.image ? { image: identity.image } : {}),
    });
    await sendNewUserNotification(ctx, {
      email: identity.email,
      name: identity.name,
      providerId: identity.provider,
      userId,
    });
    return userId;
  },
});

/**
Called by the hub methods on every sign-in, the first one included. It rejects users that cannot
sign in and records the identity with its latest email observation in `authAccounts`, where
Samebase reads a user's sign-in identities; the GitHub row holds the raw GitHub user id that the
GitHub App authorization must match. The hub reports no GitHub login, so a GitHub row keeps the
login that the GitHub method before the hub observed.
*/
export const onSignIn = internalMutation({
  args: { provider: vHubSignInProvider, userId: id("users") },
  returns: vNull(),
  handler: async (ctx, args) => {
    const identity = readHubIdentity(args.provider);
    requireUserCanSignIn(await ctx.db.get(args.userId));
    if (identity.provider === "github") {
      await assertGitHubAccessIdentity(ctx, args.userId, identity.providerAccountId);
    }

    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (query) =>
        query.eq("provider", identity.provider).eq("providerAccountId", identity.providerAccountId),
      )
      .unique();
    if (account !== null) {
      if (account.userId !== args.userId) {
        throw new Error(`This ${readProviderLabel(identity.provider)} identity is inconsistent.`);
      }
      await ctx.db.patch(account._id, { emailVerified: identity.email });
      return null;
    }

    const currentAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (query) =>
        query.eq("userId", args.userId).eq("provider", identity.provider),
      )
      .first();
    if (currentAccount !== null) {
      throw new ConvexError(
        `This Samebase account already uses a different ${readProviderLabel(identity.provider)} account. Sign in with that account.`,
      );
    }
    await ctx.db.insert("authAccounts", {
      userId: args.userId,
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
      emailVerified: identity.email,
    });
    return null;
  },
});

/**
The core calls this the first time a Samebase-built sign-in method signs a user in. The method has
already resolved the user, so this links the core account to it and creates nothing.
*/
export const linkExistingUser = internalMutation({
  args: {
    provider: object({
      name: vCustomSignInProviderName,
      accountId: string(),
      profile: object({ userId: id("users") }),
    }),
  },
  returns: id("users"),
  handler: async (_ctx, args) => args.provider.profile.userId,
});

/**
Mints a session for a user that a Samebase-built sign-in method resolved. Each method keeps one core
account per user, keyed by the user id; the first sign-in creates it through `linkExistingUser`.
*/
export async function startCustomSignInSession(
  ctx: MutationCtx,
  args: { providerName: CustomSignInProviderName; userId: Id<"users"> },
): Promise<TokenBundle> {
  const claims = {
    providerName: args.providerName,
    providerAccountId: args.userId,
    profile: { userId: args.userId },
  };
  const issuer = env.CONVEX_SITE_URL;
  const linkedUserId = await ctx.runQuery(components.auth.public.getUserIdByAccount, {
    provider: args.providerName,
    providerAccountId: args.userId,
  });
  if (linkedUserId === null) {
    return await ctx.runMutation(components.auth.public.signUp, {
      claims,
      createUserHandle: await createFunctionHandle(internal.identity.signIn.linkExistingUser),
      issuer,
    });
  }
  return await ctx.runMutation(components.auth.public.signIn, { claims, issuer });
}
