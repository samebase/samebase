import { httpRouter } from "convex/server";
import { routeAll } from "@samebase/convex-hosting";
import { finishCloudflareOAuth } from "./cloudflareOAuth";
import { finishCloudflareMcpOAuth } from "./cloudflareMcpOAuth";
import { finishConvexOAuth } from "./convexOAuth";
import { finishGitHubAppInstallation } from "./githubAppInstallation";
import {
  authorizeMcpOauthRequest,
  exchangeMcpOauthToken,
  getMcpOauthAuthorizationServerMetadata,
  getMcpOauthAuthorizationServerMetadataForMcpPath,
  getMcpOauthProtectedResourceMetadata,
  handleMcpRequest,
  registerMcpOauthClient,
  rejectMcpUnsupportedTransportMethod,
} from "./mcp/http";
import { handlePolarWebhook } from "./polarWebhooks";
import { components } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import { versionId } from "../.convex-hosting/version.js";

const http = httpRouter();

const openAiAppsChallenge = httpAction(async () => {
  const token = env.OPENAI_APPS_CHALLENGE_TOKEN?.trim();
  if (!token) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(token, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});

http.route({
  path: "/oauth/convex/callback",
  method: "GET",
  handler: finishConvexOAuth,
});

http.route({
  path: "/oauth/cloudflare/callback",
  method: "GET",
  handler: finishCloudflareOAuth,
});

http.route({
  path: "/oauth/cloudflare-mcp/callback",
  method: "GET",
  handler: finishCloudflareMcpOAuth,
});

http.route({
  path: "/oauth/github/callback",
  method: "GET",
  handler: finishGitHubAppInstallation,
});

http.route({
  path: "/.well-known/oauth-protected-resource",
  method: "GET",
  handler: getMcpOauthProtectedResourceMetadata,
});

http.route({
  path: "/.well-known/openai-apps-challenge",
  method: "GET",
  handler: openAiAppsChallenge,
});

http.route({
  path: "/.well-known/oauth-protected-resource/mcp",
  method: "GET",
  handler: getMcpOauthProtectedResourceMetadata,
});

http.route({
  path: "/.well-known/oauth-authorization-server",
  method: "GET",
  handler: getMcpOauthAuthorizationServerMetadata,
});

http.route({
  path: "/.well-known/oauth-authorization-server/mcp",
  method: "GET",
  handler: getMcpOauthAuthorizationServerMetadataForMcpPath,
});

http.route({
  path: "/oauth/mcp/register",
  method: "POST",
  handler: registerMcpOauthClient,
});

http.route({
  path: "/oauth/mcp/authorize",
  method: "GET",
  handler: authorizeMcpOauthRequest,
});

http.route({
  path: "/oauth/mcp/token",
  method: "POST",
  handler: exchangeMcpOauthToken,
});

http.route({
  path: "/mcp",
  method: "POST",
  handler: handleMcpRequest,
});

http.route({
  path: "/mcp",
  method: "GET",
  handler: rejectMcpUnsupportedTransportMethod,
});

http.route({
  path: "/mcp",
  method: "DELETE",
  handler: rejectMcpUnsupportedTransportMethod,
});

http.route({
  path: "/webhooks/polar",
  method: "POST",
  handler: handlePolarWebhook,
});

// The built site, every method at every path, as a Cloudflare Worker with static assets: Convex
// matches an exact path first, then the longest prefix, so every route above keeps winning.
// `pnpm run deploy` writes dist/client and .convex-hosting/version.js.
routeAll(http, components.hosting, versionId);

export default http;
