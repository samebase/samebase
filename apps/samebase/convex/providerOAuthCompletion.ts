import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./functions";
import { vOAuthProvider } from "./oauthState";
import { readRequiredEnv } from "./oauthUtils";
import { completeConvexOAuth } from "./convexOAuth";
import { completeCloudflareOAuth } from "./cloudflareOAuth";
import { completeCloudflareMcpOAuth } from "./cloudflareMcpOAuth";
import { buildAuthorizationErrorUrl } from "../shared/authorizationError";
import {
  buildProviderOAuthDefaultReturnUrl,
  readProviderOAuthAuthorizationProvider,
} from "../shared/providerOAuthReturn";
import { parseSiteOrigin } from "../shared/siteOrigin";

const { string } = v;

/**
Links a provider OAuth grant from the app completion page, which receives
`state` and `code` from the provider callback in its URL fragment. The provider
code reaches only the browser that approved the grant, so the signed-in user of
that browser must be the user who started the authorization. Any other account
deletes the callback state, so nobody can link that code afterwards.

Returns the app URL to continue to. Errors return the organization list when
the callback state is unavailable or belongs to another account, and the
Providers page of the authorization's organization otherwise.
*/
export const completeProviderOAuth = action({
  access: "access_provider_connections",
  args: {
    provider: vOAuthProvider,
    state: string(),
    code: string(),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    // CONVEX_SITE_URL is platform-provided, so this matches the app origin of the callback.
    const appOrigin = parseSiteOrigin(
      process.env["SITE_URL"] ?? readRequiredEnv("CONVEX_SITE_URL"),
    );
    const authorizationProvider = readProviderOAuthAuthorizationProvider(args.provider);
    const organizationsUrl = new URL("/org", appOrigin).toString();

    const oauthState = await ctx.runQuery(internal.oauthState.getOauthStateByState, {
      provider: args.provider,
      state: args.state,
    });
    if (oauthState === null) {
      return buildAuthorizationErrorUrl(organizationsUrl, {
        provider: authorizationProvider,
        code: "expired",
      });
    }

    if (oauthState.userId !== ctx.viewer.userId) {
      await ctx.runMutation(internal.oauthState.deleteOauthState, {
        id: oauthState._id,
      });
      console.log("provider:oauth:completion_rejected", {
        provider: args.provider,
        organizationId: oauthState.organizationId,
        outcome: "started-by-another-account",
      });
      return buildAuthorizationErrorUrl(organizationsUrl, {
        provider: authorizationProvider,
        code: "started-by-another-account",
      });
    }

    let returnUrl: string;
    try {
      const githubOwnerLogin: string = await ctx.runQuery(
        internal.organizations.getExternalReturnOwnerLogin,
        {
          organizationId: oauthState.organizationId,
        },
      );
      returnUrl = buildProviderOAuthDefaultReturnUrl({
        appOrigin,
        githubOwnerLogin,
        returnToPath: oauthState.returnToPath,
      });
    } catch {
      await ctx.runMutation(internal.oauthState.deleteOauthState, {
        id: oauthState._id,
      });
      return buildAuthorizationErrorUrl(organizationsUrl, {
        provider: authorizationProvider,
        code: "failed",
      });
    }

    if (oauthState.expiresAt < Date.now()) {
      await ctx.runMutation(internal.oauthState.deleteOauthState, {
        id: oauthState._id,
      });
      console.log("provider:oauth:completion_rejected", {
        provider: args.provider,
        organizationId: oauthState.organizationId,
        outcome: "expired",
      });
      return buildAuthorizationErrorUrl(returnUrl, {
        provider: authorizationProvider,
        code: "expired",
      });
    }

    switch (oauthState.provider) {
      case "convex":
        return await completeConvexOAuth(ctx, { code: args.code, oauthState, returnUrl });
      case "cloudflare":
        return await completeCloudflareOAuth(ctx, { code: args.code, oauthState, returnUrl });
      case "cloudflare_mcp":
        return await completeCloudflareMcpOAuth(ctx, { code: args.code, oauthState, returnUrl });
      default:
        oauthState satisfies never;
        throw new Error("Unsupported OAuth provider.");
    }
  },
});
