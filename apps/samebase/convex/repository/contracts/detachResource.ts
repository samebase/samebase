import { v, type Infer } from "convex/values";

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

const vDetachableResourceKind = union(literal("cloudflare_worker"), literal("convex_project"));

export const vDetachableResource = union(
  object({
    kind: literal("cloudflare_worker"),
    workerId: id("repositoryCloudflareWorkers"),
  }),
  object({
    kind: literal("convex_project"),
    convexProjectId: id("repositoryConvexProjects"),
  }),
);
export type DetachableResource = Infer<typeof vDetachableResource>;

export const detachResourceContract = {
  id: "detach_resource",
  access: "access_provider_connections",
  args: {
    repositoryId: id("repositories"),
    resource: vDetachableResource,
    confirmation: optional(vActionConfirmation),
  },
  mcpArgs: {
    ...mcpRepositoryArgs,
    kind: vDetachableResourceKind,
    resourceName: string(),
    confirmation: optional(vActionConfirmation),
  },
  returns: union(vActionConfirmationRequest, v.null()),
  structuredContent: union(
    vActionConfirmationRequest,
    object({
      state: literal("detached"),
      kind: vDetachableResourceKind,
      resourceName: string(),
    }),
  ),
  mcp: {
    title: "Detach resource",
    name: "repository_detachResource",
    description: `Remove an attached Cloudflare Worker or Convex project from the repository in Samebase. The resource keeps running in its provider account and is not deleted. ${MCP_ACTION_CONFIRMATION_DESCRIPTION}`,
    safety: "destructive",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
      kind: "cloudflare_worker or convex_project. A Worker and a Convex project can share a name.",
      resourceName: "Name of the attached Worker or Convex project, as repository_list shows it.",
      confirmation: MCP_ACTION_CONFIRMATION_INPUT_DESCRIPTION,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Removes one attachment record from the repository: a Cloudflare Worker or a Convex project. The
Worker or project keeps running in the user's provider account; Samebase changes no provider
resource, key, or Builds setting. \`kind\` is required because a Worker and a Convex project often
share the repository's name. The repository must have no running provider setup or other provider
write. Removing the repository itself, with or without its provider resources, stays in the Samebase
dashboard.

${ACTION_CONFIRMATION_DOC}`,
} as const;
