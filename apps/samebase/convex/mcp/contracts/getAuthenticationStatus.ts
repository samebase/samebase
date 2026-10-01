import { v, type Infer } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, literal, object, optional, string, union } = v;

const vMcpAuthenticationStatus = union(
  object({
    authenticated: literal(true),
    user: object({
      name: optional(string()),
      email: string(),
    }),
    role: string(),
    grantedScopes: array(string()),
  }),
  object({
    authenticated: literal(false),
  }),
);

export const getAuthenticationStatusContract = {
  id: "get_authentication_status",
  access: "access_public",
  args: {},
  returns: vMcpAuthenticationStatus,
  structuredContent: object({ authentication: vMcpAuthenticationStatus }),
  mcp: {
    title: "Get authentication status",
    name: "samebase_auth_getAuthenticationStatus",
    description:
      "Read the caller's current Samebase MCP authentication state: account identity, role, and granted OAuth scopes.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {},
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Returns the current MCP caller's Samebase authentication state for the bearer token used
on the request: whether it still resolves to an active Samebase account, the account identity,
the current Samebase role, and the granted OAuth scopes.

Use this first when an MCP client needs to explain "am I connected, which account am I connected
as, and what can this token currently do?" A valid token for a deleted or otherwise unresolved
account returns only \`authenticated: false\`; invalid or missing tokens are rejected by the MCP
HTTP endpoint before any tool runs.`,
} as const;

export type McpAuthenticationStatus = Infer<typeof vMcpAuthenticationStatus>;
