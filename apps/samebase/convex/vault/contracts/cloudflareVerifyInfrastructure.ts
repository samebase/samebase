import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id, string } = v;

export const cloudflareVerifyInfrastructureContract = {
  id: "verify_infrastructure",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
  },
  returns: v.null(),
  mcp: {
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
      appRoot: 'App root within the repository ("." for single-app repositories).',
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `Checks Samebase's recorded Cloudflare Worker infrastructure against the caller's own
Cloudflare account: recorded Workers Builds production and preview trigger ids must still exist on
the Worker, and a Worker marked as having Convex build access must still expose both
\`CONVEX_DEPLOY_KEY\` and \`PREVIEW_CONVEX_DEPLOY_KEY\` on each trigger.

Convex build-access verification is all-or-nothing and name-only: production and preview trigger
variable tables must each contain both deploy-key names. A split layout, such as
\`CONVEX_DEPLOY_KEY\` only on production and \`PREVIEW_CONVEX_DEPLOY_KEY\` only on preview, is
treated as missing. Cloudflare does not return secret values, so verification cannot prove that a
present secret contains the current key; the repair action rotates and rewrites fresh values.

Provider access is read-only. Samebase only writes registry corrections: missing recorded triggers
make the Worker repairable through \`wire_builds\`; missing deploy-key variables, or a wired Worker
with no attached Convex deployment row, make it repairable through \`wire_convex_build_access\`.
Provider errors, missing connections, or an unreadable Worker are recorded as unverifiable and do
not change the Worker row.`,
} as const;
