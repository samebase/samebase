import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { REPOSITORY_SUMMARY_REFRESH_INTERVAL_MS } from "./repositorySummaryModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

const now = 1_700_000_000_000;

async function createUserFixture() {
  const t = makeConvexTest();
  const userId = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      }),
  );
  const asUser = t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
  return { asUser, t, userId };
}

type UserFixture = Awaited<ReturnType<typeof createUserFixture>>;

async function connectRepository(
  fixture: UserFixture,
  args: {
    owner?: string;
    name: string;
    databaseId?: string;
    nodeId?: string;
    defaultBranch?: string;
  },
) {
  const owner = args.owner ?? "Ada";
  const databaseId = args.databaseId ?? `database-${args.name}`;
  const nodeId = args.nodeId ?? `node-${args.name}`;
  const defaultBranch = args.defaultBranch ?? "main";
  const ids = await fixture.t.mutation(
    internal.vault.records.createInitializingExistingRepositoryVaultForUser,
    {
      userId: fixture.userId,
      ghRepoOwner: owner,
      ghRepoName: args.name,
    },
  );
  const connection = {
    vaultId: ids.vaultId,
    runId: ids.runId,
    userId: fixture.userId,
    ghRepoId: databaseId,
    ghRepoNodeId: nodeId,
    ghRepoOwner: owner,
    ghRepoName: args.name,
    defaultBranch,
    visibility: "private" as const,
  };
  await fixture.t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, connection);
  return { ...ids, connection };
}

async function readSummary(t: ConvexTest, vaultId: Id<"vaults">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("vaultRepositorySummaries")
        .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
        .unique(),
  );
}

async function readSummariesForUser(t: ConvexTest, userId: Id<"users">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("vaultRepositorySummaries")
        .withIndex("by_userId_and_lifecycle_state_and_refreshEligibleAt", (q) =>
          q.eq("userId", userId),
        )
        .take(50),
  );
}

async function readDirectoryRevision(t: ConvexTest, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const state = await ctx.db
      .query("vaultRepositorySummaryDirectoryStates")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return state?.revision ?? 0;
  });
}

async function scheduleAndClaim(fixture: UserFixture, vaultIds: Id<"vaults">[]) {
  await expect(
    fixture.asUser.mutation(api.repositorySummary.requestRepositorySummaryRefresh, {
      visibleVaultIds: vaultIds,
    }),
  ).resolves.toEqual({ state: "scheduled", repositoryCount: vaultIds.length });

  const firstSummary = await readSummary(fixture.t, vaultIds[0]);
  if (
    firstSummary?.lifecycle.state !== "scheduled" ||
    firstSummary.lifecycle.source !== "summary_batch"
  ) {
    throw new Error("Expected the repository summary batch to be scheduled.");
  }
  const { batchId, workpoolJobId } = firstSummary.lifecycle;
  const input = await fixture.t.mutation(internal.repositorySummary.claimRepositorySummaryBatch, {
    userId: fixture.userId,
    batchId,
    vaultIds,
  });
  if (input.state !== "ready") {
    throw new Error("Expected the repository summary batch claim to be ready.");
  }
  return { batchId, input, workpoolJobId };
}

describe("repository summary state machine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("creates one summary and directory revision atomically with the connected vault", async () => {
    const fixture = await createUserFixture();
    const connected = await connectRepository(fixture, {
      name: "inventory",
      databaseId: "123",
      nodeId: "R_123",
    });

    await expect(readSummary(fixture.t, connected.vaultId)).resolves.toMatchObject({
      userId: fixture.userId,
      vaultId: connected.vaultId,
      refreshEligibleAt: 0,
      lifecycle: { state: "idle" },
      publication: { state: "unobserved" },
    });
    await expect(readDirectoryRevision(fixture.t, fixture.userId)).resolves.toBe(2);

    await fixture.t.mutation(
      internal.vault.records.connectExistingRepositoryVaultGitHub,
      connected.connection,
    );

    await expect(readSummariesForUser(fixture.t, fixture.userId)).resolves.toHaveLength(1);
    await expect(readDirectoryRevision(fixture.t, fixture.userId)).resolves.toBe(2);
  });

  it("paginates vaults in stable creation order and rejects pages larger than 25", async () => {
    const fixture = await createUserFixture();
    await connectRepository(fixture, { name: "zulu" });
    await connectRepository(fixture, { name: "Alpha" });
    await connectRepository(fixture, { name: "bravo" });
    const directoryRevision = await readDirectoryRevision(fixture.t, fixture.userId);

    const firstPage = await fixture.asUser.query(
      api.repositorySummary.listRepositorySummaryDirectoryPage,
      {
        directoryRevision,
        paginationOpts: { cursor: null, numItems: 2 },
      },
    );
    expect(firstPage.page.map((entry) => entry.repositoryFullName)).toEqual([
      "Ada/zulu",
      "Ada/Alpha",
    ]);
    expect(firstPage.isDone).toBe(false);

    const secondPage = await fixture.asUser.query(
      api.repositorySummary.listRepositorySummaryDirectoryPage,
      {
        directoryRevision,
        paginationOpts: { cursor: firstPage.continueCursor, numItems: 2 },
      },
    );
    expect(secondPage.page.map((entry) => entry.repositoryFullName)).toEqual(["Ada/bravo"]);
    expect(secondPage.isDone).toBe(true);
    await connectRepository(fixture, { name: "new-revision" });
    await expect(
      fixture.asUser.query(api.repositorySummary.listRepositorySummaryDirectoryPage, {
        directoryRevision,
        paginationOpts: { cursor: firstPage.continueCursor, numItems: 2 },
      }),
    ).rejects.toThrow("Repository summary directory revision changed while loading pages.");

    await expect(
      fixture.asUser.query(api.repositorySummary.listRepositorySummaryDirectoryPage, {
        directoryRevision,
        paginationOpts: { cursor: null, numItems: 26 },
      }),
    ).rejects.toThrow("Repository summary directory pages must request between 1 and 25 items.");
    await expect(
      fixture.asUser.query(api.repositorySummary.listRepositorySummaryDirectoryPage, {
        directoryRevision,
        paginationOpts: { cursor: null, numItems: 25, maximumRowsRead: 26 },
      }),
    ).rejects.toThrow("Repository summary directory pages may read at most 25 rows.");
  });

  it("keeps provisioning and setup-failed vaults in the repository directory", async () => {
    const fixture = await createUserFixture();
    const provisioning = await fixture.t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId: fixture.userId,
        ghRepoOwner: "Ada",
        ghRepoName: "provisioning",
      },
    );
    const failed = await fixture.t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId: fixture.userId,
        ghRepoOwner: "Ada",
        ghRepoName: "failed",
      },
    );
    await fixture.t.mutation(internal.vault.records.markGithubProvisioningFailed, {
      runId: failed.runId,
    });
    const connected = await connectRepository(fixture, { name: "connected" });
    const directoryRevision = await readDirectoryRevision(fixture.t, fixture.userId);

    const page = await fixture.asUser.query(
      api.repositorySummary.listRepositorySummaryDirectoryPage,
      {
        directoryRevision,
        paginationOpts: { cursor: null, numItems: 25 },
      },
    );
    expect(page.page).toMatchObject([
      {
        vaultId: provisioning.vaultId,
        repositoryFullName: "Ada/provisioning",
        state: { state: "provisioning", startedAt: now },
      },
      {
        vaultId: failed.vaultId,
        repositoryFullName: "Ada/failed",
        state: { state: "setup_failed", failedAt: now },
      },
      {
        vaultId: connected.vaultId,
        repositoryFullName: "Ada/connected",
        state: {
          state: "connected",
          summary: {
            lifecycle: { state: "idle" },
            publication: { state: "unobserved" },
          },
        },
      },
    ]);
  });

  it("rolls back connection when a conflicting summary violates ownership", async () => {
    const fixture = await createUserFixture();
    const otherUserId = await fixture.t.run(
      async (ctx) =>
        await ctx.db.insert("users", {
          email: "grace@example.com",
          isApproved: true,
        }),
    );
    const ids = await fixture.t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId: fixture.userId,
        ghRepoOwner: "Ada",
        ghRepoName: "ownership-conflict",
      },
    );
    await fixture.t.run(
      async (ctx) =>
        await ctx.db.insert("vaultRepositorySummaries", {
          userId: otherUserId,
          vaultId: ids.vaultId,
          refreshEligibleAt: 0,
          lifecycle: { state: "idle" },
          publication: { state: "unobserved" },
        }),
    );

    await expect(
      fixture.t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: fixture.userId,
        ghRepoId: "ownership-conflict-database",
        ghRepoNodeId: "ownership-conflict-node",
        ghRepoOwner: "Ada",
        ghRepoName: "ownership-conflict",
        defaultBranch: "main",
        visibility: "private",
      }),
    ).rejects.toThrow("Connected vault repository summary identity cannot be changed.");
    await expect(
      fixture.t.run(async (ctx) => await ctx.db.get(ids.vaultId)),
    ).resolves.toMatchObject({
      state: "provisioning",
      githubMode: "connect_existing_repository",
    });
    await expect(readSummary(fixture.t, ids.vaultId)).resolves.toMatchObject({
      userId: otherUserId,
      lifecycle: { state: "idle" },
    });
    await expect(readDirectoryRevision(fixture.t, fixture.userId)).resolves.toBe(1);
  });

  it("schedules at most 25 eligible summaries with visible vaults first", async () => {
    const fixture = await createUserFixture();
    const vaultIds: Id<"vaults">[] = [];
    for (let index = 0; index < 27; index += 1) {
      const connected = await connectRepository(fixture, {
        name: `repository-${String(index).padStart(2, "0")}`,
      });
      vaultIds.push(connected.vaultId);
    }
    const visibleVaultIds = vaultIds.slice(-2);

    await expect(
      fixture.asUser.mutation(api.repositorySummary.requestRepositorySummaryRefresh, {
        visibleVaultIds,
      }),
    ).resolves.toEqual({ state: "scheduled", repositoryCount: 25 });

    const summaries = await readSummariesForUser(fixture.t, fixture.userId);
    const scheduled = summaries.filter((summary) => summary.lifecycle.state === "scheduled");
    expect(scheduled).toHaveLength(25);
    expect(scheduled.map((summary) => summary.vaultId)).toEqual(
      expect.arrayContaining(visibleVaultIds),
    );
    await expect(readSummary(fixture.t, vaultIds[23])).resolves.toMatchObject({
      lifecycle: { state: "idle" },
    });
    await expect(readSummary(fixture.t, vaultIds[24])).resolves.toMatchObject({
      lifecycle: { state: "idle" },
    });
  });

  it("does not let old scheduled rows hide a later eligible repository", async () => {
    const fixture = await createUserFixture();
    const activeVaultIds: Id<"vaults">[] = [];
    for (let index = 0; index < 25; index += 1) {
      const connected = await connectRepository(fixture, {
        name: `active-${String(index).padStart(2, "0")}`,
      });
      activeVaultIds.push(connected.vaultId);
    }
    const eligible = await connectRepository(fixture, { name: "eligible-after-active" });
    await fixture.t.run(async (ctx) => {
      for (const [index, vaultId] of activeVaultIds.entries()) {
        const summary = await ctx.db
          .query("vaultRepositorySummaries")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .unique();
        if (summary === null) {
          throw new Error("Expected a connected vault repository summary.");
        }
        await ctx.db.patch(summary._id, {
          refreshEligibleAt: now - 60_000,
          lifecycle: {
            state: "scheduled",
            source: "summary_batch",
            batchId: "old-batch",
            scheduledAt: now - 120_000,
            workpoolJobId: `old-work-${index}`,
            wait: { kind: "immediate" },
          },
        });
      }
    });

    await expect(
      fixture.asUser.mutation(api.repositorySummary.requestRepositorySummaryRefresh, {
        visibleVaultIds: [],
      }),
    ).resolves.toEqual({ state: "scheduled", repositoryCount: 1 });
    await expect(readSummary(fixture.t, eligible.vaultId)).resolves.toMatchObject({
      lifecycle: { state: "scheduled", source: "summary_batch" },
    });
  });

  it("claims the GitHub node and database identities stored on the connected vault", async () => {
    const fixture = await createUserFixture();
    const connected = await connectRepository(fixture, {
      name: "identity",
      databaseId: "987654321",
      nodeId: "R_node_987",
    });

    const claimed = await scheduleAndClaim(fixture, [connected.vaultId]);

    expect(claimed.input.repositories).toEqual([
      {
        vaultId: connected.vaultId,
        repositoryNodeId: "R_node_987",
        expectedRepositoryDatabaseId: "987654321",
      },
    ]);
  });

  it("publishes canonical repository data and preserves publishedAt for identical later content", async () => {
    const fixture = await createUserFixture();
    const connected = await connectRepository(fixture, { name: "old-name" });
    const first = await scheduleAndClaim(fixture, [connected.vaultId]);

    await fixture.t.mutation(internal.repositorySummary.completeRepositorySummaryBatch, {
      userId: fixture.userId,
      batchId: first.batchId,
      results: [
        {
          state: "ready",
          vaultId: connected.vaultId,
          repositoryFullName: "Grace/Renamed",
          defaultBranch: {
            state: "ready",
            name: "trunk",
            headSha: "first-head",
            checkState: "success",
          },
          openPullRequestCount: 7,
        },
      ],
    });

    await expect(
      fixture.t.run(async (ctx) => await ctx.db.get(connected.vaultId)),
    ).resolves.toMatchObject({
      owner: "Grace",
      name: "Renamed",
      defaultBranch: "trunk",
    });
    await expect(readSummary(fixture.t, connected.vaultId)).resolves.toMatchObject({
      lifecycle: { state: "idle" },
      publication: {
        state: "complete",
        defaultBranch: {
          state: "ready",
          name: "trunk",
          headSha: "first-head",
          checkState: "success",
        },
        openPullRequestCount: 7,
        publishedAt: now,
        checkedAt: now,
      },
    });

    const later = now + REPOSITORY_SUMMARY_REFRESH_INTERVAL_MS + 1;
    vi.setSystemTime(later);
    const second = await scheduleAndClaim(fixture, [connected.vaultId]);
    await fixture.t.mutation(internal.repositorySummary.completeRepositorySummaryBatch, {
      userId: fixture.userId,
      batchId: second.batchId,
      results: [
        {
          state: "ready",
          vaultId: connected.vaultId,
          repositoryFullName: "Grace/Renamed",
          defaultBranch: {
            state: "ready",
            name: "trunk",
            headSha: "first-head",
            checkState: "success",
          },
          openPullRequestCount: 7,
        },
      ],
    });

    await expect(readSummary(fixture.t, connected.vaultId)).resolves.toMatchObject({
      publication: {
        state: "complete",
        publishedAt: now,
        checkedAt: later,
      },
    });
  });

  it("fails only an unavailable repository and retains its last complete publication", async () => {
    const fixture = await createUserFixture();
    const missing = await connectRepository(fixture, { name: "missing" });
    const healthy = await connectRepository(fixture, { name: "healthy" });
    const initial = await scheduleAndClaim(fixture, [missing.vaultId, healthy.vaultId]);
    await fixture.t.mutation(internal.repositorySummary.completeRepositorySummaryBatch, {
      userId: fixture.userId,
      batchId: initial.batchId,
      results: [
        {
          state: "ready",
          vaultId: missing.vaultId,
          repositoryFullName: "Ada/missing",
          defaultBranch: {
            state: "ready",
            name: "main",
            headSha: "missing-old-head",
            checkState: "success",
          },
          openPullRequestCount: 1,
        },
        {
          state: "ready",
          vaultId: healthy.vaultId,
          repositoryFullName: "Ada/healthy",
          defaultBranch: {
            state: "ready",
            name: "main",
            headSha: "healthy-old-head",
            checkState: "success",
          },
          openPullRequestCount: 2,
        },
      ],
    });
    const missingBefore = await readSummary(fixture.t, missing.vaultId);
    if (missingBefore?.publication.state !== "complete") {
      throw new Error("Expected the missing repository to have a prior complete publication.");
    }

    const later = now + REPOSITORY_SUMMARY_REFRESH_INTERVAL_MS + 1;
    vi.setSystemTime(later);
    const refresh = await scheduleAndClaim(fixture, [missing.vaultId, healthy.vaultId]);
    await fixture.t.mutation(internal.repositorySummary.completeRepositorySummaryBatch, {
      userId: fixture.userId,
      batchId: refresh.batchId,
      results: [
        {
          state: "unavailable",
          vaultId: missing.vaultId,
        },
        {
          state: "ready",
          vaultId: healthy.vaultId,
          repositoryFullName: "Ada/healthy",
          defaultBranch: {
            state: "ready",
            name: "main",
            headSha: "healthy-new-head",
            checkState: "running",
          },
          openPullRequestCount: 3,
        },
      ],
    });

    const missingAfter = await readSummary(fixture.t, missing.vaultId);
    expect(missingAfter).toMatchObject({
      refreshEligibleAt: later + REPOSITORY_SUMMARY_REFRESH_INTERVAL_MS,
      lifecycle: {
        state: "unavailable",
        observedAt: later,
        reason: "repository_unavailable",
      },
    });
    expect(missingAfter?.publication).toEqual(missingBefore.publication);
    await expect(readSummary(fixture.t, healthy.vaultId)).resolves.toMatchObject({
      lifecycle: { state: "idle" },
      publication: {
        state: "complete",
        defaultBranch: {
          state: "ready",
          headSha: "healthy-new-head",
          checkState: "running",
        },
        openPullRequestCount: 3,
        publishedAt: later,
        checkedAt: later,
      },
    });
  });

  it("gives rate-limit deferrals new identities and ignores stale results and callbacks", async () => {
    const fixture = await createUserFixture();
    const connected = await connectRepository(fixture, { name: "deferred" });
    const original = await scheduleAndClaim(fixture, [connected.vaultId]);
    const retryAt = now + 30_000;

    await fixture.t.mutation(internal.repositorySummary.deferRepositorySummaryBatch, {
      userId: fixture.userId,
      batchId: original.batchId,
      vaultIds: [connected.vaultId],
      reason: "rate_limit",
      retryAt,
    });
    const deferred = await readSummary(fixture.t, connected.vaultId);
    if (
      deferred?.lifecycle.state !== "scheduled" ||
      deferred.lifecycle.source !== "summary_batch"
    ) {
      throw new Error("Expected the deferred repository summary to be rescheduled.");
    }
    expect(deferred).toMatchObject({
      lifecycle: {
        state: "scheduled",
        source: "summary_batch",
        wait: { kind: "rate_limit", retryAt },
      },
      publication: { state: "unobserved" },
    });
    expect(deferred.lifecycle.batchId).not.toBe(original.batchId);
    expect(deferred.lifecycle.workpoolJobId).not.toBe(original.workpoolJobId);
    const revisionAfterDeferral = await readDirectoryRevision(fixture.t, fixture.userId);

    await fixture.t.mutation(internal.repositorySummary.completeRepositorySummaryBatch, {
      userId: fixture.userId,
      batchId: original.batchId,
      results: [
        {
          state: "ready",
          vaultId: connected.vaultId,
          repositoryFullName: "Ada/deferred",
          defaultBranch: {
            state: "ready",
            name: "main",
            headSha: "stale-head",
            checkState: "failure",
          },
          openPullRequestCount: 99,
        },
      ],
    });
    await fixture.t.mutation(internal.repositorySummary.handleRepositorySummaryBatchComplete, {
      // @ts-expect-error Workpool persists its branded WorkId as this validated string.
      workId: original.workpoolJobId,
      context: {
        userId: fixture.userId,
        batchId: original.batchId,
        vaultIds: [connected.vaultId],
      },
      result: { kind: "success", returnValue: null },
    });

    await expect(readSummary(fixture.t, connected.vaultId)).resolves.toMatchObject({
      lifecycle: {
        state: "scheduled",
        batchId: deferred.lifecycle.batchId,
        workpoolJobId: deferred.lifecycle.workpoolJobId,
        wait: { kind: "rate_limit", retryAt },
      },
      publication: { state: "unobserved" },
    });
    await expect(readDirectoryRevision(fixture.t, fixture.userId)).resolves.toBe(
      revisionAfterDeferral,
    );

    vi.setSystemTime(retryAt);
    await expect(
      fixture.t.mutation(internal.repositorySummary.claimRepositorySummaryBatch, {
        userId: fixture.userId,
        batchId: deferred.lifecycle.batchId,
        vaultIds: [connected.vaultId],
      }),
    ).resolves.toMatchObject({ state: "ready", batchId: deferred.lifecycle.batchId });
    await expect(readDirectoryRevision(fixture.t, fixture.userId)).resolves.toBe(
      revisionAfterDeferral + 1,
    );
  });

  it("quiesces an active summary exactly once for retried vault deletion", async () => {
    const fixture = await createUserFixture();
    const connected = await connectRepository(fixture, { name: "quiesce-once" });
    await fixture.asUser.mutation(api.repositorySummary.requestRepositorySummaryRefresh, {
      visibleVaultIds: [connected.vaultId],
    });
    const beforeRevision = await readDirectoryRevision(fixture.t, fixture.userId);

    await fixture.t.mutation(internal.repositorySummary.quiesceForVaultDeletion, {
      userId: fixture.userId,
      vaultId: connected.vaultId,
    });
    const afterFirst = await readSummary(fixture.t, connected.vaultId);
    const afterFirstRevision = await readDirectoryRevision(fixture.t, fixture.userId);
    expect(afterFirst).toMatchObject({
      lifecycle: { state: "idle" },
    });
    expect(afterFirstRevision).toBe(beforeRevision + 1);

    await fixture.t.mutation(internal.repositorySummary.quiesceForVaultDeletion, {
      userId: fixture.userId,
      vaultId: connected.vaultId,
    });
    await expect(readSummary(fixture.t, connected.vaultId)).resolves.toEqual(afterFirst);
    await expect(readDirectoryRevision(fixture.t, fixture.userId)).resolves.toBe(
      afterFirstRevision,
    );
  });

  it("fails every matching active row when Workpool succeeds without a publication", async () => {
    const fixture = await createUserFixture();
    const first = await connectRepository(fixture, { name: "first-unpublished" });
    const second = await connectRepository(fixture, { name: "second-unpublished" });

    await expect(
      fixture.asUser.mutation(api.repositorySummary.requestRepositorySummaryRefresh, {
        visibleVaultIds: [first.vaultId, second.vaultId],
      }),
    ).resolves.toEqual({ state: "scheduled", repositoryCount: 2 });
    const firstSummary = await readSummary(fixture.t, first.vaultId);
    if (
      firstSummary?.lifecycle.state !== "scheduled" ||
      firstSummary.lifecycle.source !== "summary_batch"
    ) {
      throw new Error("Expected the repository summary batch to be scheduled.");
    }
    const { batchId, workpoolJobId } = firstSummary.lifecycle;

    await fixture.t.mutation(internal.repositorySummary.handleRepositorySummaryBatchComplete, {
      // @ts-expect-error Workpool persists its branded WorkId as this validated string.
      workId: workpoolJobId,
      context: {
        userId: fixture.userId,
        batchId,
        vaultIds: [first.vaultId, second.vaultId],
      },
      result: { kind: "success", returnValue: null },
    });

    for (const vaultId of [first.vaultId, second.vaultId]) {
      await expect(readSummary(fixture.t, vaultId)).resolves.toMatchObject({
        lifecycle: {
          state: "failed",
          failedAt: now,
          message: "Repository summary worker completed without publishing its observations.",
        },
        publication: { state: "unobserved" },
      });
    }
  });
});
