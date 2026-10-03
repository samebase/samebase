import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { MCP_REPOSITORY_INPUT_DESCRIPTION, mcpRepositoryArgs } from "./repositoryReference";

const { id } = v;

export const retryInfrastructureProvisioningContract = {
  id: "retry_provider_setup",
  access: ACCESS_APP_CREATE,
  args: {
    repositoryId: id("repositories"),
  },
  mcpArgs: mcpRepositoryArgs,
  returns: v.null(),
  mcp: {
    title: "Retry provider setup",
    name: "repository_retryProviderSetup",
    description:
      "Start a fresh managed provider setup run for a repository that Samebase created. It reuses attached resources and creates missing ones. When Cloudflare is requested, it reconfigures Workers Builds and rotates Convex deploy keys, then starts a production build.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Starts a fresh Samebase-managed provider setup run. It re-reads the repository's current state,
reuses attached Convex projects and Cloudflare Workers, and creates missing resources. When the
managed plan requests Cloudflare, it configures Workers Builds and rotates Convex deploy keys even
when those resources are already attached. Those steps can overwrite Builds settings, revoke recorded
deploy keys, and start production builds. It does not require or inspect a prior failed run.

Only valid for live Samebase-managed repositories, which are repositories created by
\`repository_create\`; connected repositories repair through the explicit attach, connect, Builds,
and deploy-key actions instead. Progress is readable through \`repository_list\` while the run
executes.`,
} as const;
