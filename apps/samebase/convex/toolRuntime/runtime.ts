"use node";

import { v, type Infer } from "convex/values";
import { internalAction } from "../_generated/server";
import { createRepositoryContract } from "../vault/createRepositoryContract";
import { createAppForUser } from "../vault/actions";

const { array, id, literal, object, optional, string, union } = v;

const createRepositoryToolResultValidator = object({
  status: union(literal("ok"), literal("error"), literal("blocked")),
  text: string(),
  structuredContent: optional(createRepositoryContract.returns),
});
type CreateRepositoryToolResult = Infer<typeof createRepositoryToolResultValidator>;

export const createRepositoryTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...createRepositoryContract.args,
  }),
  returns: createRepositoryToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...createRepositoryArgs },
  ): Promise<CreateRepositoryToolResult> => {
    if (!grantedScopes.includes(createRepositoryContract.access)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${createRepositoryContract.mcp.name}.`,
      };
    }

    try {
      const structuredContent = await createAppForUser(ctx, createRepositoryArgs);
      return {
        status: "ok",
        text: JSON.stringify(structuredContent, null, 2),
        structuredContent,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed.";
      return {
        status: "error",
        text: message,
      };
    }
  },
});
