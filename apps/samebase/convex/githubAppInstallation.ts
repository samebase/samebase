import { v, type Infer } from "convex/values";

import {
  buildGitHubAppInstallationUrl,
  buildGitHubAppSetupReturnUrl,
  buildGitHubUserAuthorizationUrl,
  GITHUB_APP_SETUP_POPUP_NAME,
  isSafeGitHubAppReturnToPath,
} from "../shared/githubApp";
import { canAccess } from "../shared/accessModel";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import {
  getGitHubAppConfiguration,
  verifyGitHubAppInstallation,
  verifyGitHubUserAuthorization,
} from "./githubApp";
import { vGitHubAppSetupPurpose } from "./githubAppSetupModel";
import { upsertGitHubUserAuthorization } from "./githubUserAuthorizations";
import { mutation } from "./functions";
import { OAUTH_STATE_TTL_MS, randomToken } from "./oauthUtils";
import { vGitHubOwnerType } from "./organizationModel";

const { boolean, id, number, object, optional, string, union } = v;

const vGitHubAppSetupStateResult = union(
  object({
    setupStateId: id("githubAppSetupStates"),
    userId: id("users"),
    state: string(),
    purpose: vGitHubAppSetupPurpose,
    returnToPath: optional(string()),
    expiresAt: number(),
  }),
  v.null(),
);

const vGitHubAppSetupCompletion = object({
  organizationId: id("organizations"),
  created: boolean(),
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

async function createGitHubAppSetupState(
  ctx: MutationCtx,
  userId: Id<"users">,
  purpose: GitHubAppSetupPurpose,
  returnToPath?: string,
): Promise<string> {
  const state = randomToken();
  const normalizedReturnToPath =
    returnToPath !== undefined && isSafeGitHubAppReturnToPath(returnToPath)
      ? returnToPath
      : undefined;
  const now = Date.now();
  await ctx.runMutation(internal.githubAppInstallation.createSetupState, {
    userId,
    state,
    purpose,
    returnToPath: normalizedReturnToPath,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  return state;
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
  userId: Id<"users">,
  returnToPath?: string,
): Promise<string> {
  const configuration = getGitHubAppConfiguration();
  const state = await createGitHubAppSetupState(ctx, userId, "user_authorization", returnToPath);
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
    returnToPath: optional(string()),
    createdAt: number(),
    expiresAt: number(),
  },
  returns: id("githubAppSetupStates"),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null || user.accountDeletion !== undefined) {
      throw new Error("An active Samebase user is required.");
    }
    if (args.expiresAt <= args.createdAt) {
      throw new Error("GitHub App setup state expiry must follow creation.");
    }
    if (args.returnToPath !== undefined && !isSafeGitHubAppReturnToPath(args.returnToPath)) {
      throw new Error("GitHub App setup return path is invalid.");
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

    return {
      setupStateId: setupState._id,
      userId: setupState.userId,
      state: setupState.state,
      purpose: setupState.purpose ?? "installation",
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
    await ctx.db.delete(args.setupStateId);
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
    githubUserLogin: string(),
    accessToken: string(),
    accessTokenExpiresAt: number(),
    refreshToken: string(),
    refreshTokenExpiresAt: number(),
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
    if ((setupState.purpose ?? "installation") !== "installation") {
      throw new Error("GitHub App setup state purpose changed.");
    }

    const result: GitHubAppSetupCompletion = await ctx.runMutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId: setupState.userId,
        githubOwnerId: args.githubOwnerId,
        githubOwnerType: args.githubOwnerType,
        githubOwnerLogin: args.githubOwnerLogin,
        githubInstallationId: args.installationId,
      },
    );

    if (args.githubOwnerType === "user") {
      if (args.githubOwnerId !== args.githubUserId) {
        throw new Error("GitHub user identity does not match the personal owner.");
      }
      await upsertGitHubUserAuthorization(ctx.db, {
        userId: setupState.userId,
        githubUserId: args.githubUserId,
        githubUserLogin: args.githubUserLogin,
        accessToken: args.accessToken,
        accessTokenExpiresAt: args.accessTokenExpiresAt,
        refreshToken: args.refreshToken,
        refreshTokenExpiresAt: args.refreshTokenExpiresAt,
      });
    }

    await ctx.db.delete(setupState._id);
    return result;
  },
});

export const completeUserAuthorization = internalMutation({
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
  returns: v.null(),
  handler: async (ctx, args) => {
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
      throw new Error("Access denied");
    }

    await upsertGitHubUserAuthorization(ctx.db, {
      userId: setupState.userId,
      githubUserId: args.githubUserId,
      githubUserLogin: args.githubUserLogin,
      accessToken: args.accessToken,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      refreshToken: args.refreshToken,
      refreshTokenExpiresAt: args.refreshTokenExpiresAt,
    });
    await ctx.db.delete(setupState._id);
    return null;
  },
});

export const getGitHubAppInstallationUrl = mutation({
  access: "access_app_create",
  args: {
    returnToPath: optional(string()),
  },
  returns: string(),
  handler: async (ctx, args) => {
    return await buildGitHubAppSetupUrl(ctx, ctx.viewer.userId, args.returnToPath);
  },
});

export const getGitHubUserAuthorizationUrl = mutation({
  access: "access_provider_connections",
  args: {
    returnToPath: optional(string()),
  },
  returns: string(),
  handler: async (ctx, args) => {
    return await buildGitHubUserAuthorizationSetupUrl(ctx, ctx.viewer.userId, args.returnToPath);
  },
});

function buildSetupCompletionHtml(returnUrl: string): string {
  const serializedReturnUrl = JSON.stringify(returnUrl).replace(/</g, "\\u003c");
  const serializedPopupName = JSON.stringify(GITHUB_APP_SETUP_POPUP_NAME);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GitHub App setup</title>
  </head>
  <body>
    <script>
      (function () {
        const returnTo = ${serializedReturnUrl};
        const popupName = ${serializedPopupName};

        if (window.name === popupName) {
          window.close();
          window.setTimeout(function () {
            window.location.replace(returnTo);
          }, 100);
          return;
        }

        window.location.replace(returnTo);
      })();
    </script>
  </body>
</html>`;
}

export const finishGitHubAppInstallation = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (state === null || (code === null && error === null)) {
    return new Response("Missing GitHub App setup parameters", { status: 400 });
  }

  const setupState = await ctx.runQuery(internal.githubAppInstallation.getSetupStateByState, {
    state,
  });
  if (setupState === null) {
    return new Response("Invalid GitHub App setup state", { status: 400 });
  }
  if (setupState.expiresAt < Date.now()) {
    await ctx.runMutation(internal.githubAppInstallation.deleteSetupState, {
      setupStateId: setupState.setupStateId,
    });
    return new Response("GitHub App setup state expired", { status: 400 });
  }

  const returnUrl = buildGitHubAppSetupReturnUrl({
    configuredAppUrl: process.env["SITE_URL"] ?? process.env["CONVEX_SITE_URL"],
    requestUrl: request.url,
    returnToPath: setupState.returnToPath,
  });
  if (error !== null) {
    await ctx.runMutation(internal.githubAppInstallation.deleteSetupState, {
      setupStateId: setupState.setupStateId,
    });
    return new Response(buildSetupCompletionHtml(returnUrl), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if (code === null) {
    return new Response("Missing GitHub App setup parameters", { status: 400 });
  }

  try {
    switch (setupState.purpose) {
      case "installation": {
        const installationId = parseInstallationId(url.searchParams.get("installation_id"));
        if (installationId === null) {
          return new Response("Missing GitHub App setup parameters", { status: 400 });
        }
        const installation = await verifyGitHubAppInstallation({
          code,
          state,
          installationId,
        });
        await ctx.runMutation(internal.githubAppInstallation.completeVerifiedSetup, {
          setupStateId: setupState.setupStateId,
          state,
          ...installation,
        });
        break;
      }
      case "user_authorization": {
        const authorization = await verifyGitHubUserAuthorization({ code, state });
        await ctx.runMutation(internal.githubAppInstallation.completeUserAuthorization, {
          setupStateId: setupState.setupStateId,
          state,
          ...authorization,
        });
        break;
      }
      default:
        setupState.purpose satisfies never;
    }
  } catch {
    await ctx.runMutation(internal.githubAppInstallation.deleteSetupState, {
      setupStateId: setupState.setupStateId,
    });
    const message =
      setupState.purpose === "installation"
        ? "GitHub App installation could not be verified"
        : "GitHub user authorization could not be verified";
    return new Response(message, { status: 400 });
  }

  return new Response(buildSetupCompletionHtml(returnUrl), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
