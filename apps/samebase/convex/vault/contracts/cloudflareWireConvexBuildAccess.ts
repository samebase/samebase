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
    convexDeploymentId: id("vaultConvexDeployments"),
  },
  returns: v.null(),
  mcp: {
    title: "Wire Convex build access",
    name: "vault_cloudflare_wireConvexBuildAccess",
    description:
      "Mint relationship-specific Convex deploy keys, then put the production key on the production trigger and the preview key on the preview trigger.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id of the app whose builds need Convex deploy keys.",
      workerId: "Stable Samebase id of the Worker build pipeline.",
      convexDeploymentId:
        "Stable Samebase id of the Convex deployment that this Worker pipeline deploys.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `The repair for builds that cannot deploy the backend: mints production and preview deploy
keys for one explicit Worker-to-Convex deployment dependency. It writes \`CONVEX_DEPLOY_KEY\` only
to the production trigger and \`PREVIEW_CONVEX_DEPLOY_KEY\` only to the preview trigger. This is the remedy behind
\`nextAction: "wire_convex_build_access"\` on the Worker's \`convexDeployKeys\` axis and the
dashboard's "Set Convex deploy keys" button. It is the same operation.

Requires the Worker's Builds connection to exist first (\`wire_builds\` otherwise). This is a key
rotation for this dependency only: its previously recorded deploy keys are deleted once replacements
are installed, and its own new keys are cleaned up if the run fails. Another Worker using the same
Convex deployment retains its own key pair. Writes deploy keys on Convex and trigger variables on
Cloudflare, both in the caller's own accounts; no user data is touched.`,
} as const;
