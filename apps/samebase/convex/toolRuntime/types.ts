import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { AccessKey } from "../../shared/accessModel";
import type { z } from "zod";

export type ToolSurface = "agent" | "mcp" | "ui";
export type ToolSafety = "read_only" | "write" | "destructive" | "proposal_only";
export type ToolStatus = "ok" | "error" | "blocked";

export type McpScope = AccessKey;

export interface ToolJsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
}

export interface ToolDefinition<TInput> {
  name: string;
  description: string;
  surfaces: ToolSurface[];
  requiredScopes: McpScope[];
  requiresVaultContext: boolean;
  requiresBranchContext: boolean;
  requiresThreadContext: boolean;
  requiresGithubConnection: boolean;
  safety: ToolSafety;
  inputSchema: ToolJsonSchema;
  agentArgs: z.ZodType<TInput>;
}

export interface ToolRunRequest {
  toolName: string;
  input: unknown;
  surface: ToolSurface;
  userId: Id<"users">;
  grantedScopes: string[];
  vaultId?: string;
  branch?: string;
  threadId?: string;
  requestId?: string;
}

export interface ResolvedToolContext {
  ctx: ActionCtx;
  surface: ToolSurface;
  userId: Id<"users">;
  grantedScopes: string[];
  vault: VaultToolContext | null;
  branch?: string;
  githubAccessToken?: string;
  threadId?: string;
  requestId?: string;
}

export interface VaultToolContext {
  _id: Id<"vaults">;
  userId: Id<"users">;
  owner: string;
  name: string;
  state: "copying_files" | "ready";
}

export interface ToolExecutionOutput {
  text: string;
  structuredContent?: unknown;
}

export type ToolExecutor<TInput> = (
  context: ResolvedToolContext,
  input: TInput,
) => Promise<ToolExecutionOutput>;

export interface ToolRunResult {
  status: ToolStatus;
  text: string;
  structuredContent?: unknown;
}

export interface ToolActionResult {
  status: ToolStatus;
  text: string;
  structuredContentJson?: string;
}
