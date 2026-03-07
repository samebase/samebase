import { httpRouter } from "convex/server";
import { auth } from "./auth";
import {
  finishCloudflareMcpOAuth,
  startCloudflareMcpOAuth,
} from "./cloudflareMcpOAuth";
import { finishConvexOAuth, startConvexOAuth } from "./convexOAuth";
import { finishGithubOAuth, startGithubOAuth } from "./githubOAuth";
import {
  authorizeMcpOauthRequest,
  exchangeMcpOauthToken,
  getMcpOauthAuthorizationServerMetadata,
  getMcpOauthProtectedResourceMetadata,
  handleMcpRequest,
  registerMcpOauthClient,
} from "./mcp/http";
import { finishNetlifyOAuthCallback, startNetlifyOAuth } from "./netlifyOAuth";
import { handlePolarWebhook } from "./polarWebhooks";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/oauth/convex/start",
  method: "GET",
  handler: startConvexOAuth,
});

http.route({
  path: "/oauth/convex/callback",
  method: "GET",
  handler: finishConvexOAuth,
});

http.route({
  path: "/oauth/cloudflare-mcp/start",
  method: "GET",
  handler: startCloudflareMcpOAuth,
});

http.route({
  path: "/oauth/cloudflare-mcp/callback",
  method: "GET",
  handler: finishCloudflareMcpOAuth,
});

http.route({
  path: "/oauth/github/start",
  method: "GET",
  handler: startGithubOAuth,
});

http.route({
  path: "/oauth/github/callback",
  method: "GET",
  handler: finishGithubOAuth,
});

http.route({
  path: "/oauth/netlify/start",
  method: "GET",
  handler: startNetlifyOAuth,
});

http.route({
  path: "/oauth/netlify/callback",
  method: "GET",
  handler: finishNetlifyOAuthCallback,
});

http.route({
  path: "/.well-known/oauth-protected-resource",
  method: "GET",
  handler: getMcpOauthProtectedResourceMetadata,
});

http.route({
  path: "/.well-known/oauth-authorization-server",
  method: "GET",
  handler: getMcpOauthAuthorizationServerMetadata,
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
  path: "/webhooks/polar",
  method: "POST",
  handler: handlePolarWebhook,
});

export default http;
