import { v, type Infer } from "convex/values";

import {
  buildGitHubAppInstallationUrl,
  buildGitHubOrganizationProvidersReturnUrl,
  buildGitHubAppSetupReturnUrl,
  buildGitHubUserAuthorizationUrl,
  isSafeGitHubAppReturnToPath,
} from "../shared/githubApp";
import {
  buildAuthorizationErrorUrl,
  type AuthorizationProvider,
} from "../shared/authorizationError";
import { canAccess } from "../shared/accessModel";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import {
  getGitHubAppConfiguration,
  revokeGitHubAppUserToken,
  verifyGitHubAppConnectionInstallation,
  verifyGitHubUserAuthorization,
} from "./githubApp";
import { vGitHubAppSetupPurpose } from "./githubAppSetupModel";
import { githubUserAuthorizationAad } from "./githubUserAuthorizationModel";
import {
  hasMatchingGitHubUserAuthorization,
  readGitHubSignInProviderAccountId,
  readGitHubSignInMatch,
  requireMatchingGitHubUserAuthorization,
  resolveGitHubUserAuthorizationForAppConnection,
  upsertGitHubUserAuthorization,
} from "./githubUserAuthorizations";
import { mutation } from "./functions";
import { OAUTH_STATE_TTL_MS, randomToken } from "./oauthUtils";
import { vGitHubOwnerType } from "./organization/model";
import {
  findOrganizationMembership,
  requireOrganizationOwnerAccessContext,
} from "./organizationAccess";
import {
  buildAuthorizationCompletionResponse,
  classifyAuthorizationCallbackError,
} from "./authorizationCompletion";
import { readActiveUser } from "./identity/lifecycle";
import { openSecret, sealSecret, vSealedSecret } from "./sealedSecret";

const { boolean, id, literal, number, object, optional, string, union } = v;

const vGitHubAppSetupStateResult = union(
  object({
    setupStateId: id("githubAppSetupStates"),
    userId: id("users"),
    state: string(),
    purpose: vGitHubAppSetupPurpose,
    organizationId: optional(id("organizations")),
    githubSignInProviderAccountId: optional(string()),
    returnToPath: optional(string()),
    expiresAt: number(),
  }),
  v.null(),
);
type GitHubAppSetupStateResult = Infer<typeof vGitHubAppSetupStateResult>;

const vGitHubAppSetupCompletion = union(
  object({
    status: literal("stored"),
    organizationId: id("organizations"),
    created: boolean(),
    githubOwnerLogin: string(),
  }),
  object({ status: literal("access_lost") }),
  object({ status: literal("github_sign_in_required") }),
  object({ status: literal("github_sign_in_mismatch") }),
  object({ status: literal("authorization_required") }),
  object({ status: literal("target_mismatch"), githubOwnerLogin: string() }),
  object({ status: literal("organization_owner_required"), githubOwnerLogin: string() }),
);
const vGitHubUserAuthorizationCompletion = union(
  object({ status: literal("stored"), displacedAccessToken: optional(vSealedSecret) }),
  object({ status: literal("access_lost") }),
  object({ status: literal("github_sign_in_required") }),
  object({ status: literal("github_sign_in_mismatch") }),
);
type GitHubUserAuthorizationCompletion = Infer<typeof vGitHubUserAuthorizationCompletion>;
const vGitHubAuthorizationStart = object({
  callbackOrigin: string(),
  setupUrl: string(),
});
type GitHubAppSetupCompletion = Infer<typeof vGitHubAppSetupCompletion>;
type GitHubAppSetupPurpose = Infer<typeof vGitHubAppSetupPurpose>;

function parseInstallationId(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function revokeUncommittedGitHubUserToken(accessToken: string): Promise<void> {
  try {
    await revokeGitHubAppUserToken(accessToken);
  } catch (error) {
    console.error("github:authorization:unused_token_revoke_failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

async function createGitHubAppSetupState(
  ctx: MutationCtx,
  userId: Id<"users">,
  purpose: GitHubAppSetupPurpose,
  returnToPath?: string,
  organizationId?: Id<"organizations">,
): Promise<string> {
  const state = randomToken();
  const normalizedReturnToPath =
    returnToPath !== undefined && isSafeGitHubAppReturnToPath(returnToPath)
      ? returnToPath
      : undefined;
  const now = Date.now();
  const githubSignInProviderAccountId = await readGitHubSignInProviderAccountId(ctx.db, userId);
  if (githubSignInProviderAccountId === null) {
    throw new Error("A linked GitHub sign-in is required.");
  }
  await ctx.runMutation(internal.githubAppInstallation.createSetupState, {
    userId,
    state,
    purpose,
    organizationId,
    githubSignInProviderAccountId,
    returnToPath: normalizedReturnToPath,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  return state;
}

async function buildGitHubAppReconnectSetupUrl(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    returnToPath?: string;
    userId: Id<"users">;
  },
): Promise<string> {
  const appSlug = getGitHubAppConfiguration().appSlug;
  const state = await createGitHubAppSetupState(
    ctx,
    args.userId,
    "installation_reconnect",
    args.returnToPath,
    args.organizationId,
  );
  return buildGitHubAppInstallationUrl({ appSlug, state });
}

async function buildGitHubAppSetupUrl(
  ctx: MutationCtx,
  userId: Id<"users">,
  returnToPath?: string,
): Promise<string> {
  const appSlug = getGitHubAppConfiguration().appSlug;
  const state = await createGitHubAppSetupState(ctx, userId, "installation", returnToPath);

  return buildGitHubAppInstallationUrl({
    appSlug,
    state,
  });
}

async function buildGitHubUserAuthorizationSetupUrl(
  ctx: MutationCtx,
  args: {
    returnToPath?: string;
    userId: Id<"users">;
  },
): Promise<string> {
  const configuration = getGitHubAppConfiguration();
  const state = await createGitHubAppSetupState(
    ctx,
    args.userId,
    "user_authorization",
    args.returnToPath,
  );
  return buildGitHubUserAuthorizationUrl({
    clientId: configuration.clientId,
    redirectUri: configuration.oauthCallbackUrl,
    state,
  });
}

export const createSetupState = internalMutation({
  args: {
    userId: id("users"),
    state: string(),
    purpose: vGitHubAppSetupPurpose,
    organizationId: optional(id("organizations")),
    githubSignInProviderAccountId: optional(string()),
    returnToPath: optional(string()),
    createdAt: number(),
    expiresAt: number(),
  },
  returns: id("githubAppSetupStates"),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null || readActiveUser(user) === null) {
      throw new Error("An active Samebase user is required.");
    }
    if (args.expiresAt <= args.createdAt) {
      throw new Error("GitHub App setup state expiry must follow creation.");
    }
    if (args.returnToPath !== undefined && !isSafeGitHubAppReturnToPath(args.returnToPath)) {
      throw new Error("GitHub App setup return path is invalid.");
    }
    if ((args.purpose === "installation_reconnect") !== (args.organizationId !== undefined)) {
      throw new Error("GitHub App setup state organization does not match its purpose.");
    }

    return await ctx.db.insert("githubAppSetupStates", args);
  },
});

export const getSetupStateByState = internalQuery({
  args: {
    state: string(),
  },
  returns: vGitHubAppSetupStateResult,
  handler: async (ctx, args) => {
    const setupState = await ctx.db
      .query("githubAppSetupStates")
      .withIndex("by_state", (query) => query.eq("state", args.state))
      .unique();
    if (setupState === null) {
      return null;
    }
    const user = await ctx.db.get(setupState.userId);
    if (user === null || readActiveUser(user) === null) {
      return null;
    }

    return {
      setupStateId: setupState._id,
      userId: setupState.userId,
      state: setupState.state,
      purpose: setupState.purpose ?? "installation",
      organizationId: setupState.organizationId,
      githubSignInProviderAccountId: setupState.githubSignInProviderAccountId,
      returnToPath: setupState.returnToPath,
      expiresAt: setupState.expiresAt,
    };
  },
});

export const deleteSetupState = internalMutation({
  args: {
    setupStateId: id("githubAppSetupStates"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const setupState = await ctx.db.get(args.setupStateId);
    if (setupState !== null) {
      await ctx.db.delete(setupState._id);
    }
    return null;
  },
});

export const completeVerifiedSetup = internalMutation({
  args: {
    setupStateId: id("githubAppSetupStates"),
    state: string(),
    installationId: string(),
    githubOwnerId: string(),
    githubOwnerType: vGitHubOwnerType,
    githubOwnerLogin: string(),
    githubUserId: string(),
  },
  returns: vGitHubAppSetupCompletion,
  handler: async (ctx, args): Promise<GitHubAppSetupCompletion> => {
    const setupState = await ctx.db.get(args.setupStateId);
    if (setupState === null || setupState.state !== args.state) {
      throw new Error("GitHub App setup state changed.");
    }
    if (setupState.expiresAt < Date.now()) {
      throw new Error("GitHub App setup state expired.");
    }
    const purpose = setupState.purpose ?? "installation";
    if (purpose !== "installation" && purpose !== "installation_reconnect") {
      throw new Error("GitHub App setup state purpose changed.");
    }
    const viewer = await ctx.runQuery(internal.functions.resolveViewerForUserId, {
      userId: setupState.userId,
    });
    if (viewer.user === null || !canAccess("access_app_create", viewer.accessKeys)) {
      await ctx.db.delete(setupState._id);
      return { status: "access_lost" };
    }

    if (
      setupState.githubSignInProviderAccountId === undefined ||
      setupState.githubSignInProviderAccountId !== args.githubUserId
    ) {
      await ctx.db.delete(setupState._id);
      return { status: "github_sign_in_required" };
    }
    const signInMatch = await readGitHubSignInMatch(ctx.db, {
      userId: setupState.userId,
      githubUserId: args.githubUserId,
    });
    if (signInMatch !== "matched") {
      await ctx.db.delete(setupState._id);
      return {
        status: signInMatch === "missing" ? "github_sign_in_required" : "github_sign_in_mismatch",
      };
    }
    if (
      !(await hasMatchingGitHubUserAuthorization(ctx.db, {
        userId: setupState.userId,
        githubUserId: args.githubUserId,
      }))
    ) {
      await ctx.db.delete(setupState._id);
      return { status: "authorization_required" };
    }

    if (purpose === "installation_reconnect") {
      if (setupState.organizationId === undefined) {
        throw new Error("GitHub App reconnect state lost its organization.");
      }
      const organization = await ctx.db.get(setupState.organizationId);
      if (organization === null) {
        await ctx.db.delete(setupState._id);
        return { status: "access_lost" };
      }
      try {
        await requireOrganizationOwnerAccessContext(ctx.db, {
          organizationId: organization._id,
          userId: setupState.userId,
        });
      } catch {
        await ctx.db.delete(setupState._id);
        return { status: "access_lost" };
      }
      if (organization.githubOwnerId !== args.githubOwnerId) {
        await ctx.db.delete(setupState._id);
        return {
          status: "target_mismatch",
          githubOwnerLogin: organization.githubOwnerLogin,
        };
      }
    }

    if (args.githubOwnerType === "user" && args.githubOwnerId !== args.githubUserId) {
      await ctx.db.delete(setupState._id);
      return { status: "github_sign_in_mismatch" };
    }

    if (purpose === "installation") {
      const existingOrganization = await ctx.db
        .query("organizations")
        .withIndex("by_github_owner_id", (query) => query.eq("githubOwnerId", args.githubOwnerId))
        .unique();
      if (existingOrganization !== null) {
        const membership = await findOrganizationMembership(ctx.db, {
          organizationId: existingOrganization._id,
          userId: setupState.userId,
        });
        if (membership?.role !== "owner") {
          await ctx.db.delete(setupState._id);
          return {
            status: "organization_owner_required",
            githubOwnerLogin: existingOrganization.githubOwnerLogin,
          };
        }
      }
    }

    const result = await ctx.runMutation(
      internal.organizations.createOrReconnectVerifiedOrganizationForGitHubAppCallback,
      {
        userId: setupState.userId,
        githubOwnerId: args.githubOwnerId,
        githubOwnerType: args.githubOwnerType,
        githubOwnerLogin: args.githubOwnerLogin,
        githubInstallationId: args.installationId,
        setupStateId: args.setupStateId,
      },
    );

    await ctx.db.delete(setupState._id);
    return {
      status: "stored",
      ...result,
      githubOwnerLogin: args.githubOwnerLogin,
    };
  },
});

export const completeUserAuthorization = internalMutation({
  args: {
    setupStateId: id("githubAppSetupStates"),
    state: string(),
    githubUserId: string(),
    githubUserLogin: string(),
    accessToken: vSealedSecret,
    accessTokenExpiresAt: number(),
    refreshToken: vSealedSecret,
    refreshTokenExpiresAt: number(),
  },
  returns: vGitHubUserAuthorizationCompletion,
  handler: async (ctx, args): Promise<GitHubUserAuthorizationCompletion> => {
    const setupState = await ctx.db.get(args.setupStateId);
    if (setupState === null || setupState.state !== args.state) {
      throw new Error("GitHub App setup state changed.");
    }
    if (setupState.expiresAt < Date.now()) {
      throw new Error("GitHub App setup state expired.");
    }
    if (setupState.purpose !== "user_authorization") {
      throw new Error("GitHub App setup state purpose changed.");
    }
    const viewer = await ctx.runQuery(internal.functions.resolveViewerForUserId, {
      userId: setupState.userId,
    });
    if (viewer.user === null || !canAccess("access_provider_connections", viewer.accessKeys)) {
      await ctx.db.delete(setupState._id);
      return { status: "access_lost" };
    }

    if (
      setupState.githubSignInProviderAccountId === undefined ||
      setupState.githubSignInProviderAccountId !== args.githubUserId
    ) {
      await ctx.db.delete(setupState._id);
      return { status: "github_sign_in_mismatch" };
    }
    const signInMatch = await readGitHubSignInMatch(ctx.db, {
      userId: setupState.userId,
      githubUserId: args.githubUserId,
    });
    if (signInMatch !== "matched") {
      await ctx.db.delete(setupState._id);
      return {
        status: signInMatch === "missing" ? "github_sign_in_required" : "github_sign_in_mismatch",
      };
    }

    const displacedAccessToken = await upsertGitHubUserAuthorization(ctx.db, {
      userId: setupState.userId,
      githubUserId: args.githubUserId,
      githubUserLogin: args.githubUserLogin,
      accessToken: args.accessToken,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      refreshToken: args.refreshToken,
      refreshTokenExpiresAt: args.refreshTokenExpiresAt,
    });
    await ctx.db.delete(setupState._id);
    return {
      status: "stored",
      displacedAccessToken: displacedAccessToken ?? undefined,
    };
  },
});

export const getGitHubAppInstallationUrl = mutation({
  access: "access_app_create",
  args: {
    returnToPath: optional(string()),
  },
  returns: vGitHubAuthorizationStart,
  handler: async (ctx, args) => {
    await requireMatchingGitHubUserAuthorization(ctx.db, ctx.viewer.userId);
    const configuration = getGitHubAppConfiguration();
    return {
      callbackOrigin: new URL(configuration.oauthCallbackUrl).origin,
      setupUrl: await buildGitHubAppSetupUrl(ctx, ctx.viewer.userId, args.returnToPath),
    };
  },
});

export const getGitHubAppReconnectUrl = mutation({
  access: "access_app_create",
  args: {
    organizationId: id("organizations"),
    returnToPath: optional(string()),
  },
  returns: vGitHubAuthorizationStart,
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationOwnerAccessContext(ctx.db, {
      organizationId: args.organizationId,
      userId: ctx.viewer.userId,
    });
    const organization = await ctx.db.get(organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    await requireMatchingGitHubUserAuthorization(ctx.db, ctx.viewer.userId);
    const configuration = getGitHubAppConfiguration();
    return {
      callbackOrigin: new URL(configuration.oauthCallbackUrl).origin,
      setupUrl: await buildGitHubAppReconnectSetupUrl(ctx, {
        organizationId,
        returnToPath: args.returnToPath,
        userId: ctx.viewer.userId,
      }),
    };
  },
});

export const getGitHubUserAuthorizationUrl = mutation({
  access: "access_provider_connections",
  args: {
    returnToPath: optional(string()),
  },
  returns: vGitHubAuthorizationStart,
  handler: async (ctx, args) => {
    const configuration = getGitHubAppConfiguration();
    return {
      callbackOrigin: new URL(configuration.oauthCallbackUrl).origin,
      setupUrl: await buildGitHubUserAuthorizationSetupUrl(ctx, {
        returnToPath: args.returnToPath,
        userId: ctx.viewer.userId,
      }),
    };
  },
});

function readGitHubAuthorizationProvider(
  purpose: GitHubAppSetupPurpose,
): Extract<AuthorizationProvider, "github-app" | "github-user"> {
  switch (purpose) {
    case "installation":
    case "installation_reconnect":
      return "github-app";
    case "user_authorization":
      return "github-user";
    default:
      purpose satisfies never;
      return "github-app";
  }
}

export const finishGitHubAppInstallation = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (state === null) {
    return new Response("Missing GitHub App setup parameters", { status: 400 });
  }

  const setupState: GitHubAppSetupStateResult = await ctx.runQuery(
    internal.githubAppInstallation.getSetupStateByState,
    {
      state,
    },
  );
  if (setupState === null) {
    return new Response("Invalid GitHub App setup state", { status: 400 });
  }
  const returnUrl = buildGitHubAppSetupReturnUrl({
    configuredAppUrl: process.env["SITE_URL"] ?? process.env["CONVEX_SITE_URL"],
    requestUrl: request.url,
    returnToPath: setupState.returnToPath,
  });
  const provider = readGitHubAuthorizationProvider(setupState.purpose);
  {
    if (setupState.expiresAt < Date.now()) {
      await ctx.runMutation(internal.githubAppInstallation.deleteSetupState, {
        setupStateId: setupState.setupStateId,
      });
      console.log("github:authorization:callback_completed", {
        outcome: "expired",
        purpose: setupState.purpose,
      });
      return buildAuthorizationCompletionResponse({
        eventType: "github-app-setup-complete",
        returnUrl: buildAuthorizationErrorUrl(returnUrl, { provider, code: "expired" }),
        title: "GitHub App setup",
      });
    }

    if (error !== null) {
      const errorCode = classifyAuthorizationCallbackError(error);
      await ctx.runMutation(internal.githubAppInstallation.deleteSetupState, {
        setupStateId: setupState.setupStateId,
      });
      console.log("github:authorization:callback_completed", {
        outcome: errorCode,
        purpose: setupState.purpose,
      });
      return buildAuthorizationCompletionResponse({
        eventType: "github-app-setup-complete",
        returnUrl: buildAuthorizationErrorUrl(returnUrl, { provider, code: errorCode }),
        title: "GitHub App setup",
      });
    }

    let completionReturnUrl = returnUrl;
    try {
      switch (setupState.purpose) {
        case "installation":
        case "installation_reconnect": {
          const installationId = parseInstallationId(url.searchParams.get("installation_id"));
          if (installationId === null) {
            throw new Error("GitHub App installation ID is missing.");
          }
          const authorization = await resolveGitHubUserAuthorizationForAppConnection(
            ctx,
            setupState.userId,
          );
          if (authorization.status !== "ready") {
            throw new Error("A matching GitHub user authorization is required.");
          }
          if (setupState.githubSignInProviderAccountId !== authorization.githubUserId) {
            throw new Error("The linked GitHub sign-in changed during App setup.");
          }
          const installation = await verifyGitHubAppConnectionInstallation({
            octokit: authorization.octokit,
            githubUserId: authorization.githubUserId,
            installationId: String(installationId),
          });
          if (!installation.canManage) {
            throw new Error("GitHub organization administrator verification failed.");
          }
          const completion: GitHubAppSetupCompletion = await ctx.runMutation(
            internal.githubAppInstallation.completeVerifiedSetup,
            {
              setupStateId: setupState.setupStateId,
              state,
              installationId: installation.installationId,
              githubOwnerId: installation.githubOwnerId,
              githubOwnerType: installation.githubOwnerType,
              githubOwnerLogin: installation.githubOwnerLogin,
              githubUserId: authorization.githubUserId,
            },
          );
          switch (completion.status) {
            case "stored":
              if (setupState.purpose === "installation_reconnect") {
                completionReturnUrl = buildGitHubOrganizationProvidersReturnUrl({
                  githubOwnerLogin: completion.githubOwnerLogin,
                  previousReturnUrl: returnUrl,
                });
              }
              break;
            case "access_lost":
              completionReturnUrl = buildAuthorizationErrorUrl(returnUrl, {
                provider,
                code: "access-changed",
              });
              break;
            case "github_sign_in_required":
              completionReturnUrl = buildAuthorizationErrorUrl(returnUrl, {
                provider,
                code: "github-sign-in-required",
              });
              break;
            case "github_sign_in_mismatch":
              completionReturnUrl = buildAuthorizationErrorUrl(returnUrl, {
                provider,
                code: "github-sign-in-mismatch",
              });
              break;
            case "authorization_required":
              completionReturnUrl = buildAuthorizationErrorUrl(returnUrl, {
                provider: "github-user",
                code: "failed",
              });
              break;
            case "target_mismatch":
              completionReturnUrl = buildAuthorizationErrorUrl(
                buildGitHubOrganizationProvidersReturnUrl({
                  githubOwnerLogin: completion.githubOwnerLogin,
                  previousReturnUrl: returnUrl,
                }),
                {
                  provider,
                  code: "target-mismatch",
                },
              );
              break;
            case "organization_owner_required":
              completionReturnUrl = buildAuthorizationErrorUrl(
                buildGitHubOrganizationProvidersReturnUrl({
                  githubOwnerLogin: completion.githubOwnerLogin,
                  previousReturnUrl: returnUrl,
                }),
                {
                  provider,
                  code: "organization-owner-required",
                },
              );
              break;
            default:
              completion satisfies never;
          }
          console.log("github:authorization:callback_completed", {
            outcome: completion.status,
            purpose: setupState.purpose,
          });
          break;
        }
        case "user_authorization": {
          if (code === null) {
            throw new Error("GitHub OAuth code is missing.");
          }
          const authorization = await verifyGitHubUserAuthorization({ code, state });
          let completion: Infer<typeof vGitHubUserAuthorizationCompletion>;
          try {
            completion = await ctx.runMutation(
              internal.githubAppInstallation.completeUserAuthorization,
              {
                setupStateId: setupState.setupStateId,
                state,
                accessToken: await sealSecret(ctx, {
                  plaintext: authorization.accessToken,
                  aad: githubUserAuthorizationAad(setupState.userId, "accessToken"),
                }),
                accessTokenExpiresAt: authorization.accessTokenExpiresAt,
                refreshToken: await sealSecret(ctx, {
                  plaintext: authorization.refreshToken,
                  aad: githubUserAuthorizationAad(setupState.userId, "refreshToken"),
                }),
                refreshTokenExpiresAt: authorization.refreshTokenExpiresAt,
                githubUserId: authorization.githubUserId,
                githubUserLogin: authorization.githubUserLogin,
              },
            );
          } catch (error) {
            await revokeUncommittedGitHubUserToken(authorization.accessToken);
            throw error;
          }
          switch (completion.status) {
            case "stored":
              break;
            case "access_lost":
              completionReturnUrl = buildAuthorizationErrorUrl(returnUrl, {
                provider,
                code: "access-changed",
              });
              break;
            case "github_sign_in_required":
              completionReturnUrl = buildAuthorizationErrorUrl(returnUrl, {
                provider,
                code: "github-sign-in-required",
              });
              break;
            case "github_sign_in_mismatch":
              completionReturnUrl = buildAuthorizationErrorUrl(returnUrl, {
                provider,
                code: "github-sign-in-mismatch",
              });
              break;
            default:
              completion satisfies never;
          }
          if (completion.status !== "stored") {
            await revokeUncommittedGitHubUserToken(authorization.accessToken);
          } else if (completion.displacedAccessToken !== undefined) {
            const displacedAccessToken = await openSecret({
              sealed: completion.displacedAccessToken,
              aad: githubUserAuthorizationAad(setupState.userId, "accessToken"),
            });
            if (displacedAccessToken !== authorization.accessToken) {
              await revokeUncommittedGitHubUserToken(displacedAccessToken);
            }
          }
          console.log("github:authorization:callback_completed", {
            outcome: completion.status,
            purpose: setupState.purpose,
          });
          break;
        }
        default:
          setupState.purpose satisfies never;
      }
    } catch (error) {
      await ctx.runMutation(internal.githubAppInstallation.deleteSetupState, {
        setupStateId: setupState.setupStateId,
      });
      console.error("github:authorization:callback_failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        outcome: "failed",
        purpose: setupState.purpose,
      });
      completionReturnUrl = buildAuthorizationErrorUrl(returnUrl, {
        provider,
        code: "failed",
      });
    }

    return buildAuthorizationCompletionResponse({
      eventType: "github-app-setup-complete",
      returnUrl: completionReturnUrl,
      title: "GitHub App setup",
    });
  }
});
