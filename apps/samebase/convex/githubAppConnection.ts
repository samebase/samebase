import { RequestError } from "@octokit/request-error";
import { v, type Infer } from "convex/values";

import { normalizeAccountEmail } from "../shared/accountPresentation";
import { canAccess } from "../shared/accessModel";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  env,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type DatabaseReader,
  type MutationCtx,
} from "./_generated/server";
import { resolveDeploymentProfile } from "./deploymentProfile";
import {
  discoverPreviewSeedGitHubAppInstallations,
  listGitHubAppConnectionInstallations,
  verifyGitHubAppConnectionInstallation,
  type GitHubAppConnectionInstallation,
  type PreviewSeedGitHubAppInstallation,
} from "./githubApp";
import {
  hasMatchingGitHubUserAuthorization,
  readGitHubSignInMatch,
  resolveGitHubUserAuthorizationForAppConnection,
} from "./githubUserAuthorizations";
import { action } from "./functions";
import { findOrganizationMembership } from "./organizationAccess";
import { vGitHubOwnerType } from "./organizationModel";
import { readOptionalEnv } from "./oauthUtils";

const { array, boolean, id, literal, object, string, union } = v;

const connectionOptionFields = {
  installationId: string(),
  githubOwnerType: vGitHubOwnerType,
  githubOwnerLogin: string(),
} as const;

const vConnectionOption = union(
  object({
    status: union(literal("connect"), literal("invite_required"), literal("owner_required")),
    ...connectionOptionFields,
  }),
  object({
    status: literal("open"),
    ...connectionOptionFields,
    organizationOwnerLogin: string(),
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

async function isPreviewSeedUser(db: DatabaseReader, userId: Id<"users">): Promise<boolean> {
  if (resolveDeploymentProfile().kind !== "preview") {
    return false;
  }
  const seedEmail = readOptionalEnv("DEV_SEED_AUTH_EMAIL");
  if (seedEmail === null || readOptionalEnv("DEV_SEED_AUTH_PASSWORD") === null) {
    return false;
  }
  const email = normalizeAccountEmail(seedEmail);
  const passwordAccounts = await db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (query) =>
      query.eq("provider", "password").eq("providerAccountId", email),
    )
    .take(2);
  return passwordAccounts.length === 1 && passwordAccounts[0].userId === userId;
}

export const resolvePreviewSeedUser = internalQuery({
  args: { userId: id("users") },
  returns: boolean(),
  handler: async (ctx, args) => await isPreviewSeedUser(ctx.db, args.userId),
});

async function resolvePreviewSeedGitHubInstallations(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users">,
): Promise<PreviewSeedGitHubAppInstallation[] | null> {
  const previewSeedUser = await ctx.runQuery(internal.githubAppConnection.resolvePreviewSeedUser, {
    userId,
  });
  if (!previewSeedUser) {
    return null;
  }
  const apiKey = env.DEV_SEED_GITHUB_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("DEV_SEED_GITHUB_API_KEY is required for preview GitHub access.");
  }
  return await discoverPreviewSeedGitHubAppInstallations(apiKey);
}

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
      const option = {
        installationId: installation.installationId,
        githubOwnerType: installation.githubOwnerType,
        githubOwnerLogin: installation.githubOwnerLogin,
      };
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
          ...option,
          organizationOwnerLogin: organization.githubOwnerLogin,
        });
        continue;
      }
      if (!installation.canManage) {
        options.push({
          status: "owner_required",
          ...option,
        });
        continue;
      }
      if (organization !== null) {
        options.push({
          status: "invite_required",
          ...option,
        });
        continue;
      }
      options.push({
        status: "connect",
        ...option,
      });
    }
    return options;
  },
});

const verifiedInstallationFields = {
  userId: id("users"),
  installationId: string(),
  githubOwnerId: string(),
  githubOwnerType: vGitHubOwnerType,
  githubOwnerLogin: string(),
} as const;
const vVerifiedInstallation = object(verifiedInstallationFields);
type VerifiedInstallation = Infer<typeof vVerifiedInstallation>;

async function connectInstallationAfterAuthority(
  ctx: MutationCtx,
  args: VerifiedInstallation,
): Promise<ConnectionResult> {
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
}

export const connectVerifiedInstallation = internalMutation({
  args: {
    ...verifiedInstallationFields,
    githubUserId: string(),
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
    return await connectInstallationAfterAuthority(ctx, args);
  },
});

export const connectPreviewSeedVerifiedInstallation = internalMutation({
  args: verifiedInstallationFields,
  returns: vConnectionResult,
  handler: async (ctx, args): Promise<ConnectionResult> => {
    if (!(await isPreviewSeedUser(ctx.db, args.userId))) {
      return { status: "authorization_required" };
    }
    return await connectInstallationAfterAuthority(ctx, args);
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
    try {
      const previewSeedInstallations = await resolvePreviewSeedGitHubInstallations(
        ctx,
        ctx.viewer.userId,
      );
      let installations: GitHubAppConnectionInstallation[];
      if (previewSeedInstallations === null) {
        const authorization = await resolveGitHubUserAuthorizationForAppConnection(
          ctx,
          ctx.viewer.userId,
        );
        if (authorization.status !== "ready") {
          return { status: authorization.status };
        }
        installations = await listGitHubAppConnectionInstallations({
          octokit: authorization.octokit,
          githubUserId: authorization.githubUserId,
        });
      } else {
        installations = previewSeedInstallations.map((installation) => ({
          installationId: installation.githubInstallationId,
          githubOwnerId: installation.githubOwnerId,
          githubOwnerType: installation.githubOwnerType,
          githubOwnerLogin: installation.githubOwnerLogin,
          canManage: true,
        }));
      }
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
    try {
      const previewSeedInstallations = await resolvePreviewSeedGitHubInstallations(
        ctx,
        ctx.viewer.userId,
      );
      if (previewSeedInstallations !== null) {
        const previewInstallation = previewSeedInstallations.find(
          ({ githubInstallationId }) => githubInstallationId === args.installationId,
        );
        if (previewInstallation === undefined) {
          return { status: "owner_required" };
        }
        return await ctx.runMutation(
          internal.githubAppConnection.connectPreviewSeedVerifiedInstallation,
          {
            userId: ctx.viewer.userId,
            installationId: previewInstallation.githubInstallationId,
            githubOwnerId: previewInstallation.githubOwnerId,
            githubOwnerType: previewInstallation.githubOwnerType,
            githubOwnerLogin: previewInstallation.githubOwnerLogin,
          },
        );
      }

      const authorization = await resolveGitHubUserAuthorizationForAppConnection(
        ctx,
        ctx.viewer.userId,
      );
      if (authorization.status !== "ready") {
        return { status: authorization.status };
      }
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
