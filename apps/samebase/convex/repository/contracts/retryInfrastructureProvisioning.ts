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
    description: `Start a fresh setup run for a repository whose GitHub Actions setup failed. It writes the repository's GitHub Actions secret and variable again, replacing their values, seeds the starter when it was not seeded yet, and syncs the default branch tree. It never creates or changes a Convex project. ${MCP_ACTION_CONFIRMATION_DESCRIPTION}`,
    safety: "destructive",
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
  doc: `Starts a fresh setup run for a repository whose GitHub Actions setup failed. The retry writes the
GitHub Actions secret and variable again and, when the starter was not seeded yet, seeds it and syncs
the default branch tree. A starter that an earlier run pushed is found on main and not pushed again,
and when main has commits that Samebase did not make, the seed fails instead of replacing them. It
never creates or changes the Convex project: the repository's GitHub Actions own it.

Only valid for a live repository that \`repository_create\` created, after its setup failed and while
no other provider operation runs. A connected repository, or a repository that Samebase set up
before GitHub Actions did, has no setup to retry. The first call checks these rules, so a retry that
cannot start returns an error, not a confirmation request. Progress is readable through
\`repository_list\` while the run executes.

${ACTION_CONFIRMATION_DOC}`,
} as const;
