import { z } from "zod";
import type { Id } from "../convex/_generated/dataModel";

const toolActivityItemSchema = z.object({
  tool: z.string(),
  input: z.unknown(),
});

const requestIdSchema = z.custom<Id<"aiProdAccessRequests">>(
  (value) => typeof value === "string",
);

const toolActivitySchema = z
  .object({
    type: z.literal("tool_activity"),
    tools: z.array(toolActivityItemSchema),
  })
  .catchall(z.unknown());

const commitProposalSchema = z
  .object({
    type: z.literal("commit_proposal"),
    message: z.string(),
    committed: z.boolean().optional(),
    tools: z.array(toolActivityItemSchema).optional(),
  })
  .catchall(z.unknown());

const prodReadProposalSchema = z
  .object({
    type: z.literal("prod_read_proposal"),
    requestId: requestIdSchema,
    scope: z.enum(["vault", "global"]),
    provider: z.enum(["convex", "netlify"]),
    resourceKind: z.enum([
      "deployment_status",
      "logs",
      "data_query",
      "project_inventory",
      "site_inventory",
    ]),
    toolName: z.string(),
    paramsPreview: z.string(),
    summary: z.string(),
    status: z
      .enum([
        "proposed",
        "approved",
        "rejected",
        "executed",
        "failed",
        "expired",
      ])
      .optional(),
    error: z.string().optional(),
    tools: z.array(toolActivityItemSchema).optional(),
  })
  .catchall(z.unknown());

const prodReadResultSchema = z
  .object({
    type: z.literal("prod_read_result"),
    requestId: requestIdSchema,
    provider: z.enum(["convex", "netlify"]),
    resourceKind: z.enum([
      "deployment_status",
      "logs",
      "data_query",
      "project_inventory",
      "site_inventory",
    ]),
    endpoint: z.string().optional(),
    redactionLevel: z.enum(["default", "strict", "raw_fallback"]).optional(),
    rowCount: z.number().optional(),
    logLineCount: z.number().optional(),
    error: z.string().optional(),
  })
  .catchall(z.unknown());

const messageMetadataSchema = z.union([
  toolActivitySchema,
  commitProposalSchema,
  prodReadProposalSchema,
  prodReadResultSchema,
]);

const metadataTypeSchema = z.object({
  type: z.string(),
});

export type ToolActivityItem = z.infer<typeof toolActivityItemSchema>;
export type ToolActivityPayload = z.infer<typeof toolActivitySchema>;
export type CommitProposalPayload = z.infer<typeof commitProposalSchema>;
export type ProdReadProposalPayload = z.infer<typeof prodReadProposalSchema>;
export type ProdReadResultPayload = z.infer<typeof prodReadResultSchema>;
export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export {
  toolActivityItemSchema,
  requestIdSchema,
  toolActivitySchema,
  commitProposalSchema,
  prodReadProposalSchema,
  prodReadResultSchema,
  messageMetadataSchema,
  metadataTypeSchema,
};
