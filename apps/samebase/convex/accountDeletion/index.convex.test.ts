import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("./workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./workflow")>();
  return {
    ...actual,
    startAccountDeletionWorkflow: vi.fn(async () => "account-deletion-test-workflow"),
  };
});

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";
import {
  ACCOUNT_DELETION_UNCOMMITTED_FILE_CHANGE_COUNT_CAP,
  buildAccountDeletionConfirmationPhrase,
  serializeAccountDeletionConfirmationStakes,
} from "../../shared/accountDeletionPhrase";
import { INITIAL_ACCOUNT_DELETION_DATA_PROGRESS } from "./model";

const now = 1_700_000_000_000;
const completionCapability = "a".repeat(64);
const zeroStakesConfirmationPhrase = buildAccountDeletionConfirmationPhrase({
  vaultCount: 0,
  uncommittedFileChangeCount: 0,
});

async function seedUser(args: {
  email: string;
  approved?: boolean;
  t?: ReturnType<typeof makeConvexTest>;
}) {
  const t = args.t ?? makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: args.email,
      isApproved: args.approved ?? true,
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: now + 60_000,
    });
    const organizationId = await ctx.db.insert("organizations", {});
    await ctx.db.insert("organizationMemberships", { organizationId, userId });
    const billingAccountId = await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
    });
    return { billingAccountId, organizationId, sessionId, userId };
  });
  const asUser = t.withIdentity({
    subject: `${ids.userId}|${ids.sessionId}`,
    tokenIdentifier: `test:${ids.sessionId}`,
  });
  return { asUser, ids, t };
}

async function requestAccepted(
  asUser: ReturnType<ReturnType<typeof makeConvexTest>["withIdentity"]>,
  confirmationPhrase = zeroStakesConfirmationPhrase,
) {
  const confirmationStakes = await asUser.query(api.accountDeletion.index.stakes);
  const result = await asUser.mutation(api.accountDeletion.index.request, {
    completionCapability,
    confirmationPhrase,
    confirmationStakesSnapshot: serializeAccountDeletionConfirmationStakes(confirmationStakes),
  });
  if (result.state !== "accepted") {
    throw new Error("Expected the account deletion request to be accepted.");
  }
  return result.status;
}

async function seedVault(
  t: ReturnType<typeof makeConvexTest>,
  userId: Id<"users">,
  name = "test-vault",
) {
  return await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (query) => query.eq("userId", userId))
      .unique();
    if (membership === null) {
      throw new Error("Expected organization membership.");
    }
    const vaultId = await ctx.db.insert("vaults", {
      organizationId: membership.organizationId,
      state: "not_connected",
      deletion: { state: "not_deleting" },
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      requestedByUserId: userId,
      vaultId,
      repositoryFullName: `ada/${name}`,
      trigger: "create",
      state: "succeeded",
      currentStep: "finish",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });

    await ctx.db.replace(vaultId, {
      organizationId: membership.organizationId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId,
      ghRepoId: `${vaultId}-github`,
      owner: "ada",
      name,
      defaultBranch: "main",
      visibility: "private",
      connectedAt: now,
    });

    return vaultId;
  });
}

async function seedStagedFile(
  t: ReturnType<typeof makeConvexTest>,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    filePath: string;
    changed: boolean;
    branch?: string;
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("vaultStagedFiles", {
      vaultId: args.vaultId,
      fileDeleted: false,
      kind: "text",
      filePath: args.filePath,
      initialFilePath: args.filePath,
      content: args.changed ? "draft" : "same",
      initialContent: "same",
      parentCommitSha: "parent-sha",
      lastEditTime: now,
      lastEditUserId: args.userId,
      branch: args.branch ?? "main",
      version: 1,
    });
  });
}

const notStartedOutcomes = {
  billing: { state: "not_started" as const },
  providerRevocation: { state: "not_started" as const },
  completionEmail: { state: "not_started" as const },
};

describe("account deletion foundation", () => {
  it("atomically gates the user and reuses one running workflow", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });

    const first = await requestAccepted(asUser);
    const second = await requestAccepted(asUser);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      state: "running",
      currentStep: "request_accepted",
      dataDeletion: {
        vaultsAndStagedChanges: { state: "not_started" },
        preferences: { state: "not_started" },
        appAccessAndTokens: { state: "not_started" },
        accessRequestsAndHistory: { state: "not_started" },
      },
    });
    expect(first).not.toHaveProperty("stagedFileCount");

    const stored = await t.run(async (ctx) => {
      const user = await ctx.db.get(ids.userId);
      const runs = await ctx.db.query("workflow_accountDeletion_runs").collect();
      const events = await ctx.db.query("workflow_accountDeletion_events").collect();
      return { user, runs, events };
    });
    expect(stored.user?.accountDeletion).toEqual({
      state: "deleting",
      runId: first.runId,
      requestedAt: first.requestedAt,
    });
    expect(stored.runs).toMatchObject([
      {
        state: "running",
        workflow: { state: "started", attempt: 1 },
        outcomes: notStartedOutcomes,
      },
    ]);
    expect(stored.events).toMatchObject([
      {
        runId: first.runId,
        step: "request_accepted",
        level: "info",
      },
    ]);
    await expect(
      asUser.mutation(api.dashboardSettings.setAccountPanelOpen, { isOpen: true }),
    ).rejects.toThrow("Access denied");
  });

  it("reuses the active deletion run when a checkout is pending", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    // Seed the committed state directly so this assertion does not start a background workflow.
    const runId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
        identity: { state: "active", userId: ids.userId, email: "ada@example.com" },
        completionCapability: "account-deletion-reuse-test",
        state: "running",
        workflow: { state: "started", workflowId: "account-deletion-reuse-test", attempt: 1 },
        currentStep: "request_accepted",
        requestedAt: now,
        updatedAt: now,
        initiatingSessionId: ids.sessionId,
        retryCount: 0,
        outcomes: notStartedOutcomes,
        dataDeletion: INITIAL_ACCOUNT_DELETION_DATA_PROGRESS,
      });
      await ctx.db.patch(ids.userId, {
        accountDeletion: { state: "deleting", runId, requestedAt: now },
      });
      await ctx.db.patch(ids.billingAccountId, {
        polarCheckoutAttempt: {
          state: "pending",
          attemptId: "polar_checkout_after_deletion_started",
        },
      });
      return runId;
    });

    const result = await requestAccepted(asUser);

    expect(result).toMatchObject({
      runId,
      completionCapability: "account-deletion-reuse-test",
      state: "running",
      currentStep: "request_accepted",
      dataDeletion: INITIAL_ACCOUNT_DELETION_DATA_PROGRESS,
    });
    const stored = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      runs: await ctx.db.query("workflow_accountDeletion_runs").take(2),
    }));
    expect(stored.user).toMatchObject({
      accountDeletion: { state: "deleting", runId },
    });
    await expect(
      t.run(async (ctx) => await ctx.db.get(ids.billingAccountId)),
    ).resolves.toMatchObject({
      polarCheckoutAttempt: {
        state: "pending",
        attemptId: "polar_checkout_after_deletion_started",
      },
    });
    expect(stored.runs).toHaveLength(1);
    expect(stored.runs[0]).toMatchObject({ _id: runId, state: "running" });
  });

  it("rejects account deletion while a manual provider change is active", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    const vaultId = await seedVault(t, ids.userId);
    await t.run(async (ctx) => {
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        owner: {
          kind: "manual_provider_write",
          requestedByUserId: ids.userId,
          actionId: "active-provider-write",
          action: "create_convex_project",
          expiresAt: now + 60_000,
        },
        state: "active",
        lastWriteAt: {},
        updatedAt: now,
      });
    });
    const confirmationStakes = await asUser.query(api.accountDeletion.index.stakes);

    await expect(
      asUser.mutation(api.accountDeletion.index.request, {
        completionCapability,
        confirmationPhrase: buildAccountDeletionConfirmationPhrase(confirmationStakes),
        confirmationStakesSnapshot: serializeAccountDeletionConfirmationStakes(confirmationStakes),
      }),
    ).rejects.toThrow(
      "A provider change is active. Wait for it to finish before you delete the account.",
    );
    await expect(t.run(async (ctx) => await ctx.db.get(ids.userId))).resolves.not.toHaveProperty(
      "accountDeletion",
    );
  });

  it("rejects shared account deletion during the deleting member's provider change", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    const vaultId = await seedVault(t, ids.userId);
    await t.run(async (ctx) => {
      const remainingUserId = await ctx.db.insert("users", {
        email: "grace@example.com",
        isApproved: true,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: ids.organizationId,
        userId: remainingUserId,
      });
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        owner: {
          kind: "manual_provider_write",
          requestedByUserId: ids.userId,
          actionId: "deleting-user-provider-write",
          action: "create_convex_project",
          expiresAt: now + 60_000,
        },
        state: "active",
        lastWriteAt: {},
        updatedAt: now,
      });
    });
    const confirmationStakes = await asUser.query(api.accountDeletion.index.stakes);

    await expect(
      asUser.mutation(api.accountDeletion.index.request, {
        completionCapability,
        confirmationPhrase: buildAccountDeletionConfirmationPhrase(confirmationStakes),
        confirmationStakesSnapshot: serializeAccountDeletionConfirmationStakes(confirmationStakes),
      }),
    ).rejects.toThrow(
      "A provider change is active. Wait for it to finish before you delete the account.",
    );
  });

  it("allows shared account deletion during a remaining member's provider change", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    const vaultId = await seedVault(t, ids.userId);
    await t.run(async (ctx) => {
      const remainingUserId = await ctx.db.insert("users", {
        email: "grace@example.com",
        isApproved: true,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: ids.organizationId,
        userId: remainingUserId,
      });
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        owner: {
          kind: "manual_provider_write",
          requestedByUserId: remainingUserId,
          actionId: "remaining-user-provider-write",
          action: "create_convex_project",
          expiresAt: now + 60_000,
        },
        state: "active",
        lastWriteAt: {},
        updatedAt: now,
      });
    });

    await expect(requestAccepted(asUser)).resolves.toMatchObject({
      state: "running",
      currentStep: "request_accepted",
    });
  });

  it.each([
    {
      label: "pending",
      attempt: {
        state: "pending" as const,
        attemptId: "polar_checkout_deletion_pending",
      },
    },
    {
      label: "open",
      attempt: {
        state: "open" as const,
        attemptId: "polar_checkout_deletion_open",
        checkoutId: "checkout-deletion-open",
      },
    },
  ])("reports a $label checkout before account deletion starts", async ({ attempt }) => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.billingAccountId, { polarCheckoutAttempt: attempt });
    });
    const confirmationStakes = await asUser.query(api.accountDeletion.index.stakes);

    await expect(
      asUser.mutation(api.accountDeletion.index.request, {
        completionCapability,
        confirmationPhrase: buildAccountDeletionConfirmationPhrase(confirmationStakes),
        confirmationStakesSnapshot: serializeAccountDeletionConfirmationStakes(confirmationStakes),
      }),
    ).resolves.toEqual({ state: "billing_checkout_pending" });
    const stored = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      runs: await ctx.db.query("workflow_accountDeletion_runs").collect(),
    }));
    expect(stored.user?.accountDeletion).toBeUndefined();
    expect(stored.runs).toEqual([]);
  });

  it("rejects staff self-deletion without removing staff access", async () => {
    const staff = await seedUser({ email: "nicu@samebase.com" });

    await expect(
      staff.asUser.mutation(api.accountDeletion.index.request, {
        completionCapability,
        confirmationPhrase: zeroStakesConfirmationPhrase,
        confirmationStakesSnapshot: "staff deletion is rejected before confirmation",
      }),
    ).rejects.toThrow("Staff accounts cannot request account deletion.");
    await expect(
      staff.asUser.query(api.accountDeletion.index.listForAdmin, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({ page: [] });
  });

  it("exposes status only for the current deleting user", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const other = await seedUser({ email: "grace@example.com", t: owner.t });
    const status = await requestAccepted(owner.asUser);

    await expect(owner.asUser.query(api.accountDeletion.index.status)).resolves.toEqual(status);
    await expect(other.asUser.query(api.accountDeletion.index.status)).resolves.toBeNull();
  });

  it("keeps deletion status readable while the user marker is finalizing", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const status = await requestAccepted(owner.asUser);

    await owner.t.run(async (ctx) => {
      await ctx.db.patch(owner.ids.userId, {
        accountDeletion: {
          state: "finalizing",
          runId: status.runId,
          requestedAt: status.requestedAt,
        },
      });
    });

    await expect(owner.asUser.query(api.accountDeletion.index.status)).resolves.toMatchObject({
      completionCapability,
      currentStep: "request_accepted",
      runId: status.runId,
      state: "running",
    });
  });

  it("exposes only a scrubbed completion receipt by capability", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const requested = await requestAccepted(owner.asUser);

    await expect(
      owner.t.query(api.accountDeletion.index.completion, { completionCapability }),
    ).resolves.toBeNull();
    await expect(
      owner.t.query(api.accountDeletion.index.completion, { completionCapability: "invalid" }),
    ).resolves.toBeNull();

    const completedAt = requested.latestProgressAt + 1;
    await owner.t.run(async (ctx) => {
      await ctx.db.replace(requested.runId, {
        identity: { state: "scrubbed" },
        completionCapability,
        state: "succeeded",
        currentStep: "finish",
        requestedAt: requested.requestedAt,
        updatedAt: completedAt,
        retryCount: 0,
        completedAt,
        outcomes: notStartedOutcomes,
      });
    });

    await expect(
      owner.t.query(api.accountDeletion.index.completion, { completionCapability }),
    ).resolves.toEqual({ state: "succeeded", completedAt });
  });

  it("provides safe paginated staff list and detail results", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const staff = await seedUser({ email: "nicu@samebase.com", t: owner.t });
    const run = await requestAccepted(owner.asUser);

    await expect(
      owner.asUser.query(api.accountDeletion.index.listForAdmin, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow("Access denied");

    const list = await staff.asUser.query(api.accountDeletion.index.listForAdmin, {
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(list.page).toEqual([
      expect.objectContaining({
        runId: run.runId,
        email: "ada@example.com",
        state: "running",
        outcomes: notStartedOutcomes,
      }),
    ]);
    expect(list.page[0]).not.toHaveProperty("userId");
    expect(list.page[0]).not.toHaveProperty("initiatingSessionId");
    expect(list.page[0]).not.toHaveProperty("stagedFileCount");

    const detail = await staff.asUser.query(api.accountDeletion.index.detailForAdmin, {
      runId: run.runId,
    });
    expect(detail).toMatchObject({
      run: {
        runId: run.runId,
        email: "ada@example.com",
        outcomes: notStartedOutcomes,
        dataDeletion: {
          vaultsAndStagedChanges: { state: "not_started" },
        },
      },
      events: [{ step: "request_accepted", level: "info" }],
    });
    expect(detail?.events[0]).not.toHaveProperty("userId");
    expect(detail?.events[0]).not.toHaveProperty("email");
  });

  it("represents started work, required attention errors, and scrubbed success legally", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const staff = await seedUser({ email: "nicu@samebase.com", t: owner.t });
    const requested = await requestAccepted(owner.asUser);

    await owner.t.run(async (ctx) => {
      const running = await ctx.db.get(requested.runId);
      if (running === null || running.state !== "running") {
        throw new Error("Expected running account deletion run.");
      }
      await ctx.db.replace(requested.runId, {
        ...running,
        state: "needs_attention",
        latestSafeError: "Billing cancellation needs staff attention.",
        updatedAt: running.updatedAt + 1,
        outcomes: {
          ...running.outcomes,
          billing: {
            state: "failed",
            safeError: "Billing cancellation needs staff attention.",
          },
        },
      });
    });

    const attention = await staff.asUser.query(api.accountDeletion.index.detailForAdmin, {
      runId: requested.runId,
    });
    expect(attention?.run).toMatchObject({
      state: "needs_attention",
      latestSafeError: "Billing cancellation needs staff attention.",
      outcomes: {
        billing: {
          state: "failed",
          safeError: "Billing cancellation needs staff attention.",
        },
      },
    });

    const succeededOutcomes = {
      billing: { state: "succeeded" as const },
      providerRevocation: {
        state: "completed" as const,
        github: {
          state: "unconfirmed" as const,
          safeError: "GitHub OAuth revocation could not be confirmed." as const,
        },
        cloudflare: { state: "revoked" as const },
        convex: {
          state: "manual_revocation_required" as const,
          safeNotice:
            "Convex OAuth cannot be revoked by Samebase. Previously issued production and preview deploy keys remain usable until the user revokes Samebase in Convex Authorized Applications." as const,
        },
      },
      completionEmail: {
        state: "delivery_failed" as const,
        safeError: "Completion email delivery was not confirmed.",
      },
    };
    await owner.t.run(async (ctx) => {
      await ctx.db.replace(requested.runId, {
        identity: { state: "scrubbed" },
        completionCapability,
        state: "succeeded",
        currentStep: "finish",
        requestedAt: requested.requestedAt,
        updatedAt: requested.latestProgressAt + 3,
        retryCount: 2,
        completedAt: requested.latestProgressAt + 3,
        outcomes: succeededOutcomes,
      });
    });

    const succeeded = await staff.asUser.query(api.accountDeletion.index.detailForAdmin, {
      runId: requested.runId,
    });
    expect(succeeded?.run).toMatchObject({
      state: "succeeded",
      completedAt: requested.latestProgressAt + 3,
      outcomes: succeededOutcomes,
      dataDeletion: { state: "receipt_scrubbed" },
    });
    expect(succeeded?.run).not.toHaveProperty("email");
    expect(succeeded?.run).not.toHaveProperty("userId");
    expect(succeeded?.run).not.toHaveProperty("stagedFileCount");
  });

  it("rejects illegal workflow ownership and missing attention errors", async () => {
    const { ids, t } = await seedUser({ email: "ada@example.com" });

    await expect(
      t.run(async (ctx) => {
        await ctx.db.insert("workflow_accountDeletion_runs", {
          identity: { state: "active", userId: ids.userId, email: "ada@example.com" },
          completionCapability,
          state: "queued",
          // @ts-expect-error A queued run cannot own a started workflow.
          workflow: { state: "started", workflowId: "workflow-1", attempt: 1 },
          currentStep: "request_accepted",
          requestedAt: now,
          updatedAt: now,
          initiatingSessionId: ids.sessionId,
          retryCount: 0,
          outcomes: notStartedOutcomes,
        });
      }),
    ).rejects.toThrow();

    await expect(
      t.run(async (ctx) => {
        // @ts-expect-error A needs-attention run requires a safe error.
        await ctx.db.insert("workflow_accountDeletion_runs", {
          identity: { state: "active", userId: ids.userId, email: "ada@example.com" },
          completionCapability,
          state: "needs_attention",
          workflow: { state: "started", workflowId: "workflow-1", attempt: 1 },
          currentStep: "cancel_billing",
          requestedAt: now,
          updatedAt: now,
          initiatingSessionId: ids.sessionId,
          retryCount: 0,
          outcomes: notStartedOutcomes,
        });
      }),
    ).rejects.toThrow();
  });

  it("rejects active runs without a completion capability", async () => {
    const { ids, t } = await seedUser({ email: "ada@example.com" });

    await expect(
      t.run(async (ctx) => {
        // @ts-expect-error Active deletion runs always require the browser capability.
        await ctx.db.insert("workflow_accountDeletion_runs", {
          identity: { state: "active", userId: ids.userId, email: "ada@example.com" },
          state: "queued",
          workflow: { state: "not_started" },
          currentStep: "request_accepted",
          requestedAt: now,
          updatedAt: now,
          initiatingSessionId: ids.sessionId,
          retryCount: 0,
          outcomes: notStartedOutcomes,
        });
      }),
    ).rejects.toThrow();
  });
});

describe("account deletion stakes and typed confirmation", () => {
  it("counts organization billing only when the deleting user is the sole member", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const membershipIds = await owner.t.run(async (ctx) => {
      const remainingUserId = await ctx.db.insert("users", {
        email: "grace@example.com",
        isApproved: true,
      });
      const remainingMembershipId = await ctx.db.insert("organizationMemberships", {
        organizationId: owner.ids.organizationId,
        userId: remainingUserId,
      });
      await ctx.db.patch(owner.ids.billingAccountId, {
        provider: "polar",
        plan: "pro",
        status: "active",
        polarExternalCustomerId: "shared-customer",
      });
      return { remainingMembershipId };
    });

    await expect(owner.asUser.query(api.accountDeletion.index.stakes)).resolves.toMatchObject({
      hasActiveSubscription: false,
    });
    await owner.t.run(async (ctx) => {
      await ctx.db.delete(membershipIds.remainingMembershipId);
    });
    await expect(owner.asUser.query(api.accountDeletion.index.stakes)).resolves.toMatchObject({
      hasActiveSubscription: true,
    });
  });

  it("counts sole-member organization vaults and real staged changes", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const other = await seedUser({ email: "grace@example.com", t: owner.t });
    const firstVaultId = await seedVault(owner.t, owner.ids.userId, "zeta");
    const secondVaultId = await seedVault(owner.t, owner.ids.userId, "alpha");
    const otherVaultId = await seedVault(owner.t, other.ids.userId, "other");
    await seedStagedFile(owner.t, {
      userId: owner.ids.userId,
      vaultId: firstVaultId,
      filePath: "changed.md",
      changed: true,
    });
    await seedStagedFile(owner.t, {
      userId: owner.ids.userId,
      vaultId: firstVaultId,
      filePath: "feature.md",
      changed: true,
      branch: "feature/zeta",
    });
    await seedStagedFile(owner.t, {
      userId: owner.ids.userId,
      vaultId: firstVaultId,
      filePath: "unchanged.md",
      changed: false,
    });
    await seedStagedFile(owner.t, {
      userId: owner.ids.userId,
      vaultId: secondVaultId,
      filePath: "second-vault.md",
      changed: true,
      branch: "feature/alpha",
    });
    await seedStagedFile(owner.t, {
      userId: other.ids.userId,
      vaultId: otherVaultId,
      filePath: "other-owner.md",
      changed: true,
    });

    await expect(owner.asUser.query(api.accountDeletion.index.stakes)).resolves.toEqual({
      vaultCount: 2,
      uncommittedFileChangeCount: 3,
      hasActiveSubscription: false,
      affectedVaults: {
        state: "complete",
        vaults: [
          {
            vaultId: secondVaultId,
            repositoryFullName: "ada/alpha",
            uncommittedFileChangeCount: 1,
            branches: [{ branch: "feature/alpha", uncommittedFileChangeCount: 1 }],
          },
          {
            vaultId: firstVaultId,
            repositoryFullName: "ada/zeta",
            uncommittedFileChangeCount: 2,
            branches: [
              { branch: "feature/zeta", uncommittedFileChangeCount: 1 },
              { branch: "main", uncommittedFileChangeCount: 1 },
            ],
          },
        ],
      },
    });
    await expect(other.asUser.query(api.accountDeletion.index.stakes)).resolves.toEqual({
      vaultCount: 1,
      uncommittedFileChangeCount: 1,
      hasActiveSubscription: false,
      affectedVaults: {
        state: "complete",
        vaults: [
          {
            vaultId: otherVaultId,
            repositoryFullName: "ada/other",
            uncommittedFileChangeCount: 1,
            branches: [{ branch: "main", uncommittedFileChangeCount: 1 }],
          },
        ],
      },
    });
  });

  it("does not return a partial review list when a changed vault is not reviewable", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    const connectedVaultId = await seedVault(t, ids.userId);
    const disconnectedVaultId = await t.run(async (ctx) => {
      return await ctx.db.insert("vaults", {
        organizationId: ids.organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
    });
    await seedStagedFile(t, {
      userId: ids.userId,
      vaultId: connectedVaultId,
      filePath: "connected.md",
      changed: true,
    });
    await seedStagedFile(t, {
      userId: ids.userId,
      vaultId: disconnectedVaultId,
      filePath: "disconnected.md",
      changed: true,
    });

    await expect(asUser.query(api.accountDeletion.index.stakes)).resolves.toEqual({
      vaultCount: 2,
      uncommittedFileChangeCount: 2,
      hasActiveSubscription: false,
      affectedVaults: { state: "unavailable" },
    });
  });

  it("reports exact counts at the cap and more_than_cap past it", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    const vaultId = await seedVault(t, ids.userId);
    await t.run(async (ctx) => {
      for (let index = 0; index < ACCOUNT_DELETION_UNCOMMITTED_FILE_CHANGE_COUNT_CAP; index += 1) {
        await ctx.db.insert("vaultStagedFiles", {
          vaultId,
          fileDeleted: false,
          kind: "text",
          filePath: `file-${index}.md`,
          initialFilePath: `file-${index}.md`,
          content: "draft",
          initialContent: "",
          parentCommitSha: null,
          lastEditTime: now,
          lastEditUserId: ids.userId,
          branch: "main",
          version: 1,
        });
      }
    });

    await expect(asUser.query(api.accountDeletion.index.stakes)).resolves.toEqual({
      vaultCount: 1,
      uncommittedFileChangeCount: ACCOUNT_DELETION_UNCOMMITTED_FILE_CHANGE_COUNT_CAP,
      hasActiveSubscription: false,
      affectedVaults: {
        state: "complete",
        vaults: [
          {
            vaultId,
            repositoryFullName: "ada/test-vault",
            uncommittedFileChangeCount: ACCOUNT_DELETION_UNCOMMITTED_FILE_CHANGE_COUNT_CAP,
            branches: [
              {
                branch: "main",
                uncommittedFileChangeCount: ACCOUNT_DELETION_UNCOMMITTED_FILE_CHANGE_COUNT_CAP,
              },
            ],
          },
        ],
      },
    });

    await seedStagedFile(t, {
      userId: ids.userId,
      vaultId,
      filePath: "one-past-the-cap.md",
      changed: true,
    });

    await expect(asUser.query(api.accountDeletion.index.stakes)).resolves.toEqual({
      vaultCount: 1,
      uncommittedFileChangeCount: "more_than_cap",
      hasActiveSubscription: false,
      affectedVaults: { state: "unavailable" },
    });
  });

  it("rejects a mismatched phrase without creating a run", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    await seedVault(t, ids.userId);

    const result = await asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
      confirmationPhrase: zeroStakesConfirmationPhrase,
      confirmationStakesSnapshot: serializeAccountDeletionConfirmationStakes(
        await asUser.query(api.accountDeletion.index.stakes),
      ),
    });

    expect(result).toEqual({ state: "stakes_changed" });
    const stored = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      runs: await ctx.db.query("workflow_accountDeletion_runs").collect(),
      events: await ctx.db.query("workflow_accountDeletion_events").collect(),
    }));
    expect(stored.user?.accountDeletion).toBeUndefined();
    expect(stored.runs).toEqual([]);
    expect(stored.events).toEqual([]);
    await expect(asUser.query(api.accountDeletion.index.status)).resolves.toBeNull();
  });

  it("accepts the phrase that names the current vaults and changes", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    const vaultId = await seedVault(t, ids.userId);
    await seedStagedFile(t, { userId: ids.userId, vaultId, filePath: "a.md", changed: true });
    await seedStagedFile(t, { userId: ids.userId, vaultId, filePath: "b.md", changed: true });

    const status = await requestAccepted(
      asUser,
      buildAccountDeletionConfirmationPhrase({ vaultCount: 1, uncommittedFileChangeCount: 2 }),
    );

    expect(status).toMatchObject({ state: "running", currentStep: "request_accepted" });
    const user = await t.run(async (ctx) => await ctx.db.get(ids.userId));
    expect(user?.accountDeletion).toMatchObject({ state: "deleting", runId: status.runId });
  });

  it("rejects when counts move between phrase build and request", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    const staleStakes = await asUser.query(api.accountDeletion.index.stakes);
    const stalePhrase = buildAccountDeletionConfirmationPhrase(staleStakes);
    await seedVault(t, ids.userId);

    const raced = await asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
      confirmationPhrase: stalePhrase,
      confirmationStakesSnapshot: serializeAccountDeletionConfirmationStakes(staleStakes),
    });
    expect(raced).toEqual({ state: "stakes_changed" });

    const currentStakes = await asUser.query(api.accountDeletion.index.stakes);

    const accepted = await asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
      confirmationPhrase: buildAccountDeletionConfirmationPhrase(currentStakes),
      confirmationStakesSnapshot: serializeAccountDeletionConfirmationStakes(currentStakes),
    });
    expect(accepted).toMatchObject({ state: "accepted", status: { state: "running" } });
  });

  it("rejects confirmation when a change moves but aggregate counts stay the same", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    const firstVaultId = await seedVault(t, ids.userId, "first");
    const secondVaultId = await seedVault(t, ids.userId, "second");
    const initialFileId = await seedStagedFile(t, {
      userId: ids.userId,
      vaultId: firstVaultId,
      filePath: "initial.md",
      changed: true,
    });
    const staleStakes = await asUser.query(api.accountDeletion.index.stakes);

    await t.run(async (ctx) => await ctx.db.delete(initialFileId));
    await seedStagedFile(t, {
      userId: ids.userId,
      vaultId: secondVaultId,
      filePath: "moved.md",
      branch: "feature/moved",
      changed: true,
    });

    const result = await asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
      confirmationPhrase: buildAccountDeletionConfirmationPhrase(staleStakes),
      confirmationStakesSnapshot: serializeAccountDeletionConfirmationStakes(staleStakes),
    });

    expect(result).toEqual({ state: "stakes_changed" });
    await expect(asUser.query(api.accountDeletion.index.stakes)).resolves.toMatchObject({
      vaultCount: 2,
      uncommittedFileChangeCount: 1,
      affectedVaults: {
        state: "complete",
        vaults: [
          {
            repositoryFullName: "ada/second",
            branches: [{ branch: "feature/moved", uncommittedFileChangeCount: 1 }],
          },
        ],
      },
    });
  });

  it("rejects confirmation when the subscription warning changes", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    const staleStakes = await asUser.query(api.accountDeletion.index.stakes);

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.billingAccountId, {
        provider: "polar",
        plan: "pro",
        status: "active",
      });
    });

    const result = await asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
      confirmationPhrase: buildAccountDeletionConfirmationPhrase(staleStakes),
      confirmationStakesSnapshot: serializeAccountDeletionConfirmationStakes(staleStakes),
    });

    expect(result).toEqual({ state: "stakes_changed" });
    await expect(asUser.query(api.accountDeletion.index.stakes)).resolves.toEqual({
      vaultCount: 0,
      uncommittedFileChangeCount: 0,
      hasActiveSubscription: true,
      affectedVaults: { state: "complete", vaults: [] },
    });
  });

  it("ignores the phrase for an already-deleting account", async () => {
    const { asUser } = await seedUser({ email: "ada@example.com" });
    const first = await requestAccepted(asUser);

    const again = await asUser.mutation(api.accountDeletion.index.request, {
      completionCapability,
      confirmationPhrase: "not the phrase",
      confirmationStakesSnapshot: "not the stakes",
    });

    expect(again).toEqual({ state: "accepted", status: first });
  });
});
