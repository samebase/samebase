import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id } = v;

export const cloudflareWireConvexBuildAccessContract = {
  id: "wire_convex_build_access",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    workerId: id("vaultCloudflareWorkers"),
    convexProjectId: id("vaultConvexProjects"),
  },
  returns: v.null(),
  mcp: {
    title: "Wire Convex build access",
    name: "vault_cloudflare_wireConvexBuildAccess",
    description:
      "Mint Convex deploy keys for the app and place both CONVEX_DEPLOY_KEY and PREVIEW_CONVEX_DEPLOY_KEY into its Workers Builds triggers.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id containing both resources.",
      workerId: "Stable Samebase Worker attachment id returned by get_user_vaults.",
      convexProjectId: "Attached Convex project that the Worker explicitly depends on.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `The repair for builds that cannot deploy the backend: mints production and preview deploy
keys on the selected Convex project's production and preview scopes and writes both keys into each Workers Builds trigger as
\`CONVEX_DEPLOY_KEY\` and \`PREVIEW_CONVEX_DEPLOY_KEY\`. This is the remedy behind
\`nextAction: "wire_convex_build_access"\` on the Worker's \`convexDeployKeys\` axis and the
dashboard's "Set Convex deploy keys" button. It is the same operation.

The Worker-to-project dependency must exist in Samebase first. This explicit action rotates
Samebase-named keys by reading them live from Convex, updates Cloudflare, and stores no key or
trigger mirror in Convex.`,
} as const;
