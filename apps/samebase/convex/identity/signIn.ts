import { parse, validate } from "convex-helpers/validators";
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
import { type AuthAccountProvider, vAuthAccountProvider } from "./accountModel";
import { readNonDeletedUser } from "./lifecycle";
import { buildNewUserNotification } from "./newUserNotification";

const { boolean, id, literal, null: vNull, number, object, optional, string, union } = v;

/**
The id_token claims of the identity hub that a sign-in reads. `sub` is public (RFC 134): the
provider and its own account id, such as `github:4076804`, the same in every app of the hub. The
account id is GitHub's numeric user id as a string, or Google's `sub`. Convex Auth checks the
issuer, audience, and expiry of the id_token, which it received over TLS from the hub's token
endpoint, but not the types of its claims, so `parse` checks them and drops the other claims.
*/
const vHubClaims = object({
  sub: string(),
  /** The hub's connector of the sign-in, such as `google` or `google-apps`. */
  connector: string(),
  email: optional(string()),
  email_verified: optional(boolean()),
  name: optional(string()),
  picture: optional(string()),
});

/**
The profile mapping of a hub method in convex/auth.ts, which signs in through the hub's connector
`method.connector` of the provider `method.provider`. The `sub` starts with the provider, not the
connector: `google:<id>` through `google` and through `google-apps` alike. It refuses claims of
another shape, a `sub` that is not `<provider>:<account id>`, and claims of another connector than
the method's, with a message for the sign-in page. The profile's `connector` is the provider, the
key of `authAccounts`. The callbacks below find existing users by the email, so only an address
that the hub verified counts.
*/
export function readHubProfile(
  claims: unknown,
  method: { connector: string; provider: AuthAccountProvider },
) {
  const prefix = `${method.provider}:`;
  if (
    !validate(vHubClaims, claims, { allowUnknownFields: true }) ||
    claims.connector !== method.connector ||
    !claims.sub.startsWith(prefix) ||
    !/^\S+$/.test(claims.sub.slice(prefix.length))
  ) {
    throw new ConvexError(
      `The identity hub did not complete the ${readProviderLabel(method.provider)} sign-in. Try again later.`,
    );
  }
  const { sub, email, email_verified, name, picture } = parse(vHubClaims, claims);
  return {
    id: sub,
    providerAccountId: sub.slice(prefix.length),
    connector: method.provider,
    ...(name === undefined ? {} : { name }),
    ...(picture === undefined ? {} : { picture }),
    ...(email_verified === true && email !== undefined ? { email } : {}),
  };
}

/**
The sign-ins that the `hub-github` and `hub-google` methods of convex/auth.ts hand to the user
callbacks, with the profile of `readHubProfile`. `profile.id` is the hub's subject. The connector
and the account id in the subject are the provider and the account id of the `authAccounts` key.
*/
const vHubSignInMethod = object({
  name: union(literal("hub-github"), literal("hub-google")),
  profile: vHubClaims
    .omit("sub", "email_verified", "connector")
    .extend({ id: string(), providerAccountId: string(), connector: vAuthAccountProvider }),
});
type HubSignInMethod = Infer<typeof vHubSignInMethod>;

/**
The session the core mints for a sign-in. The core declares no validator for it, so the custom
sign-in methods declare their results with this one.
*/
export const vTokenBundle = object({
  accessToken: string(),
  refreshToken: string(),
  refreshTokenExpiresAt: number(),
  userId: string(),
});

type TokenBundle = Infer<typeof vTokenBundle>;

/**
The token and session lifetimes of every sign-in, in seconds: the Convex Auth 2.0.0 defaults. A
session ends 30 days after it starts; the refresh inactivity timeout is the same, so only that
maximum ends it. convex/auth.ts gives them to `setupConvexAuth`, which uses them for the hub methods
and for refreshes, and `startCustomSignInSession` gives them to the core.
*/
export const authTtl = {
  accessTokenTtlSeconds: 60,
  refreshInactivityTimeoutSeconds: 30 * 24 * 60 * 60,
  sessionMaxLifetimeSeconds: 30 * 24 * 60 * 60,
};

/**
The sign-in methods that Samebase builds on the core API, with the path of the component that
authenticates each: the password component checks the password. The app itself checks the agent
browser handoff token, so that path is empty. The core only stores the path on the session.
*/
const customSignInComponentPaths = {
  password: "authPassword",
  agentBrowserHandoff: "",
};
type CustomSignInMethodName = keyof typeof customSignInComponentPaths;

function readProviderLabel(provider: AuthAccountProvider): "Google" | "GitHub" {
  return provider === "google" ? "Google" : "GitHub";
}

/**
Reads the identity that a hub sign-in may use. The hub must attest a verified email: Samebase
matches existing accounts by it and stores it as the account email of a new user.
*/
function readHubIdentity(method: HubSignInMethod) {
  const { connector, providerAccountId, email, name, picture } = method.profile;
  if (email === undefined) {
    throw new ConvexError(
      `${readProviderLabel(connector)} did not provide a verified email address.`,
    );
  }
  return {
    provider: connector,
    providerAccountId,
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
Called by the hub methods the first time the `authHub` component sees a hub subject. The user is
the one that `authAccounts` already maps the connector's account to (every identity from before the
hub), else the user whose verified account email is the hub's verified email, else a new user. The
component then keeps the subject for that user, so a later sign-in finds it directly. `onSignIn`
runs next and records the identity.
*/
export const createUser = internalMutation({
  args: { method: vHubSignInMethod },
  returns: id("users"),
  handler: async (ctx, args) => {
    const identity = readHubIdentity(args.method);

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
  args: { method: vHubSignInMethod, userId: id("users") },
  returns: vNull(),
  handler: async (ctx, args) => {
    const identity = readHubIdentity(args.method);
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
Mints a session for a user that a Samebase-built sign-in method resolved. The core stores no
accounts, so the method passes the user id directly.

Upstream will replace this path: https://github.com/convex/convex-auth/pull/850 mints sessions only
from signed attestations and removes `_internal_dangerous_signIn`.
*/
export async function startCustomSignInSession(
  ctx: MutationCtx,
  args: { methodName: CustomSignInMethodName; userId: Id<"users"> },
): Promise<TokenBundle> {
  return await ctx.runMutation(components.auth.public._internal_dangerous_signIn, {
    claims: { method: args.methodName, profile: { userId: args.userId } },
    componentPath: customSignInComponentPaths[args.methodName],
    userId: args.userId,
    accessTokenTtlSeconds: authTtl.accessTokenTtlSeconds,
    refreshInactivityTimeoutSeconds: authTtl.refreshInactivityTimeoutSeconds,
    sessionMaxLifetimeSeconds: authTtl.sessionMaxLifetimeSeconds,
  });
}
