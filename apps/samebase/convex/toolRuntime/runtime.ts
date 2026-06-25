"use node";

import { Infer, v } from "convex/values";
import { internalAction } from "../_generated/server";
import { createRepositoryContract } from "../vault/createRepositoryContract";
import { createAppForUser, type CreateRepositoryResult } from "../vault/actions";

const { array, id, literal, object, optional, string, union } = v;

const createRepositoryToolArgsValidator = object({
  userId: id("users"),
  grantedScopes: array(string()),
  ...createRepositoryContract.args,
});
type CreateRepositoryToolArgs = Infer<typeof createRepositoryToolArgsValidator>;

const createRepositoryToolResultValidator = object({
  status: union(literal("ok"), literal("error"), literal("blocked")),
  text: string(),
  structuredContentJson: optional(string()),
});
type CreateRepositoryToolResult = Infer<typeof createRepositoryToolResultValidator>;

function hasCreateRepositoryScope(grantedScopes: string[]): boolean {
  return grantedScopes.includes(createRepositoryContract.access);
}

function toActionResult(args: {
  status: "ok" | "error" | "blocked";
  text: string;
  structuredContent?: CreateRepositoryResult;
}): CreateRepositoryToolResult {
  if (args.status !== "ok" || args.structuredContent === undefined) {
    return {
      status: args.status,
      text: args.text,
    };
  }
  return {
    status: args.status,
    text: args.text,
    structuredContentJson: JSON.stringify(args.structuredContent),
  };
}

function buildCreateRepositoryInput(args: CreateRepositoryToolArgs) {
  return {
    userId: args.userId,
    name: args.name,
    owner: args.owner,
    convexProjectName: args.convexProjectName,
    cloudflareWorkerName: args.cloudflareWorkerName,
    ...(args.description !== undefined ? { description: args.description } : {}),
    ...(args.private !== undefined ? { private: args.private } : {}),
  };
}

export const createRepositoryTool = internalAction({
  args: createRepositoryToolArgsValidator,
  returns: createRepositoryToolResultValidator,
  handler: async (ctx, args): Promise<CreateRepositoryToolResult> => {
    if (!hasCreateRepositoryScope(args.grantedScopes)) {
      return toActionResult({
        status: "blocked",
        text: `Insufficient scope for ${createRepositoryContract.mcp.name}.`,
      });
    }

    try {
      const structuredContent = await createAppForUser(ctx, buildCreateRepositoryInput(args));
      return toActionResult({
        status: "ok",
        text: JSON.stringify(structuredContent, null, 2),
        structuredContent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed.";
      return toActionResult({
        status: "error",
        text: message,
      });
    }
  },
});
