import { v, type Infer } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { AppProvisioningEventLevel, AppProvisioningStep } from "./schema";
import { getUserId } from "./common";

const { array, id, number, object, optional, string } = v;
const MAX_PROVISIONING_EVENTS = 80;
const MAX_PROVISIONING_MESSAGE_LENGTH = 800;

const provisioningEventResult = object({
  _id: id("appProvisioningEvents"),
  createdAt: number(),
  level: AppProvisioningEventLevel,
  message: string(),
  repositoryFullName: string(),
  runId: optional(id("appProvisioningRuns")),
  step: AppProvisioningStep,
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
    vaultId: id("vaults"),
    repositoryFullName: string(),
    runId: optional(id("appProvisioningRuns")),
    step: AppProvisioningStep,
    level: AppProvisioningEventLevel,
    message: string(),
    createdAt: optional(number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("appProvisioningEvents", {
      userId: args.userId,
      vaultId: args.vaultId,
      repositoryFullName: args.repositoryFullName,
      runId: args.runId,
      step: args.step,
      level: args.level,
      message: normalizeProvisioningMessage(args.message),
      createdAt: args.createdAt ?? Date.now(),
    });
    return null;
  },
});

export const listForVault = query({
  args: {
    vaultId: id("vaults"),
  },
  returns: array(provisioningEventResult),
  handler: async (ctx, args): Promise<ProvisioningEventResult[]> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      return [];
    }

    const events = await ctx.db
      .query("appProvisioningEvents")
      .withIndex("by_vault_and_created_at", (q) =>
        q.eq("vaultId", args.vaultId),
      )
      .order("desc")
      .take(MAX_PROVISIONING_EVENTS);

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
