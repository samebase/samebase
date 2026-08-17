import { v, type Infer } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, id, null: vNull, object, string, union } = v;

const vCloudflareWorkersBuildToken = object({
  uuid: string(),
  name: string(),
});

const vCloudflareWorkersBuildTokens = object({
  accountId: string(),
  lastUsedBuildTokenUuid: union(string(), vNull()),
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
      "List the non-secret Workers Builds token names and UUIDs in the Cloudflare account connected to a Samebase organization, with its available last-used UUID.",
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
It also returns lastUsedBuildTokenUuid when that organization default remains in the current list,
or null when it is unavailable. It never returns the token secret or the underlying Cloudflare user
API token id. Pass one returned UUID to app or Worker creation and Workers Builds configuration
actions. Use an available lastUsedBuildTokenUuid without asking. If there is no available last-used
UUID, use one result, ask the user to choose by displayed name and UUID when several results exist,
or tell the user to complete Workers Builds token setup in Cloudflare when the list is empty.`,
} as const;

export type CloudflareWorkersBuildTokens = Infer<typeof vCloudflareWorkersBuildTokens>;
