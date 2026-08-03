import { v, type Infer } from "convex/values";
import { internalMutation } from "./_generated/server";
import { query } from "./functions";
import { vAppProvisioningEventLevel, vAppProvisioningStep } from "./appProvisioningModel";
import { hasOrganizationAccess, requireOrganizationAccessContext } from "./organizationAccess";

const { array, id, number, object, string } = v;
const MAX_PROVISIONING_EVENTS = 80;
const MAX_PROVISIONING_MESSAGE_LENGTH = 4000;

const provisioningEventResult = object({
  _id: id("workflow_vaultProvisioning_events"),
  createdAt: number(),
  level: vAppProvisioningEventLevel,
  message: string(),
  repositoryFullName: string(),
  runId: id("workflow_vaultProvisioning_runs"),
  step: vAppProvisioningStep,
});
type ProvisioningEventResult = Infer<typeof provisioningEventResult>;

function normalizeProvisioningMessage(message: string): string {
  const trimmed = message.trim();
  const normalized = trimmed.length === 0 ? "Provisioning event." : trimmed;
  return normalized.slice(0, MAX_PROVISIONING_MESSAGE_LENGTH);
}

export const append = internalMutation({
  args: {
    vaultId: id("vaults"),
    repositoryFullName: string(),
    runId: id("workflow_vaultProvisioning_runs"),
    step: vAppProvisioningStep,
    level: vAppProvisioningEventLevel,
    message: string(),
    createdAt: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Provisioning run not found for event.");
    }
    if (run.vaultId !== args.vaultId || run.repositoryFullName !== args.repositoryFullName) {
      throw new Error("Provisioning event does not match its run.");
    }

    await ctx.db.insert("workflow_vaultProvisioning_events", {
      vaultId: args.vaultId,
      repositoryFullName: args.repositoryFullName,
      runId: args.runId,
      step: args.step,
      level: args.level,
      message: normalizeProvisioningMessage(args.message),
      createdAt: args.createdAt,
    });
    return null;
  },
});

export const listForVault = query({
  access: "access_dashboard",
  args: {
    vaultId: id("vaults"),
  },
  returns: array(provisioningEventResult),
  handler: async (ctx, args): Promise<ProvisioningEventResult[]> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      return [];
    }
    const ownership = await requireOrganizationAccessContext(ctx.db, ctx.viewer.userId);
    if (!hasOrganizationAccess(ownership, vault)) {
      return [];
    }

    const events = await ctx.db
      .query("workflow_vaultProvisioning_events")
      .withIndex("by_vault_and_created_at", (q) => q.eq("vaultId", args.vaultId))
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
