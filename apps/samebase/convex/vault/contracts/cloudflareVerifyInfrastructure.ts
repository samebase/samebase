import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id } = v;

export const cloudflareVerifyInfrastructureContract = {
  id: "verify_infrastructure",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: v.null(),
  mcp: {
    title: "Verify infrastructure",
    name: "vault_cloudflare_verifyInfrastructure",
    description:
      "Verify the app's recorded Cloudflare infrastructure: Workers Builds trigger IDs and Convex deploy-key variables, then mark stale Samebase records as repairable.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id of the app whose Cloudflare infrastructure should be verified.",
      workerId: "Stable Samebase id of the Worker whose infrastructure should be verified.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `Checks Samebase's recorded Cloudflare Worker infrastructure against the caller's own
Cloudflare account: recorded Workers Builds production and preview trigger ids must still exist on
the Worker. When that Worker has a Convex deployment dependency, its production trigger must expose
\`CONVEX_DEPLOY_KEY\` and its preview trigger must expose \`PREVIEW_CONVEX_DEPLOY_KEY\`.

Convex build-access verification checks both name and secret classification. Cloudflare does not
return secret values, so verification cannot prove that a present secret contains the current key;
the repair action rotates and rewrites fresh values for this dependency only.

Provider access is read-only. Samebase only writes registry corrections: missing recorded triggers
make the Worker repairable through \`wire_builds\`; missing deploy-key variables make it repairable
through \`wire_convex_build_access\`. A missing Convex deployment is repaired by reconnecting or
retrying Convex deployment provisioning, not by writing build-access variables. Provider errors,
missing connections, or an unreadable Worker are recorded as unverifiable and do not change the
Worker row.`,
} as const;
