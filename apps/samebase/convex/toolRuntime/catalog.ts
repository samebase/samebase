import { createRepositoryContract } from "../vault/createRepositoryContract";
import { convexArgsToToolInputSchema } from "./convexSchemas";
import type { McpToolDefinition } from "./types";

export const createRepositoryToolInputSchema = convexArgsToToolInputSchema(
  createRepositoryContract.args,
  createRepositoryContract.mcp.inputDescriptions,
);

export const createRepositoryMcpTool = {
  name: createRepositoryContract.mcp.name,
  description: createRepositoryContract.mcp.description,
  requiredScopes: [createRepositoryContract.access],
  inputArgs: createRepositoryContract.args,
  inputSchema: createRepositoryToolInputSchema,
} satisfies McpToolDefinition<typeof createRepositoryContract.args>;

export const MCP_TOOLS = [createRepositoryMcpTool];

function hasAllScopes(grantedScopes: string[], requiredScopes: string[]): boolean {
  const granted = new Set(grantedScopes);
  return requiredScopes.every((scope) => granted.has(scope));
}

export function listMcpTools(grantedScopes: string[]): McpToolDefinition[] {
  return MCP_TOOLS.filter((tool) => hasAllScopes(grantedScopes, tool.requiredScopes));
}

export function findMcpTool(name: string): McpToolDefinition | null {
  return MCP_TOOLS.find((tool) => tool.name === name) ?? null;
}
