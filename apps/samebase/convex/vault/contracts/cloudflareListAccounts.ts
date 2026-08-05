import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, id, object, string } = v;

export const vCloudflareAccountResult = object({
  accountId: string(),
  accountName: string(),
});

export const cloudflareListAccountsContract = {
  id: "list_cloudflare_accounts",
  access: "access_provider_connections",
  args: { organizationId: id("organizations") },
  mcpArgs: { vaultId: id("vaults") },
  returns: array(vCloudflareAccountResult),
  structuredContent: object({ accounts: array(vCloudflareAccountResult) }),
  mcp: {
    title: "List Cloudflare accounts",
    name: "vault_cloudflare_listAccounts",
    description:
      "List Cloudflare accounts for manual Worker discovery, attachment, or creation on an existing connected vault. This is not a managed app creation preflight.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Existing Samebase vault whose selected Cloudflare connection is used.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Discovery read for manual existing-Worker attachment or new-Worker creation on an existing
connected vault: returns the accounts on the vault organization's selected Cloudflare connection. Use the chosen
\`accountId\` with \`discover_cloudflare_workers\`, then attach one or more verified results with
\`attach_cloudflare_workers\`, or create and attach a new Worker with
\`create_cloudflare_worker\`. This action is not a preflight for
\`vault_actions_createRepository\`. Managed app creation uses the connected Cloudflare provider and
does not accept an \`accountId\`. Requires a Cloudflare provider connection; reads from
Cloudflare's API. The only writes are Samebase's own connection bookkeeping (OAuth token refresh
and token health) when the connection needs it.`,
} as const;
