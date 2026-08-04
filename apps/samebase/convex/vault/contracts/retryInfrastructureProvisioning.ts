import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id } = v;

export const retryInfrastructureProvisioningContract = {
  id: "retry_infrastructure_provisioning",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
  },
  returns: v.null(),
  mcp: {
    title: "Retry infrastructure provisioning",
    name: "vault_actions_retryInfrastructureProvisioning",
    description:
      "Retry a failed managed provisioning run for a Samebase-managed app, resuming from live provider state and requesting the first production build if deploy-key setup completes.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id of the app whose managed provisioning failed.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Retries failed Samebase-managed infrastructure setup: starts a fresh
managed provisioning run that re-reads the app's current infrastructure state and skips the blocks
whose resources already exist, so completed work is not redone. It does not require or inspect a
prior failed run. If the retry reaches Convex deploy-key setup, it requests one production build
only after it verifies the scoped keys on both Workers Builds triggers.

Only valid for live Samebase-managed apps, which are apps created by \`create_repository\`; imported
repositories repair through the explicit manual attachment and provider-configuration actions
instead. Progress is
readable through \`get_user_vaults\` while the run executes.`,
} as const;
