import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import {
  ACTION_CONFIRMATION_DOC,
  MCP_ACTION_CONFIRMATION_DESCRIPTION,
  MCP_ACTION_CONFIRMATION_INPUT_DESCRIPTION,
  vActionConfirmation,
  vActionConfirmationRequest,
} from "./actionConfirmation";
import { MCP_REPOSITORY_INPUT_DESCRIPTION, mcpRepositoryArgs } from "./repositoryReference";

const { id, literal, object, optional, string, union } = v;

export const cloudflareRotateConvexDeployKeysForWorkersBuildsContract = {
  id: "rotate_convex_deploy_keys",
  access: "access_provider_connections",
  args: {
    repositoryId: id("repositories"),
    workerId: id("repositoryCloudflareWorkers"),
    convexProjectId: id("repositoryConvexProjects"),
    confirmation: optional(vActionConfirmation),
  },
  mcpArgs: {
    ...mcpRepositoryArgs,
    workerName: string(),
    convexProjectName: optional(string()),
    confirmation: optional(vActionConfirmation),
  },
  returns: union(vActionConfirmationRequest, v.null()),
  structuredContent: union(vActionConfirmationRequest, object({ state: literal("rotated") })),
  mcp: {
    title: "Rotate Convex deploy keys",
    name: "repository_cloudflare_rotateConvexDeployKeys",
    description: `Replace the Convex deploy keys in an attached Worker's Workers Builds settings, then start a production build. It revokes the keys that Samebase recorded before it creates new ones. Use it to install a missing key or replace a broken one. ${MCP_ACTION_CONFIRMATION_DESCRIPTION}`,
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
      workerName: "Name of the attached Worker.",
      convexProjectName:
        "Optional name of the attached Convex project. Required when several Convex projects are attached.",
      confirmation: MCP_ACTION_CONFIRMATION_INPUT_DESCRIPTION,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Mints production and preview deploy keys on the selected Convex project. It writes the
production key as \`CONVEX_DEPLOY_KEY\` in production Builds settings and the Preview key as
\`CONVEX_DEPLOY_KEY\` in Previews Base Builds settings and all existing previews. The non-secret
\`SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>\` marker belongs only in
production. It reads the settings back and verifies the marker and secrecy flags before starting
the production build. The Worker must already use native Worker Previews, and the Convex project
must have a production deployment ("Deploy the Convex project to production first").

The Worker and project must both be attached to the repository. Without a project name, the MCP tool
uses the repository's only attached Convex project. Their selection is input to this one operation,
not a persisted dependency. Rerunning the operation revokes and replaces the Samebase-named keys.
Samebase reads Convex live and stores no completed Worker-to-project, key, or trigger mirror in
Convex.

${ACTION_CONFIRMATION_DOC}`,
} as const;
