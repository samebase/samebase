import { RequestError } from "@octokit/request-error";
import { v, type Infer } from "convex/values";

import { canAccess } from "../shared/accessModel";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import {
  listGitHubAppConnectionInstallations,
  revokeGitHubAppUserToken,
  verifyGitHubAppConnectionInstallation,
} from "./githubApp";
import {
  hasMatchingGitHubUserAuthorization,
  readGitHubSignInMatch,
  resolveGitHubUserAuthorizationForAppConnection,
} from "./githubUserAuthorizations";
import { action } from "./functions";
import { findOrganizationMembership } from "./organizationAccess";
import { vGitHubOwnerType } from "./organizationModel";

const { array, boolean, id, literal, object, string, union } = v;

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
);

const vConnectionResult = union(
  object({ status: literal("connected"), organizationOwnerLogin: string() }),
  object({ status: literal("open"), organizationOwnerLogin: string() }),
  object({ status: literal("access_lost") }),
  object({ status: literal("invite_required") }),
  object({ status: literal("owner_required") }),
  object({ status: literal("authorization_required") }),
  object({ status: literal("github_sign_in_required") }),
);
type ConnectionResult = Infer<typeof vConnectionResult>;

const vListOptionsResult = union(
  object({ status: literal("ready"), options: array(vConnectionOption) }),
  object({ status: literal("authorization_required") }),
  object({ status: literal("github_sign_in_required") }),
);
type ListOptionsResult = Infer<typeof vListOptionsResult>;

export const classifyOptions = internalQuery({
  args: {
    userId: id("users"),
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
    userId: id("users"),
    githubUserId: string(),
    installationId: string(),
    githubOwnerId: string(),
    githubOwnerType: vGitHubOwnerType,
    githubOwnerLogin: string(),
  },
  returns: vConnectionResult,
  handler: async (ctx, args): Promise<ConnectionResult> => {
    const signInMatch = await readGitHubSignInMatch(ctx.db, {
      userId: args.userId,
      githubUserId: args.githubUserId,
    });
    if (signInMatch !== "matched") {
      return { status: "github_sign_in_required" };
    }
    if (!(await hasMatchingGitHubUserAuthorization(ctx.db, args))) {
      return { status: "authorization_required" };
    }
    const viewer = await ctx.runQuery(internal.functions.resolveViewerForUserId, {
      userId: args.userId,
    });
    if (viewer.user === null || !canAccess("access_app_create", viewer.accessKeys)) {
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
    await ctx.runMutation(internal.organizations.createOrReconnectVerifiedOrganization, {
      userId: args.userId,
      githubOwnerId: args.githubOwnerId,
      githubOwnerType: args.githubOwnerType,
      githubOwnerLogin: args.githubOwnerLogin,
      githubInstallationId: args.installationId,
    });
    return { status: "connected", organizationOwnerLogin: args.githubOwnerLogin };
  },
});

const vExpiredLegacyCredentialResult = union(
  object({ status: literal("revoke"), accessToken: string() }),
  object({ status: literal("deleted") }),
  v.null(),
);

const vAccountDeletionLegacyCredentialResult = union(
  object({
    status: literal("revoke"),
    credentialId: id("githubAppConnectionCredentials"),
    accessToken: string(),
  }),
  object({ status: literal("deleted") }),
  v.null(),
);

async function revokeLegacyConnectionToken(accessToken: string): Promise<void> {
  try {
    await revokeGitHubAppUserToken(accessToken);
  } catch (error) {
    console.error("github:connection:token_revoke_failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

/** Compatibility cleanup for temporary credentials written before durable authorization. */
export const takeExpiredCredential = internalMutation({
  args: { credentialId: id("githubAppConnectionCredentials") },
  returns: vExpiredLegacyCredentialResult,
  handler: async (ctx, args): Promise<Infer<typeof vExpiredLegacyCredentialResult>> => {
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
  returns: vAccountDeletionLegacyCredentialResult,
  handler: async (ctx, args): Promise<Infer<typeof vAccountDeletionLegacyCredentialResult>> => {
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
  handler: async (ctx, args): Promise<null> => {
    const identity = await ctx.runQuery(internal.accountDeletion.stepContext.getOwnedIdentity, {
      runId: args.runId,
      workflowId: args.workflowId,
    });
    const credential = await ctx.runMutation(
      internal.githubAppConnection.prepareForAccountDeletion,
      { userId: identity.userId },
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
  handler: async (ctx, args): Promise<null> => {
    const credential = await ctx.runMutation(internal.githubAppConnection.takeExpiredCredential, {
      credentialId: args.credentialId,
    });
    if (credential?.status === "revoke") {
      await revokeLegacyConnectionToken(credential.accessToken);
    }
    return null;
  },
});

function isRevokedGitHubUserToken(error: unknown): boolean {
  return error instanceof RequestError && error.status === 401;
}

export const listOptions = action({
  access: "access_app_create",
  args: {},
  returns: vListOptionsResult,
  handler: async (ctx): Promise<ListOptionsResult> => {
    const authorization = await resolveGitHubUserAuthorizationForAppConnection(
      ctx,
      ctx.viewer.userId,
    );
    if (authorization.status !== "ready") {
      return { status: authorization.status };
    }
    try {
      const installations = await listGitHubAppConnectionInstallations({
        octokit: authorization.octokit,
        githubUserId: authorization.githubUserId,
      });
      const options: Array<Infer<typeof vConnectionOption>> = await ctx.runQuery(
        internal.githubAppConnection.classifyOptions,
        { userId: ctx.viewer.userId, installations },
      );
      return { status: "ready", options };
    } catch (error) {
      if (isRevokedGitHubUserToken(error)) {
        return { status: "authorization_required" };
      }
      throw error;
    }
  },
});

export const connectInstallation = action({
  access: "access_app_create",
  args: { installationId: string() },
  returns: vConnectionResult,
  handler: async (ctx, args): Promise<ConnectionResult> => {
    const authorization = await resolveGitHubUserAuthorizationForAppConnection(
      ctx,
      ctx.viewer.userId,
    );
    if (authorization.status !== "ready") {
      return { status: authorization.status };
    }
    try {
      const installation = await verifyGitHubAppConnectionInstallation({
        octokit: authorization.octokit,
        githubUserId: authorization.githubUserId,
        installationId: args.installationId,
      });
      if (!installation.canManage) {
        return { status: "owner_required" };
      }
      return await ctx.runMutation(internal.githubAppConnection.connectVerifiedInstallation, {
        userId: ctx.viewer.userId,
        githubUserId: authorization.githubUserId,
        installationId: installation.installationId,
        githubOwnerId: installation.githubOwnerId,
        githubOwnerType: installation.githubOwnerType,
        githubOwnerLogin: installation.githubOwnerLogin,
      });
    } catch (error) {
      if (isRevokedGitHubUserToken(error)) {
        return { status: "authorization_required" };
      }
      throw error;
    }
  },
});
