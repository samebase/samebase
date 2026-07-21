import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, object, string } = v;

export const vCloudflareAccountResult = object({
  accountId: string(),
  accountName: string(),
});

export const cloudflareListAccountsContract = {
  id: "list_cloudflare_accounts",
  access: "access_provider_connections",
  args: {},
  returns: array(vCloudflareAccountResult),
  structuredContent: object({ accounts: array(vCloudflareAccountResult) }),
  mcp: {
    title: "List Cloudflare accounts",
    name: "vault_cloudflare_listAccounts",
    description:
      "List the Cloudflare accounts available on the caller's connected Cloudflare login, for choosing where a Worker lives.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {},
  } satisfies AppFunctionMcpMetadata,
  doc: `Discovery read for the manual Cloudflare attach flow: returns the accounts on the caller's
connected Cloudflare login. Use the chosen \`accountId\` with \`discover_cloudflare_workers\`, then
attach one or more verified results with \`attach_cloudflare_workers\`. Requires a Cloudflare
provider connection; reads from Cloudflare's API. The only writes are Samebase's own connection
bookkeeping (OAuth token refresh and token health) when the connection needs it.`,
} as const;
