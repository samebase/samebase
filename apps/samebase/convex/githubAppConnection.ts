import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import {
  listGitHubAppConnectionInstallations,
  revokeGitHubAppUserToken,
  verifyGitHubAppConnectionInstallation,
} from "./githubApp";
import { vGitHubAppConnectionCredential } from "./githubAppConnectionModel";
import { readGitHubSignInMatch, upsertGitHubUserAuthorization } from "./githubUserAuthorizations";
import { action } from "./functions";
import { OAUTH_STATE_TTL_MS, randomToken } from "./oauthUtils";
import { findOrganizationMembership } from "./organizationAccess";
import { vGitHubOwnerType } from "./organizationModel";
import { readActiveUser } from "./userLifecycle";
import { canAccess } from "../shared/accessModel";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

const vConnectionOption = union(
  object({
    status: literal("connect"),
    installationId: string(),
    githubOwnerType: vGitHubOwnerType,
    githubOwnerLogin: string(),
  }),
  object({
    status: literal("open"),
    installationId: string(),
    githubOwnerType: vGitHubOwnerType,
    githubOwnerLogin: string(),
    organizationOwnerLogin: string(),
  }),
  object({
    status: literal("invite_required"),
    installationId: string(),
    githubOwnerType: vGitHubOwnerType,
    githubOwnerLogin: string(),
  }),
  object({
    status: literal("owner_required"),
    installationId: string(),
    githubOwnerType: vGitHubOwnerType,
    githubOwnerLogin: string(),
  }),
  object({
    status: literal("github_sign_in_required"),
    installationId: string(),
    githubOwnerType: literal("user"),
    githubOwnerLogin: string(),
  }),
  object({
    status: literal("github_sign_in_mismatch"),
    installationId: string(),
    githubOwnerType: literal("user"),
    githubOwnerLogin: string(),
  }),
);

const vConnectionResult = union(
  object({ status: literal("connected"), organizationOwnerLogin: string() }),
  object({ status: literal("open"), organizationOwnerLogin: string() }),
  object({ status: literal("access_lost") }),
  object({ status: literal("invite_required") }),
  object({ status: literal("owner_required") }),
  object({ status: literal("session_expired") }),
  object({ status: literal("github_sign_in_required") }),
  object({ status: literal("github_sign_in_mismatch") }),
);
type ConnectionResult = Infer<typeof vConnectionResult>;
const vListOptionsResult = union(
  object({ status: literal("ready"), options: array(vConnectionOption) }),
  object({ status: literal("completed"), organizationOwnerLogin: string() }),
  object({ status: literal("session_expired") }),
);
type ListOptionsResult = Infer<typeof vListOptionsResult>;

const vCredentialResult = union(
  object({
    credentialId: id("githubAppConnectionCredentials"),
    credential: vGitHubAppConnectionCredential,
  }),
  v.null(),
);

const vStoreCredentialResult = union(
  object({
    status: literal("stored"),
    session: string(),
    replacedAccessToken: optional(string()),
  }),
  object({ status: literal("access_lost") }),
);
type StoreCredentialResult = Infer<typeof vStoreCredentialResult>;

const vExpiredCredentialResult = union(
  object({ status: literal("revoke"), accessToken: string() }),
  object({ status: literal("deleted") }),
  v.null(),
);
type ExpiredCredentialResult = Infer<typeof vExpiredCredentialResult>;

const vAccountDeletionCredentialResult = union(
  object({
    status: literal("revoke"),
    credentialId: id("githubAppConnectionCredentials"),
    accessToken: string(),
  }),
  object({ status: literal("deleted") }),
  v.null(),
);
type AccountDeletionCredentialResult = Infer<typeof vAccountDeletionCredentialResult>;

async function revokeConnectionToken(accessToken: string): Promise<void> {
  try {
    await revokeGitHubAppUserToken(accessToken);
  } catch (error) {
    console.error("github:connection:token_revoke_failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export const storeCredential = internalMutation({
  args: {
    setupStateId: id("githubAppSetupStates"),
    state: string(),
    githubUserId: string(),
    githubUserLogin: string(),
    accessToken: string(),
    accessTokenExpiresAt: number(),
    refreshToken: string(),
    refreshTokenExpiresAt: number(),
  },
  returns: vStoreCredentialResult,
  handler: async (ctx, args): Promise<StoreCredentialResult> => {
    const setupState = await ctx.db.get(args.setupStateId);
    if (
      setupState === null ||
      setupState.state !== args.state ||
      setupState.purpose !== "organization_connection" ||
      setupState.expiresAt < Date.now()
    ) {
      throw new Error("GitHub organization connection state changed.");
    }
    const user = await ctx.db.get(setupState.userId);
    if (user === null || readActiveUser(user) === null) {
      throw new Error("An active Samebase user is required.");
    }
    const viewer = await ctx.runQuery(internal.functions.resolveViewerForUserId, {
      userId: setupState.userId,
    });
    if (viewer.user === null || !canAccess("access_app_create", viewer.accessKeys)) {
      await ctx.db.delete(setupState._id);
      return { status: "access_lost" };
    }
    const previousCredential = await ctx.db
      .query("githubAppConnectionCredentials")
      .withIndex("by_user", (query) => query.eq("userId", setupState.userId))
      .unique();
    if (previousCredential !== null) {
      await ctx.db.delete(previousCredential._id);
    }
    const now = Date.now();
    const expiresAt = Math.min(now + OAUTH_STATE_TTL_MS, args.accessTokenExpiresAt);
    const session = randomToken();
    const credentialId = await ctx.db.insert("githubAppConnectionCredentials", {
      state: "authorized",
      userId: setupState.userId,
      session,
      githubUserId: args.githubUserId,
      githubUserLogin: args.githubUserLogin,
      githubSignInProviderAccountId: setupState.githubSignInProviderAccountId,
      accessToken: args.accessToken,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      refreshToken: args.refreshToken,
      refreshTokenExpiresAt: args.refreshTokenExpiresAt,
      createdAt: now,
      expiresAt,
    });
    await ctx.db.delete(setupState._id);
    await ctx.scheduler.runAt(expiresAt, internal.githubAppConnection.expireCredential, {
      credentialId,
    });
    return {
      status: "stored",
      session,
      replacedAccessToken:
        previousCredential?.state === "authorized" ? previousCredential.accessToken : undefined,
    };
  },
});

export const getCredential = internalQuery({
  args: { session: string(), userId: id("users"), now: number() },
  returns: vCredentialResult,
  handler: async (ctx, args): Promise<Infer<typeof vCredentialResult>> => {
    const credential = await ctx.db
      .query("githubAppConnectionCredentials")
      .withIndex("by_session", (query) => query.eq("session", args.session))
      .unique();
    if (
      credential === null ||
      credential.userId !== args.userId ||
      credential.expiresAt < args.now
    ) {
      return null;
    }
    if (credential.state === "completed") {
      return {
        credentialId: credential._id,
        credential: {
          state: "completed",
          userId: credential.userId,
          session: credential.session,
          organizationOwnerLogin: credential.organizationOwnerLogin,
          createdAt: credential.createdAt,
          expiresAt: credential.expiresAt,
        },
      };
    }
    return {
      credentialId: credential._id,
      credential: {
        state: "authorized",
        userId: credential.userId,
        session: credential.session,
        githubUserId: credential.githubUserId,
        githubUserLogin: credential.githubUserLogin,
        githubSignInProviderAccountId: credential.githubSignInProviderAccountId,
        accessToken: credential.accessToken,
        accessTokenExpiresAt: credential.accessTokenExpiresAt,
        refreshToken: credential.refreshToken,
        refreshTokenExpiresAt: credential.refreshTokenExpiresAt,
        createdAt: credential.createdAt,
        expiresAt: credential.expiresAt,
      },
    };
  },
});

export const classifyOptions = internalQuery({
  args: {
    userId: id("users"),
    githubSignInProviderAccountId: optional(string()),
    installations: array(
      object({
        installationId: string(),
        githubOwnerId: string(),
        githubOwnerType: vGitHubOwnerType,
        githubOwnerLogin: string(),
        canManage: boolean(),
      }),
    ),
  },
  returns: array(vConnectionOption),
  handler: async (ctx, args) => {
    const options: Array<Infer<typeof vConnectionOption>> = [];
    for (const installation of args.installations) {
      const organization = await ctx.db
        .query("organizations")
        .withIndex("by_github_owner_id", (query) =>
          query.eq("githubOwnerId", installation.githubOwnerId),
        )
        .unique();
      const membership =
        organization === null
          ? null
          : await findOrganizationMembership(ctx.db, {
              organizationId: organization._id,
              userId: args.userId,
            });
      if (membership !== null && organization !== null) {
        options.push({
          status: "open",
          installationId: installation.installationId,
          githubOwnerType: installation.githubOwnerType,
          githubOwnerLogin: installation.githubOwnerLogin,
          organizationOwnerLogin: organization.githubOwnerLogin,
        });
        continue;
      }
      if (!installation.canManage) {
        options.push({
          status: "owner_required",
          installationId: installation.installationId,
          githubOwnerType: installation.githubOwnerType,
          githubOwnerLogin: installation.githubOwnerLogin,
        });
        continue;
      }
      if (organization !== null) {
        options.push({
          status: "invite_required",
          installationId: installation.installationId,
          githubOwnerType: installation.githubOwnerType,
          githubOwnerLogin: installation.githubOwnerLogin,
        });
        continue;
      }
      if (installation.githubOwnerType === "user") {
        const signInMatch =
          args.githubSignInProviderAccountId === undefined
            ? "missing"
            : args.githubSignInProviderAccountId !== installation.githubOwnerId
              ? "different"
              : await readGitHubSignInMatch(ctx.db, {
                  userId: args.userId,
                  githubUserId: installation.githubOwnerId,
                });
        if (signInMatch !== "matched") {
          options.push({
            status:
              signInMatch === "missing" ? "github_sign_in_required" : "github_sign_in_mismatch",
            installationId: installation.installationId,
            githubOwnerType: "user",
            githubOwnerLogin: installation.githubOwnerLogin,
          });
          continue;
        }
      }
      options.push({
        status: "connect",
        installationId: installation.installationId,
        githubOwnerType: installation.githubOwnerType,
        githubOwnerLogin: installation.githubOwnerLogin,
      });
    }
    return options;
  },
});

export const connectVerifiedInstallation = internalMutation({
  args: {
    credentialId: id("githubAppConnectionCredentials"),
    session: string(),
    userId: id("users"),
    installationId: string(),
    githubOwnerId: string(),
    githubOwnerType: vGitHubOwnerType,
    githubOwnerLogin: string(),
  },
  returns: vConnectionResult,
  handler: async (ctx, args): Promise<ConnectionResult> => {
    const credential = await ctx.db.get(args.credentialId);
    if (
      credential === null ||
      credential.session !== args.session ||
      credential.userId !== args.userId ||
      credential.expiresAt < Date.now()
    ) {
      return { status: "session_expired" };
    }
    if (credential.state === "completed") {
      return { status: "open", organizationOwnerLogin: credential.organizationOwnerLogin };
    }
    const viewer = await ctx.runQuery(internal.functions.resolveViewerForUserId, {
      userId: args.userId,
    });
    if (viewer.user === null || !canAccess("access_app_create", viewer.accessKeys)) {
      await ctx.db.delete(credential._id);
      return { status: "access_lost" };
    }
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_github_owner_id", (query) => query.eq("githubOwnerId", args.githubOwnerId))
      .unique();
    if (organization !== null) {
      const membership = await findOrganizationMembership(ctx.db, {
        organizationId: organization._id,
        userId: args.userId,
      });
      return membership === null
        ? { status: "invite_required" }
        : { status: "open", organizationOwnerLogin: organization.githubOwnerLogin };
    }
    if (args.githubOwnerType === "user") {
      const signInMatch =
        credential.githubSignInProviderAccountId === undefined
          ? "missing"
          : credential.githubSignInProviderAccountId !== args.githubOwnerId
            ? "different"
            : await readGitHubSignInMatch(ctx.db, {
                userId: args.userId,
                githubUserId: args.githubOwnerId,
              });
      if (signInMatch !== "matched") {
        return {
          status: signInMatch === "missing" ? "github_sign_in_required" : "github_sign_in_mismatch",
        };
      }
    }
    await ctx.runMutation(internal.organizations.createOrReconnectVerifiedOrganization, {
      userId: args.userId,
      githubOwnerId: args.githubOwnerId,
      githubOwnerType: args.githubOwnerType,
      githubOwnerLogin: args.githubOwnerLogin,
      githubInstallationId: args.installationId,
    });
    if (args.githubOwnerType === "user") {
      await upsertGitHubUserAuthorization(ctx.db, {
        userId: args.userId,
        githubUserId: credential.githubUserId,
        githubUserLogin: credential.githubUserLogin,
        accessToken: credential.accessToken,
        accessTokenExpiresAt: credential.accessTokenExpiresAt,
        refreshToken: credential.refreshToken,
        refreshTokenExpiresAt: credential.refreshTokenExpiresAt,
      });
    }
    await ctx.db.replace(credential._id, {
      state: "completed",
      userId: credential.userId,
      session: credential.session,
      organizationOwnerLogin: args.githubOwnerLogin,
      createdAt: credential.createdAt,
      expiresAt: credential.expiresAt,
    });
    return { status: "connected", organizationOwnerLogin: args.githubOwnerLogin };
  },
});

export const takeExpiredCredential = internalMutation({
  args: { credentialId: id("githubAppConnectionCredentials") },
  returns: vExpiredCredentialResult,
  handler: async (ctx, args): Promise<ExpiredCredentialResult> => {
    const credential = await ctx.db.get(args.credentialId);
    if (credential === null || credential.expiresAt > Date.now()) {
      return null;
    }
    await ctx.db.delete(credential._id);
    return credential.state === "authorized"
      ? { status: "revoke", accessToken: credential.accessToken }
      : { status: "deleted" };
  },
});

export const prepareForAccountDeletion = internalMutation({
  args: { userId: id("users") },
  returns: vAccountDeletionCredentialResult,
  handler: async (ctx, args): Promise<AccountDeletionCredentialResult> => {
    const credential = await ctx.db
      .query("githubAppConnectionCredentials")
      .withIndex("by_user", (query) => query.eq("userId", args.userId))
      .unique();
    if (credential === null) {
      return null;
    }
    if (credential.state === "completed") {
      await ctx.db.delete(credential._id);
      return { status: "deleted" };
    }
    return {
      status: "revoke",
      credentialId: credential._id,
      accessToken: credential.accessToken,
    };
  },
});

export const deleteRevokedCredential = internalMutation({
  args: {
    credentialId: id("githubAppConnectionCredentials"),
    accessToken: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const credential = await ctx.db.get(args.credentialId);
    if (credential?.state === "authorized" && credential.accessToken === args.accessToken) {
      await ctx.db.delete(credential._id);
    }
    return null;
  },
});

export const revokeForAccountDeletion = internalAction({
  args: {
    runId: id("workflow_accountDeletion_runs"),
    workflowId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.runQuery(internal.accountDeletion.stepContext.getOwnedIdentity, {
      runId: args.runId,
      workflowId: args.workflowId,
    });
    const credential = await ctx.runMutation(
      internal.githubAppConnection.prepareForAccountDeletion,
      {
        userId: identity.userId,
      },
    );
    if (credential === null || credential.status === "deleted") {
      return null;
    }
    await revokeGitHubAppUserToken(credential.accessToken);
    await ctx.runMutation(internal.githubAppConnection.deleteRevokedCredential, {
      credentialId: credential.credentialId,
      accessToken: credential.accessToken,
    });
    return null;
  },
});

export const expireCredential = internalAction({
  args: { credentialId: id("githubAppConnectionCredentials") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const credential = await ctx.runMutation(internal.githubAppConnection.takeExpiredCredential, {
      credentialId: args.credentialId,
    });
    if (credential?.status === "revoke") {
      await revokeConnectionToken(credential.accessToken);
    }
    return null;
  },
});

async function getViewerCredential(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { now: number; session: string; userId: Id<"users"> },
): Promise<Infer<typeof vCredentialResult>> {
  return await ctx.runQuery(internal.githubAppConnection.getCredential, {
    now: args.now,
    session: args.session,
    userId: args.userId,
  });
}

export const listOptions = action({
  access: "access_app_create",
  args: { session: string() },
  returns: vListOptionsResult,
  handler: async (ctx, args): Promise<ListOptionsResult> => {
    const credential = await getViewerCredential(ctx, {
      session: args.session,
      userId: ctx.viewer.userId,
      now: Date.now(),
    });
    if (credential === null) {
      return { status: "session_expired" };
    }
    if (credential.credential.state === "completed") {
      return {
        status: "completed",
        organizationOwnerLogin: credential.credential.organizationOwnerLogin,
      };
    }
    const installations = await listGitHubAppConnectionInstallations({
      accessToken: credential.credential.accessToken,
      githubUserId: credential.credential.githubUserId,
    });
    const options: Array<Infer<typeof vConnectionOption>> = await ctx.runQuery(
      internal.githubAppConnection.classifyOptions,
      {
        userId: ctx.viewer.userId,
        githubSignInProviderAccountId: credential.credential.githubSignInProviderAccountId,
        installations,
      },
    );
    return { status: "ready", options };
  },
});

export const connectInstallation = action({
  access: "access_app_create",
  args: { session: string(), installationId: string() },
  returns: vConnectionResult,
  handler: async (ctx, args): Promise<ConnectionResult> => {
    const credential = await getViewerCredential(ctx, {
      session: args.session,
      userId: ctx.viewer.userId,
      now: Date.now(),
    });
    if (credential === null) {
      return { status: "session_expired" };
    }
    if (credential.credential.state === "completed") {
      return {
        status: "open",
        organizationOwnerLogin: credential.credential.organizationOwnerLogin,
      };
    }
    const installation = await verifyGitHubAppConnectionInstallation({
      accessToken: credential.credential.accessToken,
      githubUserId: credential.credential.githubUserId,
      installationId: args.installationId,
    });
    if (!installation.canManage) {
      return { status: "owner_required" };
    }
    const result = await ctx.runMutation(internal.githubAppConnection.connectVerifiedInstallation, {
      credentialId: credential.credentialId,
      session: args.session,
      userId: ctx.viewer.userId,
      installationId: installation.installationId,
      githubOwnerId: installation.githubOwnerId,
      githubOwnerType: installation.githubOwnerType,
      githubOwnerLogin: installation.githubOwnerLogin,
    });
    if (
      result.status === "access_lost" ||
      (result.status === "connected" && installation.githubOwnerType === "organization")
    ) {
      await revokeConnectionToken(credential.credential.accessToken);
    }
    return result;
  },
});
