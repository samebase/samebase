import {
  commitProposalSchema,
  metadataTypeSchema,
  prodReadProposalSchema,
  prodReadResultSchema,
  toolActivitySchema,
  type CommitProposalPayload,
  type MessageMetadata,
  type ProdReadProposalPayload,
  type ProdReadResultPayload,
  type ToolActivityItem,
  type ToolActivityPayload,
} from "../../shared/chatMetadata";

export function parseMetadataPayload(payloadJson: string): MessageMetadata | null {
  try {
    const parsed = JSON.parse(payloadJson);
    const typeResult = metadataTypeSchema.safeParse(parsed);
    if (!typeResult.success) return null;
    if (parsed.type === "commit_proposal") {
      const result = commitProposalSchema.safeParse(parsed);
      return result.success ? result.data : null;
    }
    if (parsed.type === "prod_read_proposal") {
      const result = prodReadProposalSchema.safeParse(parsed);
      return result.success ? result.data : null;
    }
    if (parsed.type === "tool_activity") {
      const result = toolActivitySchema.safeParse(parsed);
      return result.success ? result.data : null;
    }
    if (parsed.type === "prod_read_result") {
      const result = prodReadResultSchema.safeParse(parsed);
      return result.success ? result.data : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseCommitPayload(payloadJson: string): CommitProposalPayload | null {
  const parsed = parseMetadataPayload(payloadJson);
  return parsed?.type === "commit_proposal" ? parsed : null;
}

export function parseProdReadProposalPayload(payloadJson: string): ProdReadProposalPayload | null {
  const parsed = parseMetadataPayload(payloadJson);
  return parsed?.type === "prod_read_proposal" ? parsed : null;
}

export function buildToolActivityPayload(tools: ToolActivityItem[]): ToolActivityPayload {
  return { type: "tool_activity", tools };
}

export function buildCommitProposalPayload(args: {
  message: string;
  branch?: string;
  tools?: ToolActivityItem[];
}): CommitProposalPayload {
  return {
    type: "commit_proposal",
    message: args.message,
    branch: args.branch,
    tools: args.tools,
  };
}

type ProdReadProposalInput = Pick<
  ProdReadProposalPayload,
  | "requestId"
  | "scope"
  | "provider"
  | "resourceKind"
  | "toolName"
  | "paramsPreview"
  | "summary"
  | "status"
  | "error"
>;

export function buildProdReadProposalPayload(
  proposal: ProdReadProposalInput,
  tools?: ToolActivityItem[],
): ProdReadProposalPayload {
  return {
    type: "prod_read_proposal",
    ...proposal,
    ...(tools ? { tools } : {}),
  };
}

type ProdReadResultInput = Pick<
  ProdReadResultPayload,
  | "requestId"
  | "provider"
  | "resourceKind"
  | "endpoint"
  | "redactionLevel"
  | "rowCount"
  | "logLineCount"
  | "error"
>;

export function buildProdReadResultPayload(payload: ProdReadResultInput): ProdReadResultPayload {
  return { type: "prod_read_result", ...payload };
}

export type { MessageMetadata, ToolActivityItem };
