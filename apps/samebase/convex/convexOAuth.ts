import { v } from "convex/values";
import { internalMutation, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation } from "./functions";
import { requireOrganizationOwnerAccessContext } from "./organizationAccess";
import { connectConvexCredential } from "./organizationProviderCredentials";
import { organizationProviderCredentialAad } from "./organization/providerCredentialModel";
import { sealSecret, vSealedSecret } from "./sealedSecret";
import { vProviderOAuthStoreResult, type ProviderOAuthStoreResult } from "./oauthState";
import { fetchConvexTeamTokenDetails } from "./convexManagementApi/client";
import { buildAuthorizationErrorUrl } from "../shared/authorizationError";
import { buildProviderOAuthStoreReturnUrl } from "./authorizationCompletion";
import { buildResourceOAuthUrl, exchangeResourceOAuthCode } from "./hubResourceOAuth";

export const storeConvexOauthTokens = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    connectedByUserId: v.id("users"),
    expectedProviderSnapshotHash: v.string(),
    accessToken: vSealedSecret,
    teamId: v.string(),
    oauthStateId: v.id("providerOAuthCallbackStates"),
    oauthState: v.string(),
  },
  returns: vProviderOAuthStoreResult,
  handler: async (ctx, args) => {
    return await connectConvexCredential(ctx, {
      organizationId: args.organizationId,
      connectedByUserId: args.connectedByUserId,
      expectedProviderSnapshotHash: args.expectedProviderSnapshotHash,
      auth: {
        method: "oauth",
        credential: args.accessToken,
      },
      teamId: args.teamId,
      oauthStateId: args.oauthStateId,
      oauthState: args.oauthState,
    });
  },
});

export const getConvexOAuthUrl = mutation({
  access: "access_provider_connections",
  args: {
    organizationId: v.id("organizations"),
    returnToPath: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationOwnerAccessContext(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    return await buildResourceOAuthUrl(ctx, {
      provider: "convex",
      userId: ctx.viewer.userId,
      organizationId,
      returnToPath: args.returnToPath,
    });
  },
});

export async function completeConvexOAuth(
  ctx: ActionCtx,
  args: {
    code: string;
    oauthState: Extract<Doc<"providerOAuthCallbackStates">, { provider: "convex" }>;
    returnUrl: string;
  },
): Promise<string> {
  const { code, oauthState, returnUrl } = args;

  if (!oauthState.codeVerifier) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    return buildAuthorizationErrorUrl(returnUrl, {
      provider: "convex",
      code: "failed",
    });
  }

  try {
    await ctx.runQuery(internal.organizationAccess.requireOrganizationOwnerIdForUser, {
      userId: oauthState.userId,
      organizationId: oauthState.organizationId,
    });
  } catch {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.log("convex:oauth:callback_completed", {
      organizationId: oauthState.organizationId,
      outcome: "access-changed",
    });
    return buildAuthorizationErrorUrl(returnUrl, {
      provider: "convex",
      code: "access-changed",
    });
  }

  let completionReturnUrl = returnUrl;
  try {
    const token = await exchangeResourceOAuthCode({
      provider: "convex",
      code,
      codeVerifier: oauthState.codeVerifier,
    });

    const details = await fetchConvexTeamTokenDetails(token.access_token);

    const storeResult: ProviderOAuthStoreResult = await ctx.runMutation(
      internal.convexOAuth.storeConvexOauthTokens,
      {
        organizationId: oauthState.organizationId,
        connectedByUserId: oauthState.userId,
        expectedProviderSnapshotHash: oauthState.expectedProviderSnapshotHash,
        accessToken: await sealSecret(ctx, {
          plaintext: token.access_token,
          aad: organizationProviderCredentialAad(
            oauthState.organizationId,
            "convex.auth.credential",
          ),
        }),
        teamId: details.teamId,
        oauthStateId: oauthState._id,
        oauthState: oauthState.state,
      },
    );
    completionReturnUrl = buildProviderOAuthStoreReturnUrl({
      provider: "convex",
      returnUrl,
      storeResult,
    });
    if (storeResult.status !== "stored") {
      console.log("convex:oauth:callback_completed", {
        organizationId: oauthState.organizationId,
        outcome: storeResult.status,
      });
    }
  } catch (error) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.error("convex:oauth:exchange_failed", {
      organizationId: oauthState.organizationId,
      outcome: "failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    completionReturnUrl = buildAuthorizationErrorUrl(returnUrl, {
      provider: "convex",
      code: "failed",
    });
  }

  return completionReturnUrl;
}
