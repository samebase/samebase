import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../shared/convexFunctionPolicyTypes";

const { id } = v;

export const retryInfrastructureProvisioningContract = {
  id: "retry_infrastructure_provisioning",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
  },
  returns: v.null(),
  mcp: {
    name: "vault_actions_retryInfrastructureProvisioning",
    description:
      "Retry a failed managed provisioning run for a Samebase-managed app, resuming from the failed step.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id of the app whose managed provisioning failed.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `The remedy behind \`nextAction: "retry_infrastructure_provisioning"\`: starts a new run
that resumes the managed provisioning composition from the failed step, reusing everything that
already succeeded (blocks are idempotent where the provider allows it).

Only valid for live Samebase-managed apps — apps created by \`create_repository\`; imported
repositories repair through the manual attach and wire actions instead, exactly as their
\`nextAction\` values say. Progress is readable through \`get_user_vaults\` while the run
executes.`,
} as const;
