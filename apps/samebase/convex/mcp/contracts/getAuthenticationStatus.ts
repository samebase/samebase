import { v } from "convex/values";

import { vAccessKey, vViewerRole } from "../../accessModelValidators";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, boolean, id, null: nullValue, object, optional, string, union } = v;

const vMcpAuthenticationStatusUser = object({
  userId: id("users"),
  name: optional(string()),
  email: optional(string()),
});

const vMcpAuthenticationStatus = object({
  authenticated: boolean(),
  user: union(vMcpAuthenticationStatusUser, nullValue()),
  role: vViewerRole,
  accessKeys: array(vAccessKey),
  grantedScopes: array(string()),
});

export const getAuthenticationStatusContract = {
  id: "get_authentication_status",
  access: "access_public",
  args: {},
  returns: vMcpAuthenticationStatus,
  structuredContent: object({ authentication: vMcpAuthenticationStatus }),
  mcp: {
    name: "samebase_auth_getAuthenticationStatus",
    description:
      "Read the caller's current Samebase MCP authentication state: account identity, role, access keys, and OAuth token scopes.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {},
  } satisfies AppFunctionMcpMetadata,
  doc: `Returns the current MCP caller's Samebase authentication state for the bearer token used
on the request: whether it still resolves to an active Samebase account, the account identity,
the current Samebase role and access keys, and the OAuth scopes granted to this MCP token.

Use this first when an MCP client needs to explain "am I connected, which account am I connected
as, and what can this token currently do?" A valid token for a deleted or otherwise unresolved
account returns \`authenticated: false\` with the current public access shape; invalid or missing
tokens are rejected by the MCP HTTP endpoint before any tool runs.`,
} as const;
