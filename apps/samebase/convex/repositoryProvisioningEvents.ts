import { v, type Infer } from "convex/values";
import { internalMutation } from "./_generated/server";
import { query } from "./functions";
import {
  vRepositoryProvisioningEventLevel,
  vRepositoryProvisioningStep,
} from "./repository/provisioningModel";
import { findRepositoryForUser } from "./organizationAccess";
import { requireActiveRepositoryProvisioningRun } from "./repositoryWorkflowAuthority";

const { array, id, number, object, string } = v;
const MAX_PROVISIONING_EVENTS = 80;
const MAX_PROVISIONING_MESSAGE_LENGTH = 4000;

const provisioningEventResult = object({
  _id: id("workflow_repositoryProvisioning_events"),
  createdAt: number(),
  level: vRepositoryProvisioningEventLevel,
  message: string(),
  githubRepositoryFullName: string(),
  runId: id("workflow_repositoryProvisioning_runs"),
  step: vRepositoryProvisioningStep,
});
type ProvisioningEventResult = Infer<typeof provisioningEventResult>;

function normalizeProvisioningMessage(message: string): string {
  const trimmed = message.trim();
  const normalized = trimmed.length === 0 ? "Provisioning event." : trimmed;
  return normalized.slice(0, MAX_PROVISIONING_MESSAGE_LENGTH);
}

export const append = internalMutation({
  args: {
    userId: id("users"),
    repositoryId: id("repositories"),
    githubRepositoryFullName: string(),
    runId: id("workflow_repositoryProvisioning_runs"),
    step: vRepositoryProvisioningStep,
    level: vRepositoryProvisioningEventLevel,
    message: string(),
    createdAt: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Provisioning run not found for event.");
    }
    if (
      run.userId !== args.userId ||
      run.repositoryId !== args.repositoryId ||
      run.githubRepositoryFullName !== args.githubRepositoryFullName
    ) {
      throw new Error("Provisioning event does not match its run.");
    }
    await requireActiveRepositoryProvisioningRun(ctx.db, {
      runId: args.runId,
      userId: args.userId,
      repositoryId: args.repositoryId,
    });
    await ctx.db.insert("workflow_repositoryProvisioning_events", {
      userId: args.userId,
      repositoryId: args.repositoryId,
      githubRepositoryFullName: args.githubRepositoryFullName,
      runId: args.runId,
      step: args.step,
      level: args.level,
      message: normalizeProvisioningMessage(args.message),
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
  returns: array(provisioningEventResult),
  handler: async (ctx, args): Promise<ProvisioningEventResult[]> => {
    const repository = await findRepositoryForUser(ctx.db, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
    });
    if (!repository) {
      return [];
    }

    const events = await ctx.db
      .query("workflow_repositoryProvisioning_events")
      .withIndex("by_repository_and_created_at_and_source_order", (q) =>
        q.eq("repositoryId", args.repositoryId),
      )
      .order("desc")
      .take(MAX_PROVISIONING_EVENTS);

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
