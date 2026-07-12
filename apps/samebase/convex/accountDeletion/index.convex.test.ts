import { describe, expect, it } from "vite-plus/test";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

const now = 1_700_000_000_000;

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
    return { userId, sessionId };
  });
  const asUser = t.withIdentity({
    subject: `${ids.userId}|${ids.sessionId}`,
    tokenIdentifier: `test:${ids.sessionId}`,
  });
  return { asUser, ids, t };
}

async function insertVault(
  t: ReturnType<typeof makeConvexTest>,
  userId: Id<"users">,
): Promise<Id<"vaults">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
  });
}

async function insertStagedFile(args: {
  t: ReturnType<typeof makeConvexTest>;
  ownerId: Id<"users">;
  lastEditUserId: Id<"users">;
  vaultId: Id<"vaults">;
  filePath: string;
  content: string;
  initialContent: string;
  parentCommitSha?: string | null;
}) {
  return await args.t.run(async (ctx) => {
    return await ctx.db.insert("fileStaging", {
      ownerId: args.ownerId,
      vaultId: args.vaultId,
      fileDeleted: false,
      filePath: args.filePath,
      initialFilePath: args.filePath,
      content: args.content,
      initialContent: args.initialContent,
      parentCommitSha: args.parentCommitSha ?? "commit",
      lastEditTime: now,
      lastEditUserId: args.lastEditUserId,
      branch: "main",
      version: 1,
    });
  });
}

describe("account deletion foundation", () => {
  it("counts changed files across owned vaults instead of using the editor user index", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "grace@example.com",
        isApproved: true,
      });
    });
    const firstVaultId = await insertVault(t, ids.userId);
    const secondVaultId = await insertVault(t, ids.userId);
    const otherVaultId = await insertVault(t, otherUserId);

    await insertStagedFile({
      t,
      ownerId: ids.userId,
      lastEditUserId: otherUserId,
      vaultId: firstVaultId,
      filePath: "changed.ts",
      content: "changed",
      initialContent: "original",
    });
    await insertStagedFile({
      t,
      ownerId: ids.userId,
      lastEditUserId: ids.userId,
      vaultId: firstVaultId,
      filePath: "unchanged.ts",
      content: "same",
      initialContent: "same",
    });
    await insertStagedFile({
      t,
      ownerId: ids.userId,
      lastEditUserId: ids.userId,
      vaultId: secondVaultId,
      filePath: "added.ts",
      content: "new",
      initialContent: "",
      parentCommitSha: null,
    });
    await insertStagedFile({
      t,
      ownerId: otherUserId,
      lastEditUserId: ids.userId,
      vaultId: otherVaultId,
      filePath: "not-ours.ts",
      content: "changed",
      initialContent: "original",
    });

    await expect(asUser.query(api.accountDeletion.index.preflight)).resolves.toEqual({
      stagedFileCount: 2,
    });
  });

  it("atomically gates the user and reuses one run while snapshotting the current staged count", async () => {
    const { asUser, ids, t } = await seedUser({ email: "ada@example.com" });
    const vaultId = await insertVault(t, ids.userId);
    await insertStagedFile({
      t,
      ownerId: ids.userId,
      lastEditUserId: ids.userId,
      vaultId,
      filePath: "changed.ts",
      content: "changed",
      initialContent: "original",
    });

    const newlyChangedFileId = await insertStagedFile({
      t,
      ownerId: ids.userId,
      lastEditUserId: ids.userId,
      vaultId,
      filePath: "newly-changed.ts",
      content: "same",
      initialContent: "same",
    });
    await expect(asUser.query(api.accountDeletion.index.preflight)).resolves.toEqual({
      stagedFileCount: 1,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(newlyChangedFileId, { content: "changed after preflight" });
    });

    const first = await asUser.mutation(api.accountDeletion.index.request);
    const second = await asUser.mutation(api.accountDeletion.index.request);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      state: "queued",
      currentStep: "request_accepted",
      stagedFileCount: 2,
    });
    const stored = await t.run(async (ctx) => {
      const user = await ctx.db.get(ids.userId);
      const runs = await ctx.db.query("accountDeletionRuns").collect();
      const events = await ctx.db.query("accountDeletionEvents").collect();
      return { user, runs, events };
    });
    expect(stored.user?.accountDeletion).toEqual({
      state: "deleting",
      runId: first.runId,
      requestedAt: first.requestedAt,
    });
    expect(stored.runs).toHaveLength(1);
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
    await expect(asUser.query(api.accountDeletion.index.preflight)).rejects.toThrow(
      "Account deletion has already been requested.",
    );
  });

  it("exposes status only for the current deleting user", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const other = await seedUser({ email: "grace@example.com", t: owner.t });
    const status = await owner.asUser.mutation(api.accountDeletion.index.request);

    await expect(owner.asUser.query(api.accountDeletion.index.status)).resolves.toEqual(status);
    await expect(other.asUser.query(api.accountDeletion.index.status)).resolves.toBeNull();
  });

  it("provides safe paginated staff list and detail results", async () => {
    const owner = await seedUser({ email: "ada@example.com" });
    const staff = await seedUser({ email: "nicu@samebase.com", t: owner.t });
    const run = await owner.asUser.mutation(api.accountDeletion.index.request);

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
        state: "queued",
      }),
    ]);
    expect(list.page[0]).not.toHaveProperty("userId");
    expect(list.page[0]).not.toHaveProperty("initiatingSessionId");

    const detail = await staff.asUser.query(api.accountDeletion.index.detailForAdmin, {
      runId: run.runId,
    });
    expect(detail).toMatchObject({
      run: { runId: run.runId, email: "ada@example.com" },
      events: [{ step: "request_accepted", level: "info" }],
    });
    expect(detail?.events[0]).not.toHaveProperty("userId");
    expect(detail?.events[0]).not.toHaveProperty("email");
  });

  it("removes staff access as soon as a staff account enters deletion", async () => {
    const staff = await seedUser({ email: "nicu@samebase.com" });
    await staff.asUser.mutation(api.accountDeletion.index.request);

    await expect(
      staff.asUser.query(api.accountDeletion.index.listForAdmin, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow("Access denied");
  });
});
