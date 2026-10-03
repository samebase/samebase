import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import {
  ACTION_CONFIRMATION_DOC,
  MCP_ACTION_CONFIRMATION_DESCRIPTION,
  MCP_ACTION_CONFIRMATION_INPUT_DESCRIPTION,
  vActionConfirmation,
  vActionConfirmationRequest,
} from "./actionConfirmation";
import { MCP_REPOSITORY_INPUT_DESCRIPTION, mcpRepositoryArgs } from "./repositoryReference";

const { id, literal, object, optional, union } = v;

export const retryInfrastructureProvisioningContract = {
  id: "retry_provider_setup",
  access: ACCESS_APP_CREATE,
  args: {
    repositoryId: id("repositories"),
    confirmation: optional(vActionConfirmation),
  },
  mcpArgs: {
    ...mcpRepositoryArgs,
    confirmation: optional(vActionConfirmation),
  },
  returns: union(vActionConfirmationRequest, v.null()),
  structuredContent: union(vActionConfirmationRequest, object({ state: literal("setup_started") })),
  mcp: {
    title: "Retry provider setup",
    name: "repository_retryProviderSetup",
    description: `Start a fresh managed provider setup run for a repository that Samebase created. It reuses attached resources and creates missing ones. When Cloudflare is requested, it reconfigures Workers Builds and rotates Convex deploy keys, then starts a production build. ${MCP_ACTION_CONFIRMATION_DESCRIPTION}`,
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
      confirmation: MCP_ACTION_CONFIRMATION_INPUT_DESCRIPTION,
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
executes.

${ACTION_CONFIRMATION_DOC}`,
} as const;
