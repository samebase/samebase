import type { PropertyValidators } from "convex/values";
import type { AccessKey } from "../../shared/accessModel";

export type ToolStatus = "ok" | "error" | "blocked";
export type McpScope = AccessKey;

export interface ToolJsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false | Record<string, unknown>;
}

export interface McpToolDefinition<Args extends PropertyValidators = PropertyValidators> {
  name: string;
  description: string;
  requiredScopes: McpScope[];
  inputArgs: Args;
  inputSchema: ToolJsonSchema;
}

export interface ToolExecutionOutput {
  text: string;
  structuredContent?: unknown;
}
