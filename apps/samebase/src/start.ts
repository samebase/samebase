import { createMiddleware, createStart } from "@tanstack/react-start";
import { AGENT_BROWSER_HANDOFF_ROUTE } from "../shared/agentBrowserHandoff";
import { MCP_CONSENT_APP_PATH } from "../shared/mcpOAuth";
import { PROVIDER_OAUTH_COMPLETION_ROUTE } from "../shared/providerOAuthReturn";

/** Pages that carry a one-time token or a consent decision: no referrer, never indexed. */
const PRIVATE_PATHS = new Set<string>([
  AGENT_BROWSER_HANDOFF_ROUTE,
  MCP_CONSENT_APP_PATH,
  PROVIDER_OAUTH_COMPLETION_ROUTE,
]);

// Runs for every response that Start renders. Every page renders per request with the visitor's
// session, so no cache may keep it, and no other site may frame it.
const pageHeaders = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  const result = await next();
  const { headers } = result.response;
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  if (PRIVATE_PATHS.has(new URL(request.url).pathname.replace(/(.)\/$/, "$1"))) {
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return result;
});

export const startInstance = createStart(() => ({ requestMiddleware: [pageHeaders] }));
