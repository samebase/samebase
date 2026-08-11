import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { vActiveOrganizationDeletionProviderCleanup, vOrganizationDeletionStep } from "./model";

const { id, number, object, union } = v;

type RunningOrganizationDeletionRun = Extract<
  Doc<"workflow_organizationDeletion_runs">,
  { state: "running" }
>;

export async function readOwnedActiveRun(
  ctx: Pick<QueryCtx, "db">,
  args: {
    runId: Id<"workflow_organizationDeletion_runs">;
    executionAttempt: number;
  },
): Promise<RunningOrganizationDeletionRun> {
  const run = await ctx.db.get(args.runId);
  if (run === null || run.state !== "running" || run.executionAttempt !== args.executionAttempt) {
    throw new Error("Organization deletion execution is not active.");
  }

  const organization = await ctx.db.get(run.organization.organizationId);
  if (
    organization === null ||
    organization.deletion?.state !== "deleting" ||
    organization.deletion.runId !== run._id
  ) {
    throw new Error("Organization deletion gate does not match its run.");
  }

  return run;
}

const vOrganizationDeletionExecution = object({
  currentStep: vOrganizationDeletionStep,
  providerCleanup: vActiveOrganizationDeletionProviderCleanup,
});

export const getExecution = internalQuery({
  args: {
    runId: id("workflow_organizationDeletion_runs"),
    executionAttempt: number(),
  },
  returns: union(v.null(), vOrganizationDeletionExecution),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null || run.state !== "running" || run.executionAttempt !== args.executionAttempt) {
      return null;
    }

    return {
      currentStep: run.currentStep,
      providerCleanup: run.providerCleanup,
    };
  },
});
