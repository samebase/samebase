import type { ConvexAuthConfig } from "@convex-dev/auth/server";
import { guard } from "@samebase/dependent";
import { ConvexError } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL } from "../../../runtime/localWorktreePasswordAuth";
import {
  type PasswordAuthMode,
  resolveDeploymentProfile,
  resolvePasswordAuthMode,
} from "./deploymentProfile";
import { buildNewUserNotification } from "./newUserNotification";
import { readOptionalEnv } from "./oauthUtils";
import { normalizeAccountEmail } from "../shared/accountPresentation";
import type { AuthAccountProvider } from "./authAccountModel";

type ConvexAuthCallbacks = NonNullable<ConvexAuthConfig["callbacks"]>;
type CreateOrUpdateUser = NonNullable<ConvexAuthCallbacks["createOrUpdateUser"]>;
export type CreateOrUpdateAuthUserArgs = Parameters<CreateOrUpdateUser>[1];

const isAuthSessionUser = guard<unknown, { accountDeletion?: unknown }>((value) =>
  typeof value === "object" && value !== null ? value : null,
);

function isDeletingAccountMarker(value: unknown) {
  return (
    typeof value === "object" && value !== null && "state" in value && value.state === "deleting"
  );
}

export function requireAuthSessionUserCanSignIn(user: unknown) {
  if (!isAuthSessionUser(user)) {
    throw new Error("Account is unavailable.");
  }
  if (user.accountDeletion === undefined || isDeletingAccountMarker(user.accountDeletion)) {
    return user;
  }
  throw new Error("Account deletion is already finalizing.");
}

function readRequiredProfileString(
  profile: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = profile[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is unavailable.`);
  }
  return value.trim();
}

function readOptionalProfileString(profile: Record<string, unknown>, key: string) {
  const value = profile[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOAuthProvider(providerId: string): AuthAccountProvider {
  switch (providerId) {
    case "google":
    case "github":
      return providerId;
    default:
      throw new Error("This OAuth provider is not supported.");
  }
}

function readOAuthProviderLabel(providerId: string): "Google" | "GitHub" {
  const provider = readOAuthProvider(providerId);
  return provider === "google" ? "Google" : "GitHub";
}

function readVerifiedOAuthProfile(args: CreateOrUpdateAuthUserArgs) {
  const providerLabel = readOAuthProviderLabel(args.provider.id);
  if (args.profile.emailVerified !== true) {
    throw new Error(`${providerLabel} did not provide a verified email address.`);
  }
  const email = normalizeAccountEmail(
    readRequiredProfileString(args.profile, "email", `${providerLabel} email`),
  );
  const providerAccountId = args.providerAccountId.trim();
  if (!providerAccountId) {
    throw new Error(`${providerLabel} account ID is unavailable.`);
  }
  const name = readOptionalProfileString(args.profile, "name");
  const image = readOptionalProfileString(args.profile, "image");
  if (args.provider.id === "github") {
    readRequiredProfileString(args.profile, "githubLogin", "GitHub username");
  }
  return { email, providerAccountId, name, image };
}

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

async function sendNewUserNotification(
  ctx: MutationCtx,
  args: {
    profile: Record<string, unknown>;
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
    profile: args.profile,
    providerId: args.providerId,
    seededPasswordEmail: readSeededPasswordEmail(passwordAuthMode),
    userId: args.userId,
  });
  if (notification) {
    await ctx.scheduler.runAfter(0, internal.email.send, notification);
  }
}

async function requireActiveUser(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (user === null) {
    throw new Error("Account is unavailable.");
  }
  requireAuthSessionUserCanSignIn(user);
  return user;
}

async function assertGitHubAccessIdentity(
  ctx: MutationCtx,
  userId: Id<"users"> | null,
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
    throw new Error("This GitHub account already provides access for another Samebase account.");
  }
  if (userId === null) {
    return;
  }

  const authorization = await ctx.db
    .query("githubUserAuthorizations")
    .withIndex("by_user", (query) => query.eq("userId", userId))
    .unique();
  if (authorization !== null && authorization.githubUserId !== githubUserId) {
    throw new Error("This Samebase account already uses a different GitHub account for access.");
  }
}

async function linkOAuthAccount(
  ctx: MutationCtx,
  args: CreateOrUpdateAuthUserArgs,
  provider: AuthAccountProvider,
  session: Doc<"authSessions">,
  profile: ReturnType<typeof readVerifiedOAuthProfile>,
) {
  const providerLabel = readOAuthProviderLabel(args.provider.id);
  const user = await requireActiveUser(ctx, session.userId);
  if (args.existingUserId !== null && args.existingUserId !== user._id) {
    throw new Error(`This ${providerLabel} account belongs to another Samebase account.`);
  }

  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (query) =>
      query.eq("userId", user._id).eq("provider", provider),
    )
    .take(2);
  if (accounts.length > 1) {
    throw new Error(`This Samebase account has conflicting ${providerLabel} identities.`);
  }
  const currentAccount = accounts.at(0);
  if (
    currentAccount !== undefined &&
    currentAccount.providerAccountId !== profile.providerAccountId
  ) {
    throw new Error(`A different ${providerLabel} account is already connected.`);
  }
  if (currentAccount === undefined && args.existingUserId !== null) {
    throw new Error(`This ${providerLabel} account link is inconsistent.`);
  }
  if (provider === "github") {
    await assertGitHubAccessIdentity(ctx, user._id, profile.providerAccountId);
  }

  await ctx.db.patch(session._id, { accountLinkIntent: undefined });
  return user._id;
}

async function createOrResolveOAuthUser(
  ctx: MutationCtx,
  args: CreateOrUpdateAuthUserArgs,
): Promise<Id<"users">> {
  const provider = readOAuthProvider(args.provider.id);
  const providerLabel = readOAuthProviderLabel(args.provider.id);
  const profile = readVerifiedOAuthProfile(args);
  const now = Date.now();
  if (args.existingSessionId !== null) {
    const session = await ctx.db.get(args.existingSessionId);
    if (session === null || session.expirationTime <= now) {
      throw new Error("The account-linking session expired. Start again from Account settings.");
    }
    const intent = session.accountLinkIntent;
    if (intent === undefined || intent.expiresAt <= now || intent.provider !== provider) {
      throw new Error(
        `Sign out before you sign in with ${providerLabel}, or connect it in Account settings.`,
      );
    }
    return await linkOAuthAccount(ctx, args, provider, session, profile);
  }

  if (args.existingUserId !== null) {
    const user = await requireActiveUser(ctx, args.existingUserId);
    if (provider === "github") {
      await assertGitHubAccessIdentity(ctx, user._id, profile.providerAccountId);
    }
    return user._id;
  }

  const emailOwner = await ctx.db
    .query("users")
    .withIndex("email", (query) => query.eq("email", profile.email))
    .first();
  if (emailOwner !== null) {
    throw new ConvexError("account-link-required");
  }
  if (provider === "github") {
    await assertGitHubAccessIdentity(ctx, null, profile.providerAccountId);
  }

  const userId = await ctx.db.insert("users", {
    email: profile.email,
    emailVerificationTime: now,
    ...(profile.name ? { name: profile.name } : {}),
    ...(profile.image ? { image: profile.image } : {}),
  });
  await sendNewUserNotification(ctx, {
    profile: args.profile,
    providerId: provider,
    userId,
  });
  return userId;
}

async function createOrResolvePasswordUser(
  ctx: MutationCtx,
  args: CreateOrUpdateAuthUserArgs,
): Promise<Id<"users">> {
  if (args.provider.id !== "password") {
    throw new Error("This credentials provider is not supported.");
  }
  if (args.existingUserId !== null) {
    await requireActiveUser(ctx, args.existingUserId);
    return args.existingUserId;
  }

  const email = normalizeAccountEmail(
    readRequiredProfileString(args.profile, "email", "Password account email"),
  );
  if (args.shouldLinkViaEmail) {
    const matchingUsers = await ctx.db
      .query("users")
      .withIndex("email", (query) => query.eq("email", email))
      .filter((query) => query.neq(query.field("emailVerificationTime"), undefined))
      .take(2);
    if (matchingUsers.length > 1) {
      throw new Error("Multiple verified Samebase accounts use this email.");
    }
    const matchingUser = matchingUsers.at(0);
    if (matchingUser !== undefined) {
      requireAuthSessionUserCanSignIn(matchingUser);
      return matchingUser._id;
    }
  }

  const emailVerificationTime = args.profile["emailVerificationTime"];
  const isApproved = args.profile["isApproved"];
  const userId = await ctx.db.insert("users", {
    email,
    ...(typeof emailVerificationTime === "number" && Number.isFinite(emailVerificationTime)
      ? { emailVerificationTime }
      : {}),
    ...(typeof isApproved === "boolean" ? { isApproved } : {}),
  });
  await sendNewUserNotification(ctx, {
    profile: args.profile,
    providerId: "password",
    userId,
  });
  return userId;
}

export async function createOrUpdateSamebaseUser(
  ctx: MutationCtx,
  args: CreateOrUpdateAuthUserArgs,
): Promise<Id<"users">> {
  switch (args.type) {
    case "oauth":
      return await createOrResolveOAuthUser(ctx, args);
    case "credentials":
      return await createOrResolvePasswordUser(ctx, args);
    case "email":
    case "phone":
    case "verification":
      throw new Error("This authentication flow is not supported.");
    default:
      args.type satisfies never;
      throw new Error("This authentication flow is not supported.");
  }
}
