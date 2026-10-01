import { v } from "convex/values";

import { ACCESS_BROWSER_LOGIN_HANDOFF } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { number, object, optional, string } = v;

const vCreateBrowserHandoffResult = object({
  url: string(),
  expiresAt: number(),
});

export const createBrowserHandoffContract = {
  id: "create_browser_handoff",
  access: ACCESS_BROWSER_LOGIN_HANDOFF,
  args: {
    returnToPath: optional(string()),
  },
  returns: vCreateBrowserHandoffResult,
  structuredContent: vCreateBrowserHandoffResult,
  mcp: {
    title: "Create browser handoff",
    name: "create_browser_handoff",
    description:
      "Create a one-time Samebase browser sign-in URL for the MCP grant's current user. Show the returned URL to the user as a clickable link. It expires after 5 minutes. Keep the link private. Only claim that the dashboard opened when a browser action confirms it.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      returnToPath:
        "Optional Samebase-relative path to open after the browser session is created. Defaults to the dashboard.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Creates a short-lived, one-time browser handoff URL for the Samebase account behind the
current MCP grant. The URL logs a browser into Samebase through Convex Auth after the user or agent
opens it, so the tool requires explicit \`access_browser_login_handoff\` consent.

Preconditions: the MCP grant must include \`access_browser_login_handoff\`, the client and grant
must still be active, and the user must still have current access to browser handoff. The tool never
returns MCP access tokens, MCP refresh tokens, Convex Auth JWTs, or Convex Auth refresh tokens.

The returned URL carries only a one-time bearer fragment and an optional Samebase-relative return
path. Show the returned URL to the user as a clickable link. It expires after 5 minutes. Keep the
link private and open it promptly. Only claim that the dashboard opened when a browser action
confirms it. The backend stores only a token hash and consumes the handoff on successful redemption
or account mismatch.`,
} as const;
