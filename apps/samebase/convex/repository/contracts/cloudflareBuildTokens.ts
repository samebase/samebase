import { v, type Infer } from "convex/values";

const { array, id, object, string, union } = v;

const vCloudflareWorkersBuildToken = object({
  uuid: string(),
  name: string(),
});

const vCloudflareWorkersBuildTokens = object({
  accountId: string(),
  lastUsedBuildTokenUuid: union(string(), v.null()),
  tokens: array(vCloudflareWorkersBuildToken),
});

/** Dashboard-only: the dashboard shows the token list so that a person can choose a token. */
export const cloudflareListWorkersBuildTokensContract = {
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: vCloudflareWorkersBuildTokens,
} as const;

export type CloudflareWorkersBuildTokens = Infer<typeof vCloudflareWorkersBuildTokens>;
