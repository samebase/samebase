import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id, string } = v;

export const cloudflareWireConvexBuildAccessContract = {
  id: "wire_convex_build_access",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
  },
  returns: v.null(),
  mcp: {
    name: "vault_cloudflare_wireConvexBuildAccess",
    description:
      "Mint Convex deploy keys for the app and place them into its Workers Builds triggers (CONVEX_DEPLOY_KEY for production, PREVIEW_CONVEX_DEPLOY_KEY for previews).",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id of the app whose builds need Convex deploy keys.",
      appRoot: 'App root within the repository ("." for single-app repositories).',
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `The repair for builds that cannot deploy the backend: mints production and preview deploy
keys on the app's Convex deployment and writes them into the Workers Builds triggers as
\`CONVEX_DEPLOY_KEY\` and \`PREVIEW_CONVEX_DEPLOY_KEY\`. This is the remedy behind
\`nextAction: "wire_convex_build_access"\` on the Worker's \`convexDeployKeys\` axis and the
dashboard's "Set Convex deploy keys" button. It is the same operation.

Requires the Worker's Builds connection to exist first (\`wire_builds\` otherwise). This is a key
rotation: previously recorded deploy keys are deleted once replacements are installed (and its own
new keys are cleaned up if the run fails). Writes deploy keys on Convex and trigger variables on
Cloudflare, both in the caller's own accounts; no user data is touched.`,
} as const;
