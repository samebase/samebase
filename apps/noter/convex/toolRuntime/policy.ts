import type { ToolDefinition, ToolRunRequest } from "./types";
import { hasAllScopes } from "./utils";

export interface PolicyCheckResult {
  ok: boolean;
  message?: string;
}

export function validateToolPolicy(args: {
  tool: Pick<
    ToolDefinition<unknown>,
    | "name"
    | "surfaces"
    | "requiredScopes"
    | "requiresVaultContext"
    | "requiresBranchContext"
    | "requiresThreadContext"
  >;
  request: ToolRunRequest;
}): PolicyCheckResult {
  const { tool, request } = args;

  if (!tool.surfaces.includes(request.surface)) {
    return {
      ok: false,
      message: `Tool "${tool.name}" is not available on ${request.surface}.`,
    };
  }

  if (request.surface === "mcp" && tool.requiredScopes.length > 0) {
    if (!hasAllScopes(request.grantedScopes, tool.requiredScopes)) {
      return {
        ok: false,
        message: `Insufficient scope for ${tool.name}.`,
      };
    }
  }

  if (tool.requiresVaultContext && request.vaultId === undefined) {
    return {
      ok: false,
      message: `${tool.name} requires vaultId context.`,
    };
  }

  if (tool.requiresBranchContext) {
    const branch =
      typeof request.branch === "string" ? request.branch.trim() : "";
    if (branch.length === 0) {
      return {
        ok: false,
        message: `${tool.name} requires branch context.`,
      };
    }
  }

  if (tool.requiresThreadContext) {
    const threadId =
      typeof request.threadId === "string" ? request.threadId.trim() : "";
    if (threadId.length === 0) {
      return {
        ok: false,
        message: `${tool.name} requires threadId context.`,
      };
    }
  }

  return { ok: true };
}
