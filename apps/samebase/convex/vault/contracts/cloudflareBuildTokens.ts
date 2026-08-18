import { v, type Infer } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

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
API token id. For managed app creation, use an available lastUsedBuildTokenUuid without asking. If
there is no available last-used UUID, use one result or ask the user to choose by displayed name and
UUID when several results exist. Pass that exact UUID in the required cloudflareBuildTokenUuid
field. Only when this current list is empty, pass explicit null in that required field. The managed
run then creates the GitHub repository and Convex project but no Cloudflare Worker. Report
Cloudflare setup as pending and give the user https://samebase.com/docs/cloudflare-setup.

Manual Worker creation and Workers Builds configuration require one exact UUID from a non-empty
current list. When the list is empty, do not call those writes. Use current vault inventory to
select the next action:

- For a managed plan with a null build token, no attached Worker, and the exact planned Convex
  project attached, give the user https://samebase.com/docs/cloudflare-setup. After the user creates
  the first account token and deletes the temporary Worker, list tokens again and call
  vault_cloudflare_createWorker with a current exact UUID. Reread inventory, then call
  vault_cloudflare_rotateConvexDeployKeysForWorkersBuilds with the new Worker and attached project.
- When a Worker is already attached, keep it. After the user completes token setup, list tokens
  again and call vault_cloudflare_configureWorkersBuildsForGitHub for that attachment. Do not create
  another Worker.
- For another manual vault, complete token setup, list tokens again, and continue only with the
  action that matches the user's request and current inventory. Worker creation does not install
  Convex deploy keys.

Never pass null to a manual Worker or Builds write.`,
} as const;

export type CloudflareWorkersBuildTokens = Infer<typeof vCloudflareWorkersBuildTokens>;
