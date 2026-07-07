import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../shared/convexFunctionPolicyTypes";

const { array, object, string } = v;

export const vCloudflareAccountResult = object({
  accountId: string(),
  accountName: string(),
});

export const cloudflareListAccountsContract = {
  id: "list_cloudflare_accounts",
  access: ACCESS_APP_CREATE,
  args: {},
  returns: array(vCloudflareAccountResult),
  mcp: {
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
connected Cloudflare login. Use the chosen \`accountId\` with \`list_cloudflare_workers\` and
\`connect_cloudflare_worker\`. Requires a Cloudflare provider connection; reads from Cloudflare's
API and writes nothing.`,
} as const;
