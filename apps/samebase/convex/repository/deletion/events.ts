import { v, type Infer } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { query } from "../../functions";
import { findRepositoryForUser } from "../../organizationAccess";
import { vRepositoryDeletionEventLevel, vRepositoryDeletionStep } from "./model";

const { array, id, number, object, string } = v;
const MAX_DELETION_EVENTS = 80;
const MAX_DELETION_MESSAGE_LENGTH = 800;

const deletionEventResult = object({
  _id: id("workflow_repositoryDeletion_events"),
  createdAt: number(),
  level: vRepositoryDeletionEventLevel,
  message: string(),
  githubRepositoryFullName: string(),
  runId: id("workflow_repositoryDeletion_runs"),
  step: vRepositoryDeletionStep,
});
type DeletionEventResult = Infer<typeof deletionEventResult>;

function normalizeDeletionMessage(message: string): string {
  const trimmed = message.trim();
  const normalized = trimmed.length === 0 ? "Deletion event." : trimmed;
  return normalized.slice(0, MAX_DELETION_MESSAGE_LENGTH);
}

export const append = internalMutation({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    repositoryId: id("repositories"),
    githubRepositoryFullName: string(),
    runId: id("workflow_repositoryDeletion_runs"),
    step: vRepositoryDeletionStep,
    level: vRepositoryDeletionEventLevel,
    message: string(),
    createdAt: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Deletion run not found for event.");
    }
    if (
      run.organizationId !== args.organizationId ||
      run.userId !== args.userId ||
      run.repositoryId !== args.repositoryId ||
      run.githubRepositoryFullName !== args.githubRepositoryFullName
    ) {
      throw new Error("Deletion event does not match its run.");
    }
    if (run.state !== "queued" && run.state !== "running") {
      throw new Error("Deletion run is not active.");
    }
    await ctx.db.insert("workflow_repositoryDeletion_events", {
      organizationId: args.organizationId,
      userId: args.userId,
      repositoryId: args.repositoryId,
      githubRepositoryFullName: args.githubRepositoryFullName,
      runId: args.runId,
      step: args.step,
      level: args.level,
      message: normalizeDeletionMessage(args.message),
      createdAt: args.createdAt,
      sourceOrder: {
        creationTime: args.createdAt,
        documentId: crypto.randomUUID(),
      },
    });
    return null;
  },
});

export const listForRepository = query({
  access: "access_dashboard",
  args: {
    repositoryId: id("repositories"),
  },
  returns: array(deletionEventResult),
  handler: async (ctx, args): Promise<DeletionEventResult[]> => {
    const repository = await findRepositoryForUser(ctx.db, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (!repository) {
      return [];
    }

    const events = await ctx.db
      .query("workflow_repositoryDeletion_events")
      .withIndex("by_repository_and_created_at_and_source_order", (q) =>
        q.eq("repositoryId", args.repositoryId),
      )
      .order("desc")
      .take(MAX_DELETION_EVENTS);

    return events
      .sort((left, right) => {
        const createdAtDiff = left.createdAt - right.createdAt;
        if (createdAtDiff !== 0) {
          return createdAtDiff;
        }
        const creationTimeDiff = left.sourceOrder.creationTime - right.sourceOrder.creationTime;
        if (creationTimeDiff !== 0) {
          return creationTimeDiff;
        }
        return left.sourceOrder.documentId.localeCompare(right.sourceOrder.documentId);
      })
      .map((event) => ({
        _id: event._id,
        createdAt: event.createdAt,
        level: event.level,
        message: event.message,
        githubRepositoryFullName: event.githubRepositoryFullName,
        runId: event.runId,
        step: event.step,
      }));
  },
});
