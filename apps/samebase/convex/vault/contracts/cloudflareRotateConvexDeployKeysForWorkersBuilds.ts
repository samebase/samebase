import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id } = v;

export const cloudflareRotateConvexDeployKeysForWorkersBuildsContract = {
  id: "rotate_convex_deploy_keys_for_workers_builds",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    workerId: id("vaultCloudflareWorkers"),
    convexProjectId: id("vaultConvexProjects"),
  },
  returns: v.null(),
  mcp: {
    title: "Rotate Convex deploy keys for Workers Builds",
    name: "vault_cloudflare_rotateConvexDeployKeysForWorkersBuilds",
    description:
      "Rotate Samebase-named production and preview Convex deploy keys, then write them with the readable SAMEBASE_CONVEX_PROJECT marker to both Workers Builds triggers.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id containing both resources.",
      workerId: "Stable Samebase Worker attachment id returned by get_user_vaults.",
      convexProjectId: "Attached Convex project selected for this deploy-key rotation.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `The repair for builds that cannot deploy the backend: mints production and preview deploy
keys on the selected Convex project's production and preview scopes. It writes
\`CONVEX_DEPLOY_KEY\`, \`PREVIEW_CONVEX_DEPLOY_KEY\`, and the non-secret
\`SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>\` marker to both Workers
Builds triggers, reads the
variables back, and verifies the marker value, secrecy flags, and required variable names before
starting the production build.

The Worker and project must both be attached to the vault. Their selection is input to this one
operation, not a persisted dependency. Rerunning the operation rotates the Samebase-named keys.
Samebase reads Convex live and stores no completed Worker-to-project, key, or trigger mirror in
Convex.`,
} as const;
