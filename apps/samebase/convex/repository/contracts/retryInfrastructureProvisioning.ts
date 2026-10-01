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
      "Call repository_dashboard_getUserRepositories first and use its returned repositoryId. Start a fresh infrastructure setup run that reuses attached resources and creates missing ones. When Cloudflare is requested, it reconfigures Workers Builds and rotates Convex deploy keys.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      repositoryId: "Samebase repository ID returned by repository_dashboard_getUserRepositories.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Starts a fresh Samebase-managed infrastructure setup run. It re-reads the app's current
state, reuses attached Convex projects and Cloudflare Workers, and creates missing resources.
When the managed plan requests Cloudflare, it configures Workers Builds and rotates Convex deploy
keys even when those resources are already attached. Those steps can overwrite trigger settings,
revoke recorded deploy keys, and start production builds. It does not require or inspect a prior
failed run.

Only valid for live Samebase-managed apps, which are apps created by \`repository_actions_createRepository\`; imported
repositories repair through the explicit manual attachment and provider-configuration actions
instead. Progress is
readable through \`repository_dashboard_getUserRepositories\` while the run executes.`,
} as const;
