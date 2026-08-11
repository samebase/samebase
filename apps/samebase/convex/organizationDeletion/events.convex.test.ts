import { describe, expect, it } from "vite-plus/test";

import { makeConvexTest } from "../test.setup";
import {
  appendOrganizationDeletionEvent,
  ORGANIZATION_DELETION_RETAINED_EVENT_LIMIT,
} from "./events";

describe("organization deletion progress history", () => {
  it("retains a bounded recent history across repeated recovery events", async () => {
    const t = makeConvexTest();
    const events = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "progress-history@example.invalid",
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "progress-history-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "ProgressHistory",
        githubOwnerLoginNormalized: "progresshistory",
        githubInstallationId: "progress-history-installation",
      });
      const runId = await ctx.db.insert("workflow_organizationDeletion_runs", {
        state: "running",
        organization: {
          state: "active",
          organizationId,
          githubOwnerLogin: "ProgressHistory",
        },
        requestedByUserId: userId,
        currentStep: "wait_for_active_work",
        requestedAt: 1,
        updatedAt: 1,
        retryCount: 0,
        executionAttempt: 1,
        automaticRestartCount: 0,
        providerCleanup: { state: "not_required" },
      });
      for (let index = 0; index < ORGANIZATION_DELETION_RETAINED_EVENT_LIMIT + 3; index += 1) {
        await appendOrganizationDeletionEvent(ctx, {
          runId,
          step: "wait_for_active_work",
          level: "warning",
          message: `Recovery event ${index}`,
          createdAt: index,
        });
      }
      return await ctx.db
        .query("workflow_organizationDeletion_events")
        .withIndex("by_run_and_created_at", (query) => query.eq("runId", runId))
        .collect();
    });

    expect(events).toHaveLength(ORGANIZATION_DELETION_RETAINED_EVENT_LIMIT);
    expect(events[0]?.message).toBe("Recovery event 3");
    expect(events.at(-1)?.message).toBe(
      `Recovery event ${ORGANIZATION_DELETION_RETAINED_EVENT_LIMIT + 2}`,
    );
  });
});
