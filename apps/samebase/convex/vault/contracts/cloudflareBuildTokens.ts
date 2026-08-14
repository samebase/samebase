import { v, type Infer } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, id, object, string } = v;

const vCloudflareWorkersBuildToken = object({
  uuid: string(),
  name: string(),
});

const vCloudflareWorkersBuildTokens = object({
  accountId: string(),
  tokens: array(vCloudflareWorkersBuildToken),
});

export const cloudflareListWorkersBuildTokensContract = {
  id: "list_workers_build_tokens",
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  mcpArgs: {
    githubOwnerLogin: string(),
  },
  returns: vCloudflareWorkersBuildTokens,
  structuredContent: vCloudflareWorkersBuildTokens,
  mcp: {
    title: "List Cloudflare Workers Builds tokens",
    name: "cloudflare_listWorkersBuildTokens",
    description:
      "List the non-secret Workers Builds token names and UUIDs in the Cloudflare account connected to a Samebase organization.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      githubOwnerLogin:
        "GitHub owner login for the Samebase organization whose Cloudflare account must be read.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Lists the Workers Builds token records in the Cloudflare account connected to the selected
Samebase organization. The result contains each token's non-secret name and Workers Builds UUID.
It never returns the token secret or the underlying Cloudflare user API token id. Pass one returned
UUID to app or Worker creation and Workers Builds configuration actions. If the list is empty,
complete Workers Builds token setup in Cloudflare and list again. A single result can be used. For
multiple results, ask the user to choose by the displayed name and UUID.`,
} as const;

export type CloudflareWorkersBuildTokens = Infer<typeof vCloudflareWorkersBuildTokens>;
