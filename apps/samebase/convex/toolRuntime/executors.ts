"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { ToolExecutionOutput } from "./types";
import type { CreateRepositoryArgs } from "../vault/createRepositoryContract";

export async function executeCreateRepositoryTool(
  ctx: Pick<ActionCtx, "runAction">,
  input: CreateRepositoryArgs & { userId: Id<"users"> },
): Promise<ToolExecutionOutput> {
  const result = await ctx.runAction(internal.vault.actions.createAppForUserInternal, {
    userId: input.userId,
    name: input.name,
    owner: input.owner,
    convexProjectName: input.convexProjectName,
    cloudflareWorkerName: input.cloudflareWorkerName,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.private !== undefined ? { private: input.private } : {}),
  });
  const structuredContent = {
    vaultId: result.vaultId,
    runId: result.runId,
  };
  return {
    text: JSON.stringify(structuredContent, null, 2),
    structuredContent,
  };
}
