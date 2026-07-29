import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id } = v;

export const retryProviderWriteRecoveryContract = {
  id: "retry_provider_write_recovery",
  access: "access_provider_connections",
  args: {
    vaultId: id("vaults"),
  },
  returns: v.null(),
  mcp: {
    title: "Retry provider recovery",
    name: "vault_actions_retryProviderWriteRecovery",
    description:
      "Retry the exact manual provider action that needs recovery for the selected Samebase app.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id whose manual provider action needs recovery.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `Retries the exact manual provider action that needs recovery for one app. Samebase keeps the
original provider action and resource target. It rejects the request if no recovery is available
or if another recovery attempt already owns the action.

The call waits for the provider attempt. Provider errors are returned to the caller, and the same
action stays available for a later retry.`,
} as const;
