import { z } from "zod";

const toolActivityItemSchema = z.object({
  tool: z.string(),
  input: z.unknown(),
});

export type ToolActivityItem = z.infer<typeof toolActivityItemSchema>;

type ToolActivityPayload = {
  type: "tool_activity";
  tools: ToolActivityItem[];
};

type CommitProposalPayload = {
  type: "commit_proposal";
  message: string;
  committed?: boolean;
  tools?: ToolActivityItem[];
};

type ProdReadProposalPayload = {
  type: "prod_read_proposal";
  requestId: string;
  scope: "vault" | "global";
  provider: "convex" | "netlify";
  resourceKind:
    | "deployment_status"
    | "logs"
    | "data_query"
    | "project_inventory"
    | "site_inventory";
  toolName: string;
  paramsPreview: string;
  summary: string;
  status?:
    | "proposed"
    | "approved"
    | "rejected"
    | "executed"
    | "failed"
    | "expired";
  error?: string;
  tools?: ToolActivityItem[];
};

type ProdReadResultPayload = {
  type: "prod_read_result";
  requestId: string;
  provider: "convex" | "netlify";
  resourceKind:
    | "deployment_status"
    | "logs"
    | "data_query"
    | "project_inventory"
    | "site_inventory";
  endpoint?: string;
  redactionLevel?: "default" | "strict" | "raw_fallback";
  rowCount?: number;
  logLineCount?: number;
  error?: string;
};

export type MessageMetadata =
  | ToolActivityPayload
  | CommitProposalPayload
  | ProdReadProposalPayload
  | ProdReadResultPayload;

const metadataTypeSchema = z.object({
  type: z.string(),
});

const commitProposalPayloadSchema = z
  .object({
    type: z.literal("commit_proposal"),
    message: z.string(),
    committed: z.boolean().optional(),
    tools: z.array(toolActivityItemSchema).optional(),
  })
  .catchall(z.unknown());

const prodReadProposalPayloadSchema = z
  .object({
    type: z.literal("prod_read_proposal"),
    requestId: z.string(),
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

const toolActivityPayloadSchema = z
  .object({
    type: z.literal("tool_activity"),
    tools: z.array(toolActivityItemSchema),
  })
  .catchall(z.unknown());

const prodReadResultPayloadSchema = z
  .object({
    type: z.literal("prod_read_result"),
    requestId: z.string(),
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

export function parseMetadataPayload(
  payloadJson: string,
): MessageMetadata | null {
  try {
    const parsed = JSON.parse(payloadJson);
    const typeResult = metadataTypeSchema.safeParse(parsed);
    if (!typeResult.success) return null;
    if (parsed.type === "commit_proposal") {
      const result = commitProposalPayloadSchema.safeParse(parsed);
      return result.success ? result.data : null;
    }
    if (parsed.type === "prod_read_proposal") {
      const result = prodReadProposalPayloadSchema.safeParse(parsed);
      return result.success ? result.data : null;
    }
    if (parsed.type === "tool_activity") {
      const result = toolActivityPayloadSchema.safeParse(parsed);
      return result.success ? result.data : null;
    }
    if (parsed.type === "prod_read_result") {
      const result = prodReadResultPayloadSchema.safeParse(parsed);
      return result.success ? result.data : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseCommitPayload(
  payloadJson: string,
): CommitProposalPayload | null {
  const parsed = parseMetadataPayload(payloadJson);
  return parsed?.type === "commit_proposal" ? parsed : null;
}

export function parseProdReadProposalPayload(
  payloadJson: string,
): ProdReadProposalPayload | null {
  const parsed = parseMetadataPayload(payloadJson);
  return parsed?.type === "prod_read_proposal" ? parsed : null;
}

export function buildToolActivityPayload(
  tools: ToolActivityItem[],
): ToolActivityPayload {
  return { type: "tool_activity", tools };
}

export function buildCommitProposalPayload(args: {
  message: string;
  tools?: ToolActivityItem[];
}): CommitProposalPayload {
  return { type: "commit_proposal", message: args.message, tools: args.tools };
}

export function buildProdReadProposalPayload(
  proposal: Omit<ProdReadProposalPayload, "type">,
  tools?: ToolActivityItem[],
): ProdReadProposalPayload {
  return {
    type: "prod_read_proposal",
    ...proposal,
    ...(tools ? { tools } : {}),
  };
}

export function buildProdReadResultPayload(
  payload: Omit<ProdReadResultPayload, "type">,
): ProdReadResultPayload {
  return { type: "prod_read_result", ...payload };
}
