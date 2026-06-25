"use node";

import { v, type Infer } from "convex/values";
import { internalAction } from "../_generated/server";
import { createRepositoryContract } from "../vault/createRepositoryContract";
import { getUserVaultsContract } from "../vault/getUserVaultsContract";
import { createAppForUser } from "../vault/actions";
import { internal } from "../_generated/api";

const { array, id, literal, object, optional, string, union } = v;
const toolStatus = union(literal("ok"), literal("error"), literal("blocked"));

const createRepositoryToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(createRepositoryContract.returns),
});
type CreateRepositoryToolResult = Infer<typeof createRepositoryToolResultValidator>;

const getUserVaultsToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(
    object({
      vaults: getUserVaultsContract.returns,
    }),
  ),
});
type GetUserVaultsToolResult = Infer<typeof getUserVaultsToolResultValidator>;

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

export const getUserVaultsTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
  }),
  returns: getUserVaultsToolResultValidator,
  handler: async (ctx, args): Promise<GetUserVaultsToolResult> => {
    if (!args.grantedScopes.includes(getUserVaultsContract.access)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${getUserVaultsContract.mcp.name}.`,
      };
    }

    try {
      const vaults = await ctx.runQuery(internal.vault.dashboard.getUserVaultsForUser, {
        userId: args.userId,
      });
      return {
        status: "ok",
        text: `Found ${vaults.length} ${vaults.length === 1 ? "vault" : "vaults"}.`,
        structuredContent: {
          vaults,
        },
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
