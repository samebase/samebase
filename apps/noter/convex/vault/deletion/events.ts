import { v, type Infer } from "convex/values";
import { internalMutation, query } from "../../_generated/server";
import { vVaultDeletionEventLevel, vVaultDeletionStep } from "./model";
import { getUserId } from "../../common";

const { array, id, number, object, string } = v;
const MAX_DELETION_EVENTS = 80;
const MAX_DELETION_MESSAGE_LENGTH = 800;

const deletionEventResult = object({
  _id: id("vaultDeletionEvents"),
  createdAt: number(),
  level: vVaultDeletionEventLevel,
  message: string(),
  repositoryFullName: string(),
  runId: id("vaultDeletionRuns"),
  step: vVaultDeletionStep,
});
type DeletionEventResult = Infer<typeof deletionEventResult>;

function normalizeDeletionMessage(message: string): string {
  const trimmed = message.trim();
  const normalized = trimmed.length === 0 ? "Deletion event." : trimmed;
  return normalized.slice(0, MAX_DELETION_MESSAGE_LENGTH);
}

export const append = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
    repositoryFullName: string(),
    runId: id("vaultDeletionRuns"),
    step: vVaultDeletionStep,
    level: vVaultDeletionEventLevel,
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
      run.userId !== args.userId ||
      run.vaultId !== args.vaultId ||
      run.repositoryFullName !== args.repositoryFullName
    ) {
      throw new Error("Deletion event does not match its run.");
    }

    await ctx.db.insert("vaultDeletionEvents", {
      userId: args.userId,
      vaultId: args.vaultId,
      repositoryFullName: args.repositoryFullName,
      runId: args.runId,
      step: args.step,
      level: args.level,
      message: normalizeDeletionMessage(args.message),
      createdAt: args.createdAt,
    });
    return null;
  },
});

export const listForVault = query({
  args: {
    vaultId: id("vaults"),
  },
  returns: array(deletionEventResult),
  handler: async (ctx, args): Promise<DeletionEventResult[]> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      return [];
    }

    const events = await ctx.db
      .query("vaultDeletionEvents")
      .withIndex("by_vault_and_created_at", (q) =>
        q.eq("vaultId", args.vaultId),
      )
      .order("desc")
      .take(MAX_DELETION_EVENTS);

    return events
      .sort((left, right) => {
        const createdAtDiff = left.createdAt - right.createdAt;
        if (createdAtDiff !== 0) {
          return createdAtDiff;
        }
        const creationTimeDiff = left._creationTime - right._creationTime;
        if (creationTimeDiff !== 0) {
          return creationTimeDiff;
        }
        return left._id.localeCompare(right._id);
      })
      .map((event) => ({
        _id: event._id,
        createdAt: event.createdAt,
        level: event.level,
        message: event.message,
        repositoryFullName: event.repositoryFullName,
        runId: event.runId,
        step: event.step,
      }));
  },
});
