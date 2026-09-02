import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id } = v;

export const retryInfrastructureProvisioningContract = {
  id: "retry_infrastructure_provisioning",
  access: ACCESS_APP_CREATE,
  args: {
    repositoryId: id("repositories"),
  },
  returns: v.null(),
  mcp: {
    title: "Retry infrastructure provisioning",
    name: "repository_actions_retryInfrastructureProvisioning",
    description:
      "Call get_user_repositories first and use its returned repositoryId. Retry a failed managed provisioning run for a Samebase-managed app, resuming from the failed step.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      repositoryId: "Samebase repository ID returned by get_user_repositories.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Retries failed Samebase-managed infrastructure setup: starts a fresh
managed provisioning run that re-reads the app's current infrastructure state and skips the blocks
whose resources already exist, so completed work is not redone. It does not require or inspect a
prior failed run.

Only valid for live Samebase-managed apps, which are apps created by \`create_repository\`; imported
repositories repair through the explicit manual attachment and provider-configuration actions
instead. Progress is
readable through \`get_user_repositories\` while the run executes.`,
} as const;
