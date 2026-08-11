import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const ORGANIZATION_DELETION_RETAINED_EVENT_LIMIT = 64;

type OrganizationDeletionEvent = Pick<
  Doc<"workflow_organizationDeletion_events">,
  "runId" | "step" | "level" | "message" | "createdAt"
>;

/** Keep recent safe progress without allowing retries to make finalization unbounded. */
export async function appendOrganizationDeletionEvent(
  ctx: MutationCtx,
  event: OrganizationDeletionEvent,
): Promise<Id<"workflow_organizationDeletion_events">> {
  const retained = await ctx.db
    .query("workflow_organizationDeletion_events")
    .withIndex("by_run_and_created_at", (query) => query.eq("runId", event.runId))
    .order("asc")
    .take(ORGANIZATION_DELETION_RETAINED_EVENT_LIMIT);
  if (retained.length === ORGANIZATION_DELETION_RETAINED_EVENT_LIMIT) {
    await ctx.db.delete(retained[0]._id);
  }
  return await ctx.db.insert("workflow_organizationDeletion_events", event);
}

export async function readOrganizationDeletionEventsForFinalization(
  ctx: MutationCtx,
  runId: Id<"workflow_organizationDeletion_runs">,
): Promise<Doc<"workflow_organizationDeletion_events">[]> {
  const events = await ctx.db
    .query("workflow_organizationDeletion_events")
    .withIndex("by_run_and_created_at", (query) => query.eq("runId", runId))
    .take(ORGANIZATION_DELETION_RETAINED_EVENT_LIMIT + 1);
  if (events.length > ORGANIZATION_DELETION_RETAINED_EVENT_LIMIT) {
    throw new Error("Organization deletion progress history exceeds its retention limit.");
  }
  return events;
}
