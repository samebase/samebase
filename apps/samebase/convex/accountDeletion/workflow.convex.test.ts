/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { makeConvexTest } from "../test.setup";
import { serializeAccountDeletionConfirmationStakes } from "../../shared/accountDeletionPhrase";

const workflowId = "account-deletion-workflow-1";
const now = 1_700_000_000_000;
const modules = import.meta.glob([
  "../**/*.ts",
  "../_generated/*.js",
  "!../**/*.test.ts",
  "!../**/*.convex.test.ts",
  "!../**/*.generated.ts",
  "!../test.setup.ts",
]);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function seedRunningDeletion() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "deleting@example.com",
      isApproved: true,
    });
    const initiatingSessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: now + 60_000,
    });
    const runId = await ctx.db.insert("accountDeletionRuns", {
      identity: { state: "active", userId, email: "deleting@example.com" },
      completionCapability: "workflow-test",
      state: "running",
      workflow: { state: "started", workflowId, attempt: 1 },
      currentStep: "request_accepted",
      requestedAt: now,
      updatedAt: now,
      initiatingSessionId,
      retryCount: 0,
      outcomes: {
        billing: { state: "not_started" },
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
    });
    await ctx.db.patch(userId, {
      accountDeletion: { state: "deleting", runId, requestedAt: now },
    });
    return { initiatingSessionId, runId, userId };
  });
  return { ids, t };
}

async function readRun(t: ReturnType<typeof makeConvexTest>, runId: Id<"accountDeletionRuns">) {
  return await t.run(async (ctx) => await ctx.db.get(runId));
}

describe("account deletion workflow ownership and outcomes", () => {
  it("rolls back the run and marker when workflow start fails", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "deleting@example.com",
        isApproved: true,
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: now + 60_000,
      });
      return { sessionId, userId };
    });
    const asUser = t.withIdentity({
      subject: `${ids.userId}|${ids.sessionId}`,
      tokenIdentifier: `test:${ids.sessionId}`,
    });

    await expect(
      asUser.mutation(api.accountDeletion.index.request, {
        completionCapability: "a".repeat(64),
        // Zero vaults are seeded, so the current confirmation phrase is the base one.
        confirmationPhrase: "delete my account",
        confirmationStakesSnapshot: serializeAccountDeletionConfirmationStakes({
          vaultCount: 0,
          uncommittedFileChangeCount: 0,
          hasActiveSubscription: false,
          affectedVaults: { state: "complete", vaults: [] },
        }),
      }),
    ).rejects.toThrow();
    const stored = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      runs: await ctx.db.query("accountDeletionRuns").collect(),
      events: await ctx.db.query("accountDeletionEvents").collect(),
    }));
    expect(stored.user?.accountDeletion).toBeUndefined();
    expect(stored.runs).toEqual([]);
    expect(stored.events).toEqual([]);
  });

  it("rejects stale workflow ownership", async () => {
    const { ids, t } = await seedRunningDeletion();
    await expect(
      t.mutation(internal.accountDeletion.workflow.claimWorkflowRun, {
        runId: ids.runId,
        workflowId: "stale-workflow",
      }),
    ).rejects.toThrow("Account deletion workflow ownership changed.");
  });

  it("keeps the generic cleanup path available for active legacy runs", async () => {
    const { ids, t } = await seedRunningDeletion();
    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupAccountLocalDataBatch, {
        runId: ids.runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "done" });
  });

  it("rejects provider errors outside the fixed safe outcome set", async () => {
    const { ids, t } = await seedRunningDeletion();
    await expect(
      t.mutation(internal.accountDeletion.workflow.recordProviderOutcome, {
        runId: ids.runId,
        workflowId,
        outcome: {
          state: "completed",
          github: {
            state: "unconfirmed",
            // @ts-expect-error Provider outcomes retain only the fixed safe error.
            safeError: "provider-owned-sensitive-error",
          },
          cloudflare: { state: "not_connected" },
          convex: { state: "not_connected" },
        },
      }),
    ).rejects.toThrow();
  });

  it("keeps billing failure as a hard finalization gate", async () => {
    const { ids, t } = await seedRunningDeletion();
    const args = { runId: ids.runId, workflowId };
    await t.mutation(internal.accountDeletion.workflow.recordBillingOutcome, {
      ...args,
      outcome: { state: "failed", safeError: "Billing cancellation was not confirmed." },
    });
    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).rejects.toThrow("Billing cancellation is not complete.");
  });

  it("shows provider and email actions when they start without regressing during rechecks", async () => {
    const { ids, t } = await seedRunningDeletion();
    const args = { runId: ids.runId, workflowId };
    await t.mutation(internal.accountDeletion.workflow.appendRunEvent, {
      ...args,
      step: "cancel_billing",
      level: "info",
      message: "Canceling Samebase billing.",
    });
    await t.mutation(internal.accountDeletion.workflow.recordBillingOutcome, {
      ...args,
      outcome: { state: "not_applicable" },
    });
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({ currentStep: "cancel_billing" });

    await t.mutation(internal.accountDeletion.workflow.appendRunEvent, {
      ...args,
      step: "revoke_access",
      level: "info",
      message: "Revoking Samebase provider access.",
    });
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({
      currentStep: "revoke_access",
      outcomes: { providerRevocation: { state: "not_started" } },
    });

    await t.mutation(internal.accountDeletion.workflow.recordProviderOutcome, {
      ...args,
      outcome: {
        state: "completed",
        github: { state: "not_connected" },
        cloudflare: { state: "not_connected" },
        convex: { state: "not_connected" },
      },
    });
    await t.mutation(internal.accountDeletion.workflow.appendRunEvent, {
      ...args,
      step: "delete_samebase_data",
      level: "info",
      message: "Deleting Samebase account data.",
    });
    await t.mutation(internal.accountDeletion.workflow.recordBillingOutcome, {
      ...args,
      outcome: { state: "not_applicable" },
    });
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({
      currentStep: "delete_samebase_data",
    });

    await t.mutation(internal.accountDeletion.workflow.appendRunEvent, {
      ...args,
      step: "send_completion_email",
      level: "info",
      message: "Sending account deletion confirmation.",
    });
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({
      currentStep: "send_completion_email",
      outcomes: { completionEmail: { state: "not_started" } },
    });
    await t.mutation(internal.accountDeletion.workflow.recordBillingOutcome, {
      ...args,
      outcome: { state: "not_applicable" },
    });
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({
      currentStep: "send_completion_email",
    });
  });

  it("rejects finalization when the final billing recheck replaces prior success", async () => {
    const { ids, t } = await seedRunningDeletion();
    const args = { runId: ids.runId, workflowId };
    await t.mutation(internal.accountDeletion.workflow.recordBillingOutcome, {
      ...args,
      outcome: { state: "succeeded" },
    });
    await t.mutation(internal.accountDeletion.workflow.recordProviderOutcome, {
      ...args,
      outcome: {
        state: "completed",
        github: { state: "not_connected" },
        cloudflare: { state: "not_connected" },
        convex: { state: "not_connected" },
      },
    });
    await t.mutation(internal.accountDeletion.workflow.recordCompletionEmailOutcome, {
      ...args,
      outcome: { state: "sent" },
    });
    await t.mutation(internal.accountDeletion.workflow.recordBillingOutcome, {
      ...args,
      outcome: { state: "failed", safeError: "Billing cancellation was not confirmed." },
    });

    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).rejects.toThrow("Billing cancellation is not complete.");
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({
      outcomes: {
        billing: { state: "failed" },
        completionEmail: { state: "sent" },
        providerRevocation: { state: "completed" },
      },
    });
  });

  it("quiesces scheduled repository inventory work before deleting account data", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "deleting@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      const provisioningRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "owner/repository",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: provisioningRunId,
        ghRepoId: "repository-id",
        ghRepoNodeId: "R_repository",
        githubOwner: "owner",
        githubName: "repository",
        routeRepositoryKey: "owner/repository",
        routeOwner: "owner",
        routeName: "repository",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: now,
      });
      await ctx.db.insert("vaultRepositorySummaries", {
        userId,
        vaultId,
        refreshEligibleAt: 0,
        lifecycle: { state: "idle" },
        publication: { state: "unobserved" },
      });
      await ctx.db.insert("vaultRepositorySummaryDirectoryStates", {
        userId,
        revision: 1,
      });
      return { userId, vaultId };
    });
    await expect(
      t.mutation(internal.repositoryInventory.requestRepositoryInventoryRefreshAfterWrite, ids),
    ).resolves.toEqual({ kind: "scheduled" });

    const { inventoryId, runId } = await t.run(async (ctx) => {
      const inventory = await ctx.db
        .query("vaultRepositoryInventories")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      if (inventory === null || inventory.lifecycle.state !== "scheduled") {
        throw new Error("Expected scheduled repository inventory work.");
      }
      const sessionId = await ctx.db.insert("authSessions", {
        userId: ids.userId,
        expirationTime: now + 60_000,
      });
      const runId = await ctx.db.insert("accountDeletionRuns", {
        identity: { state: "active", userId: ids.userId, email: "deleting@example.com" },
        completionCapability: "workflow-test",
        state: "running",
        workflow: { state: "started", workflowId, attempt: 1 },
        currentStep: "request_accepted",
        requestedAt: now,
        updatedAt: now,
        initiatingSessionId: sessionId,
        retryCount: 0,
        outcomes: {
          billing: { state: "not_started" },
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
      });
      await ctx.db.patch(ids.userId, {
        accountDeletion: { state: "deleting", runId, requestedAt: now },
      });
      return { inventoryId: inventory._id, runId };
    });

    await expect(
      t.mutation(internal.repositoryInventory.quiesceForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "needs_more" });
    await expect(t.run(async (ctx) => await ctx.db.get(inventoryId))).resolves.toMatchObject({
      writeVersion: 1,
      observedWriteVersion: 0,
      requiredFailureCount: 0,
      lifecycle: {
        state: "failed",
        required: true,
        message: "Repository inventory stopped for account deletion.",
      },
    });
    await expect(
      t.mutation(internal.repositoryInventory.quiesceForAccountDeletion, {
        runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "done" });
  });

  it("deletes provider connections in bounded idempotent batches", async () => {
    const { ids, t } = await seedRunningDeletion();
    await t.run(async (ctx) => {
      for (let index = 0; index < 26; index += 1) {
        await ctx.db.insert("providerConnections", {
          kind: "github",
          userId: ids.userId,
          githubAccountId: 1_000 + index,
          auth: { method: "api_key", credential: `credential-${index}` },
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
    });
    const args = { runId: ids.runId, workflowId };
    await expect(
      t.mutation(internal.accountDeletion.workflow.deleteProviderConnections, args),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.accountDeletion.workflow.deleteProviderConnections, args),
    ).resolves.toBe(true);
    await expect(
      t.mutation(internal.accountDeletion.workflow.deleteProviderConnections, args),
    ).resolves.toBe(true);
  });

  it("rejects OAuth callbacks, credential refresh, and disconnect writes after the deletion lock", async () => {
    const { ids, t } = await seedRunningDeletion();
    await expect(
      t.mutation(internal.providerConnections.upsertGithub, {
        userId: ids.userId,
        auth: { method: "oauth", credential: "late-oauth-token" },
        githubAccountId: 101,
        username: "late-user",
      }),
    ).rejects.toThrow("Provider connections are unavailable during account deletion.");

    await t.run(async (ctx) => {
      await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId: ids.userId,
        auth: {
          method: "mcp_oauth",
          credential: "late-access-token",
          refreshCredential: "late-refresh-token",
          credentialExpiresAt: now + 60_000,
          clientId: "late-client",
        },
        defaultAccount: { state: "not_selected" },
        createdAt: now,
        updatedAt: now,
      });
    });
    await expect(
      t.mutation(internal.providerConnections.claimCloudflareTokenRefresh, {
        userId: ids.userId,
      }),
    ).rejects.toThrow("Provider connections are unavailable during account deletion.");
    await expect(
      t.mutation(internal.providerConnections.removeByUserAndKind, {
        userId: ids.userId,
        kind: "cloudflare",
      }),
    ).rejects.toThrow("Provider connections are unavailable during account deletion.");
  });

  it("allows provider and email failures to continue to finalization", async () => {
    const { ids, t } = await seedRunningDeletion();
    const args = { runId: ids.runId, workflowId };
    await t.mutation(internal.accountDeletion.workflow.recordBillingOutcome, {
      ...args,
      outcome: { state: "not_applicable" },
    });
    await t.mutation(internal.accountDeletion.workflow.recordProviderOutcome, {
      ...args,
      outcome: {
        state: "completed",
        github: {
          state: "unconfirmed",
          safeError: "GitHub OAuth revocation could not be confirmed.",
        },
        cloudflare: { state: "revoked" },
        convex: {
          state: "manual_revocation_required",
          safeNotice:
            "Convex OAuth cannot be revoked by Samebase. Previously issued production and preview deploy keys remain usable until the user revokes Samebase in Convex Authorized Applications.",
        },
      },
    });
    await t.mutation(internal.accountDeletion.workflow.recordCompletionEmailOutcome, {
      ...args,
      outcome: {
        state: "delivery_failed",
        safeError: "Completion email delivery could not be confirmed.",
      },
    });
    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).resolves.toBeNull();
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({
      state: "running",
      outcomes: {
        providerRevocation: {
          state: "completed",
          github: { state: "unconfirmed" },
          cloudflare: { state: "revoked" },
          convex: { state: "manual_revocation_required" },
        },
        completionEmail: { state: "delivery_failed" },
      },
    });
    await expect(t.run(async (ctx) => await ctx.db.get(ids.userId))).resolves.toMatchObject({
      accountDeletion: { state: "finalizing", runId: ids.runId },
    });
  });

  it("keeps deletion status visible when the terminal assertion fails", async () => {
    const { ids, t } = await seedRunningDeletion();
    const args = { runId: ids.runId, workflowId };
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        outcomes: {
          billing: { state: "not_applicable" },
          providerRevocation: {
            state: "completed",
            github: { state: "not_connected" },
            cloudflare: { state: "not_connected" },
            convex: { state: "not_connected" },
          },
          completionEmail: { state: "sent" },
        },
      });
      await ctx.db.insert("authAccounts", {
        userId: ids.userId,
        provider: "google",
        providerAccountId: "late-google-account",
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).rejects.toThrow("Auth accounts remain for the deleting account.");
    await expect(t.run(async (ctx) => await ctx.db.get(ids.userId))).resolves.toMatchObject({
      accountDeletion: { state: "deleting", runId: ids.runId },
    });

    await t.mutation(internal.accountDeletion.workflow.handleWorkflowComplete, {
      workflowId,
      context: { runId: ids.runId },
      result: { kind: "failed", error: "terminal assertion failed" },
    });
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({
      state: "needs_attention",
      latestSafeError: "Account deletion needs staff attention.",
    });
    await expect(t.run(async (ctx) => await ctx.db.get(ids.userId))).resolves.toMatchObject({
      accountDeletion: { state: "deleting", runId: ids.runId },
    });
  });

  it("restores deletion visibility when a final atomic assertion fails", async () => {
    const { ids, t } = await seedRunningDeletion();
    const args = { runId: ids.runId, workflowId };
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        outcomes: {
          billing: { state: "not_applicable" },
          providerRevocation: {
            state: "completed",
            github: { state: "not_connected" },
            cloudflare: { state: "not_connected" },
            convex: { state: "not_connected" },
          },
          completionEmail: { state: "sent" },
        },
      });
    });
    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).resolves.toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.insert("authAccounts", {
        userId: ids.userId,
        provider: "google",
        providerAccountId: "post-marker-google-account",
      });
    });
    await expect(
      t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, args),
    ).rejects.toThrow("Auth accounts remain for the deleting account.");

    await t.mutation(internal.accountDeletion.workflow.handleWorkflowComplete, {
      workflowId,
      context: { runId: ids.runId },
      result: { kind: "failed", error: "final identity assertion failed" },
    });

    await expect(t.run(async (ctx) => await ctx.db.get(ids.userId))).resolves.toMatchObject({
      accountDeletion: { state: "deleting", runId: ids.runId },
    });
    await expect(
      t.run(async (ctx) => await ctx.db.get(ids.initiatingSessionId)),
    ).resolves.not.toBeNull();
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({
      identity: { state: "active", userId: ids.userId },
      state: "needs_attention",
      currentStep: "delete_identity",
      latestSafeError: "Account deletion needs staff attention.",
    });
  });

  it("rejects account-local data created after finalizing became visible", async () => {
    const { ids, t } = await seedRunningDeletion();
    const args = { runId: ids.runId, workflowId };
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        outcomes: {
          billing: { state: "not_applicable" },
          providerRevocation: {
            state: "completed",
            github: { state: "not_connected" },
            cloudflare: { state: "not_connected" },
            convex: { state: "not_connected" },
          },
          completionEmail: { state: "sent" },
        },
      });
    });
    await expect(
      t.mutation(internal.accountDeletion.workflow.markFinalizing, args),
    ).resolves.toBeNull();
    const settingsId = await t.run(async (ctx) => {
      return await ctx.db.insert("dashboardSettings", {
        userId: ids.userId,
        providersPanelOpen: false,
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, args),
    ).rejects.toThrow("Samebase account data remains during finalization.");
    await expect(t.run(async (ctx) => await ctx.db.get(settingsId))).resolves.not.toBeNull();

    await t.mutation(internal.accountDeletion.workflow.handleWorkflowComplete, {
      workflowId,
      context: { runId: ids.runId },
      result: { kind: "failed", error: "late account-local data" },
    });
    await expect(t.run(async (ctx) => await ctx.db.get(ids.userId))).resolves.toMatchObject({
      accountDeletion: { state: "deleting", runId: ids.runId },
    });
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({
      state: "needs_attention",
      latestSafeError: "Account deletion needs staff attention.",
    });
  });

  it("records completion email failure without retaining the workflow", async () => {
    const { ids, t } = await seedRunningDeletion();
    vi.stubEnv("CLOUDFLARE_EMAIL_ACCOUNT_ID", "configured-without-token");
    await expect(
      t.action(internal.accountDeletion.completionEmail.sendForAccountDeletion, {
        runId: ids.runId,
        workflowId,
      }),
    ).resolves.toEqual({
      state: "delivery_failed",
      safeError: "Completion email delivery could not be confirmed.",
    });
  });

  it("describes cleanup as complete while sign-in removal is still being finalized", async () => {
    const { ids, t } = await seedRunningDeletion();
    vi.stubEnv("CLOUDFLARE_EMAIL_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_EMAIL_API_TOKEN", "email-token");
    vi.stubEnv("CONVEX_DEPLOYMENT", "prod:samebase");
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            delivered: ["deleting@example.com"],
            message_id: "<message-id@samebase.com>",
            permanent_bounces: [],
            queued: [],
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.accountDeletion.completionEmail.sendForAccountDeletion, {
        runId: ids.runId,
        workflowId,
      }),
    ).resolves.toEqual({ state: "sent" });

    const [, init] = fetch.mock.calls[0];
    if (typeof init?.body !== "string") {
      throw new Error("Expected a JSON request body.");
    }
    expect(JSON.parse(init.body)).toEqual({
      to: "deleting@example.com",
      from: {
        address: "notifications@samebase.com",
        name: "Samebase",
      },
      subject: "Your Samebase account deletion is finishing",
      text: `Your Samebase workspace data and stored provider credentials have been removed. Your remaining sign-in records are being finalized. Samebase staff will finish the deletion if the last step needs attention.

External repositories, deployments, projects, and Workers were not deleted.

If you connected Convex with OAuth, revoke Samebase in Convex Authorized Applications to invalidate previously issued production and preview deploy keys.

Deletion reference: ${ids.runId}`,
    });
  });

  it("ignores stale completion and marks only the current failed attempt", async () => {
    const { ids, t } = await seedRunningDeletion();
    await t.mutation(internal.accountDeletion.workflow.handleWorkflowComplete, {
      workflowId: "stale-workflow",
      context: { runId: ids.runId },
      result: { kind: "failed", error: "provider-owned-sensitive-error" },
    });
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({ state: "running" });

    await t.mutation(internal.accountDeletion.workflow.handleWorkflowComplete, {
      workflowId,
      context: { runId: ids.runId },
      result: { kind: "failed", error: "provider-owned-sensitive-error" },
    });
    const failed = await readRun(t, ids.runId);
    expect(failed).toMatchObject({
      state: "needs_attention",
      latestSafeError: "Account deletion needs staff attention.",
    });
    expect(JSON.stringify(failed)).not.toContain("provider-owned-sensitive-error");
  });

  it("starts a fresh staff retry without regressing a late failed step", async () => {
    const { ids, t } = await seedRunningDeletion();
    await t.mutation(internal.accountDeletion.workflow.appendRunEvent, {
      runId: ids.runId,
      workflowId,
      step: "send_completion_email",
      level: "info",
      message: "Sending account deletion confirmation.",
    });
    await t.mutation(internal.accountDeletion.workflow.handleWorkflowComplete, {
      workflowId,
      context: { runId: ids.runId },
      result: { kind: "canceled" },
    });
    const staffId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "nicu@samebase.com",
        isApproved: true,
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: now + 60_000,
      });
      return { sessionId, userId };
    });
    const asStaff = t.withIdentity({
      subject: `${staffId.userId}|${staffId.sessionId}`,
      tokenIdentifier: `test:${staffId.sessionId}`,
    });
    const retried = await asStaff.mutation(api.accountDeletion.index.retry, {
      runId: ids.runId,
    });
    expect(retried).toMatchObject({ state: "running" });
    const retriedRun = await readRun(t, ids.runId);
    expect(retriedRun).toMatchObject({
      state: "running",
      currentStep: "send_completion_email",
      retryCount: 1,
      workflow: { state: "started", attempt: 2 },
    });
    if (retriedRun === null || retriedRun.state !== "running") {
      throw new Error("Expected a running retry.");
    }
    expect(retriedRun.workflow.workflowId).not.toBe(workflowId);

    await t.mutation(internal.accountDeletion.workflow.appendRunEvent, {
      runId: ids.runId,
      workflowId: retriedRun.workflow.workflowId,
      step: "request_accepted",
      level: "info",
      message: "Waiting for active Samebase work to stop.",
    });
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({
      currentStep: "send_completion_email",
    });

    await t.mutation(internal.accountDeletion.workflow.handleWorkflowComplete, {
      workflowId,
      context: { runId: ids.runId },
      result: { kind: "failed", error: "late failure" },
    });
    await expect(readRun(t, ids.runId)).resolves.toMatchObject({ state: "running" });
  });
});
