import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

type SeedViewerRole = "member" | "staff";

function asIdentity(t: ConvexTest, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

function seedEmail(args: { role: SeedViewerRole; user: "owner" | "other" }): string {
  if (args.role === "staff") {
    return args.user === "owner" ? "nicu@samebase.com" : "nicuchiciuc@gmail.com";
  }

  return args.user === "owner" ? "owner.member@example.test" : "other.member@example.test";
}

async function seedOwnedResources(role: SeedViewerRole = "member") {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", {
      name: "Owner",
      email: seedEmail({ role, user: "owner" }),
      isApproved: true,
    });
    const otherUserId = await ctx.db.insert("users", {
      name: "Other",
      email: seedEmail({ role, user: "other" }),
      isApproved: true,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId: ownerId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId: ownerId,
      vaultId,
      repositoryFullName: "owner/secure",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 3,
    });
    await ctx.db.replace(vaultId, {
      userId: ownerId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      owner: "owner",
      name: "secure",
      defaultBranch: "main",
      visibility: "private",
      connectedAt: 4,
    });
    await ctx.db.insert("observations_vaultRepository_branchTrees", {
      vaultId,
      branch: "main",
      commitSHA: "abc123",
      treeData: {
        sha: "tree123",
        truncated: false,
        tree: [],
      },
      lastTreeRefreshAt: 6,
    });
    const stagingId = await ctx.db.insert("vaultStagedFiles", {
      ownerId,
      vaultId,
      fileDeleted: false,
      filePath: "notes/plan.md",
      initialFilePath: "notes/plan.md",
      content: "owner content",
      initialContent: "initial content",
      parentCommitSha: "abc123",
      lastEditTime: 10,
      lastEditUserId: ownerId,
      branch: "main",
      version: 3,
    });
    const folderExpansionId = await ctx.db.insert("ui_vaultFileTree_folderExpansions", {
      userId: ownerId,
      vaultId,
      folderPath: "notes",
      isExpanded: true,
    });
    await ctx.db.insert("vaultStagedFileUpdates", {
      vaultId,
      branch: "main",
      filePath: "notes/plan.md",
      version: 4,
      clientId: "owner-client",
      changes: "[]",
      userId: ownerId,
      timestamp: now,
    });
    const deletionRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
      userId: ownerId,
      vaultId,
      repositoryFullName: "owner/secure",
      createdAt: 30,
      updatedAt: 31,
      attempt: { kind: "initial" },
      state: "succeeded",
      workflow: { state: "started", workflowId: "workflow-owner-delete" },
      currentStep: "finish",
      snapshot: { state: "scrubbed_after_success" },
      completedAt: 32,
    });
    const deletionEventId = await ctx.db.insert("workflow_vaultDeletion_events", {
      userId: ownerId,
      vaultId,
      repositoryFullName: "owner/secure",
      runId: deletionRunId,
      step: "finish",
      level: "info",
      message: "Owner deletion event.",
      createdAt: 33,
    });
    return {
      deletionEventId,
      deletionRunId,
      folderExpansionId,
      otherUserId,
      ownerId,
      stagingId,
      vaultId,
    };
  });
  return { ids, t };
}

describe("public Convex route ownership checks", () => {
  it("hides owner-scoped vault read gateways from another member", async () => {
    const { ids, t } = await seedOwnedResources();
    const asOther = asIdentity(t, ids.otherUserId);
    const asOwner = asIdentity(t, ids.ownerId);

    await expect(
      asOther.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "owner/secure",
      }),
    ).resolves.toBeNull();
    await expect(
      asOther.query(api.vault.deletion.events.listForVault, { vaultId: ids.vaultId }),
    ).resolves.toEqual([]);

    await expect(
      asOwner.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "owner/secure",
      }),
    ).resolves.toMatchObject({
      _id: ids.vaultId,
      repositoryFullName: "owner/secure",
      resolvedBranch: "main",
    });
    await expect(
      asOwner.query(api.vault.deletion.events.listForVault, { vaultId: ids.vaultId }),
    ).resolves.toEqual([
      {
        _id: ids.deletionEventId,
        createdAt: 33,
        level: "info",
        message: "Owner deletion event.",
        repositoryFullName: "owner/secure",
        runId: ids.deletionRunId,
        step: "finish",
      },
    ]);
  });

  it("hides owner-scoped folder and collaborative reads from another member", async () => {
    const { ids, t } = await seedOwnedResources();
    const asOther = asIdentity(t, ids.otherUserId);
    const asOwner = asIdentity(t, ids.ownerId);

    await expect(
      asOther.query(api.folderExpansion.getFolderExpansionStates, { vaultId: ids.vaultId }),
    ).resolves.toEqual([]);
    await expect(
      asOther.query(api.collaborative.getDocument, {
        vaultId: ids.vaultId,
        branch: "main",
        filePath: "notes/plan.md",
      }),
    ).resolves.toEqual({
      version: 0,
      content: "",
      exists: false,
    });
    await expect(
      asOther.query(api.collaborative.getActiveEditors, {
        vaultId: ids.vaultId,
        branch: "main",
        filePath: "notes/plan.md",
      }),
    ).resolves.toEqual([]);

    await expect(
      asOwner.query(api.folderExpansion.getFolderExpansionStates, { vaultId: ids.vaultId }),
    ).resolves.toEqual([{ folderPath: "notes", isExpanded: true }]);
    await expect(
      asOwner.query(api.collaborative.getDocument, {
        vaultId: ids.vaultId,
        branch: "main",
        filePath: "notes/plan.md",
      }),
    ).resolves.toEqual({
      version: 3,
      content: "owner content",
      exists: true,
    });
  });

  it("blocks another member from changing owner-scoped folder rows", async () => {
    const { ids, t } = await seedOwnedResources();
    const asOther = asIdentity(t, ids.otherUserId);

    await expect(
      asOther.mutation(api.folderExpansion.setFolderExpansionState, {
        vaultId: ids.vaultId,
        folderPath: "notes",
        isExpanded: false,
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      asOther.mutation(api.folderExpansion.clearFolderExpansionStates, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Unauthorized");

    await expect(
      t.run(async (ctx) => {
        return ctx.db.get(ids.folderExpansionId);
      }),
    ).resolves.toMatchObject({
      userId: ids.ownerId,
      folderPath: "notes",
      isExpanded: true,
    });
  });

  it("blocks another member from mutating owner-scoped staging rows", async () => {
    const { ids, t } = await seedOwnedResources();
    const asOther = asIdentity(t, ids.otherUserId);

    await expect(
      asOther.query(api.fileStaging.listStagedFilesBranchSummaries, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual([]);
    await expect(
      asOther.mutation(api.fileStaging.clearAllStaging, {
        vaultId: ids.vaultId,
        branch: "main",
        skipTreeUpdate: true,
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      asOther.mutation(api.fileStaging.markFileForDeletion, {
        vaultId: ids.vaultId,
        branch: "main",
        filePath: "notes/plan.md",
        parentCommitSha: "abc123",
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      asOther.mutation(api.fileStaging.createFileInStaging, {
        vaultId: ids.vaultId,
        branch: "main",
        filePath: "notes/other.md",
        content: "other content",
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      asOther.mutation(api.fileStaging.updateStagedFileContent, {
        stagingId: ids.stagingId,
        content: "other content",
        expectedVersion: 3,
      }),
    ).rejects.toThrow("Unauthorized");

    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("vaultStagedFiles")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .collect();
      }),
    ).resolves.toMatchObject([
      {
        _id: ids.stagingId,
        ownerId: ids.ownerId,
        fileDeleted: false,
        filePath: "notes/plan.md",
        content: "owner content",
        version: 3,
      },
    ]);
  });

  it("blocks internal staging mutations from writing with another user's id", async () => {
    const { ids, t } = await seedOwnedResources();

    await expect(
      t.mutation(internal.fileStaging.saveToStaging, {
        vaultId: ids.vaultId,
        initialFilePath: "notes/internal.md",
        content: "other content",
        initialContent: "initial content",
        parentCommitSha: "abc123",
        branch: "main",
        userId: ids.otherUserId,
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      t.mutation(internal.fileStaging.rename, {
        vaultId: ids.vaultId,
        initialFilePath: "notes/plan.md",
        branch: "main",
        newPath: "notes/other.md",
        userId: ids.otherUserId,
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      t.mutation(internal.fileStaging.internalMarkFileForDeletion, {
        vaultId: ids.vaultId,
        filePath: "notes/plan.md",
        parentCommitSha: "abc123",
        branch: "main",
        userId: ids.otherUserId,
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      t.mutation(internal.fileStaging.duplicateBranchStaging, {
        vaultId: ids.vaultId,
        sourceBranch: "main",
        targetBranch: "draft",
        stagedFiles: [],
        userId: ids.otherUserId,
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      t.mutation(internal.fileStaging.reconcileStagingWithTree, {
        vaultId: ids.vaultId,
        instructions: [],
        userId: ids.otherUserId,
      }),
    ).rejects.toThrow("Unauthorized");

    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("vaultStagedFiles")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .collect();
      }),
    ).resolves.toMatchObject([
      {
        _id: ids.stagingId,
        ownerId: ids.ownerId,
        filePath: "notes/plan.md",
        content: "owner content",
      },
    ]);
  });

  it("blocks another member from pulling or pushing collaborative updates", async () => {
    const { ids, t } = await seedOwnedResources();
    const asOther = asIdentity(t, ids.otherUserId);

    await expect(
      asOther.query(api.collaborative.pullUpdates, {
        repositoryFullName: "owner/secure",
        branch: "main",
        filePath: "notes/plan.md",
        version: 0,
      }),
    ).rejects.toThrow("Vault not found");
    await expect(
      asOther.mutation(api.collaborative.pushUpdates, {
        repositoryFullName: "owner/secure",
        branch: "main",
        filePath: "notes/plan.md",
        version: 3,
        updates: [{ clientId: "other-client", changes: "[]" }],
      }),
    ).rejects.toThrow("Vault not found");

    await expect(
      t.run(async (ctx) => {
        const staging = await ctx.db.get(ids.stagingId);
        const updates = await ctx.db
          .query("vaultStagedFileUpdates")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .collect();
        return { staging, updates };
      }),
    ).resolves.toMatchObject({
      staging: {
        content: "owner content",
        version: 3,
        lastEditUserId: ids.ownerId,
      },
      updates: [
        {
          clientId: "owner-client",
          userId: ids.ownerId,
        },
      ],
    });
  });
});
