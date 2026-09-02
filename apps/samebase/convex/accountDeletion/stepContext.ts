import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { requireRepositoryAuthorityContinuation } from "../repositoryMigration/maintenance";

const { id, object, string } = v;

type RunningAccountDeletionRun = Extract<
  Doc<"workflow_accountDeletion_runs">,
  { state: "running" }
>;

export async function readOwnedActiveRun(
  ctx: Pick<QueryCtx, "db">,
  args: { runId: Id<"workflow_accountDeletion_runs">; workflowId: string },
): Promise<RunningAccountDeletionRun> {
  const run = await ctx.db.get(args.runId);

  if (run === null || run.state !== "running") {
    throw new Error("Account deletion workflow is not running.");
  }

  if (run.workflow.workflowId !== args.workflowId) {
    throw new Error("Account deletion workflow ownership changed.");
  }

  await requireRepositoryAuthorityContinuation(ctx);
  return run;
}

export const getOwnedIdentity = internalQuery({
  args: {
    runId: id("workflow_accountDeletion_runs"),
    workflowId: string(),
  },
  returns: object({
    userId: id("users"),
    email: string(),
  }),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    return {
      userId: run.identity.userId,
      email: run.identity.email,
    };
  },
});
