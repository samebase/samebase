import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

type ThreadContextDoc = Doc<"agentThreadContext">;

export async function getThreadById(
  ctx: DbCtx,
  threadId: string,
): Promise<ThreadContextDoc | null> {
  return await ctx.db
    .query("agentThreadContext")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .first();
}

export function ensureThreadAccess<T extends { userId: Id<"users"> }>(
  ctxUserId: Id<"users">,
  threadContext: T | null,
  // eslint-disable-next-line samebase/no-hand-written-type-predicate -- asserts cannot be derived; rejects missing and foreign threads with one uniform error
): asserts threadContext is T {
  if (!threadContext || threadContext.userId !== ctxUserId) {
    throw new Error("Thread not found");
  }
}
