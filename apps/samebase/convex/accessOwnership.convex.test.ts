import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

function asIdentity(t: ConvexTest, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

async function seedOrganizationVault() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      name: "Owner",
      email: "nicu@samebase.com",
      isApproved: true,
    });
    const teammateId = await ctx.db.insert("users", {
      name: "Teammate",
      email: "nicuchiciuc@gmail.com",
      isApproved: true,
    });
    const outsiderId = await ctx.db.insert("users", {
      name: "Outsider",
      email: "nicu@samebase.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {});
    const outsiderOrganizationId = await ctx.db.insert("organizations", {});
    await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: teammateId });
    await ctx.db.insert("organizationMemberships", {
      organizationId: outsiderOrganizationId,
      userId: outsiderId,
    });

    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      requestedByUserId: ownerId,
      vaultId,
      repositoryFullName: "owner/shared",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 3,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      owner: "owner",
      name: "shared",
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
      lastTreeRefreshAt: 5,
    });
    const stagingId = await ctx.db.insert("vaultStagedFiles", {
      vaultId,
      fileDeleted: false,
      kind: "text",
      filePath: "notes/plan.md",
      initialFilePath: "notes/plan.md",
      content: "shared content",
      initialContent: "initial content",
      parentCommitSha: "abc123",
      lastEditTime: 6,
      lastEditUserId: outsiderId,
      branch: "main",
      version: 3,
    });
    await ctx.db.insert("ui_vaultFileTree_folderExpansions", {
      userId: ownerId,
      vaultId,
      folderPath: "notes",
      isExpanded: true,
    });

    return { organizationId, outsiderId, ownerId, stagingId, teammateId, vaultId };
  });

  return { ids, t };
}

describe("organization resource access", () => {
  it("gives each organization member access to the shared vault draft", async () => {
    const { ids, t } = await seedOrganizationVault();
    const asTeammate = asIdentity(t, ids.teammateId);

    await expect(
      asTeammate.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "owner/shared",
      }),
    ).resolves.toMatchObject({ _id: ids.vaultId });
    await expect(
      asTeammate.query(api.collaborative.getDocument, {
        vaultId: ids.vaultId,
        branch: "main",
        filePath: "notes/plan.md",
      }),
    ).resolves.toEqual({ content: "shared content", exists: true, version: 3 });

    await asTeammate.mutation(api.fileStaging.updateStagedFileContent, {
      stagingId: ids.stagingId,
      content: "teammate content",
      expectedVersion: 3,
    });

    await expect(t.run(async (ctx) => await ctx.db.get(ids.stagingId))).resolves.toMatchObject({
      content: "teammate content",
      lastEditUserId: ids.teammateId,
      version: 4,
    });
  });

  it("preserves a teammate edit when another member finishes stale draft initialization", async () => {
    const { ids, t } = await seedOrganizationVault();
    const asTeammate = asIdentity(t, ids.teammateId);

    await asTeammate.mutation(api.fileStaging.updateStagedFileContent, {
      stagingId: ids.stagingId,
      content: "teammate content",
      expectedVersion: 3,
    });

    const initialized = await t.mutation(internal.fileStaging.initializeTextFileStaging, {
      vaultId: ids.vaultId,
      initialFilePath: "notes/plan.md",
      content: "initial content",
      initialContent: "initial content",
      parentCommitSha: "abc123",
      branch: "main",
      userId: ids.ownerId,
    });

    expect(initialized).toMatchObject({
      content: "teammate content",
      lastEditUserId: ids.teammateId,
      version: 4,
    });
    await expect(t.run(async (ctx) => await ctx.db.get(ids.stagingId))).resolves.toMatchObject({
      content: "teammate content",
      lastEditUserId: ids.teammateId,
      version: 4,
    });
  });

  it("rejects a stale full-content update after a teammate changes the shared draft", async () => {
    const { ids, t } = await seedOrganizationVault();
    const asTeammate = asIdentity(t, ids.teammateId);

    await asTeammate.mutation(api.fileStaging.updateStagedFileContent, {
      stagingId: ids.stagingId,
      content: "teammate content",
      expectedVersion: 3,
    });

    await expect(
      t.mutation(internal.collaborative.pushContentUpdate, {
        vaultId: ids.vaultId,
        filePath: "notes/plan.md",
        branch: "main",
        expectedVersion: 3,
        newContent: "stale owner content",
        userId: ids.ownerId,
      }),
    ).rejects.toThrow(
      "[STALE_BASE_VERSION] pushContentUpdate failed: stale base version (expected 3, got 4)",
    );

    await expect(t.run(async (ctx) => await ctx.db.get(ids.stagingId))).resolves.toMatchObject({
      content: "teammate content",
      lastEditUserId: ids.teammateId,
      version: 4,
    });
  });

  it("keeps personal folder state separate between organization members", async () => {
    const { ids, t } = await seedOrganizationVault();
    const asOwner = asIdentity(t, ids.ownerId);
    const asTeammate = asIdentity(t, ids.teammateId);

    await expect(
      asOwner.query(api.folderExpansion.getFolderExpansionStates, { vaultId: ids.vaultId }),
    ).resolves.toEqual([{ folderPath: "notes", isExpanded: true }]);
    await expect(
      asTeammate.query(api.folderExpansion.getFolderExpansionStates, { vaultId: ids.vaultId }),
    ).resolves.toEqual([]);

    await asTeammate.mutation(api.folderExpansion.setFolderExpansionState, {
      vaultId: ids.vaultId,
      folderPath: "notes",
      isExpanded: false,
    });

    await expect(
      asOwner.query(api.folderExpansion.getFolderExpansionStates, { vaultId: ids.vaultId }),
    ).resolves.toEqual([{ folderPath: "notes", isExpanded: true }]);
    await expect(
      asTeammate.query(api.folderExpansion.getFolderExpansionStates, { vaultId: ids.vaultId }),
    ).resolves.toEqual([{ folderPath: "notes", isExpanded: false }]);
  });

  it("rejects a different organization even when its user is the recorded edit actor", async () => {
    const { ids, t } = await seedOrganizationVault();
    const asOutsider = asIdentity(t, ids.outsiderId);

    await expect(
      asOutsider.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "owner/shared",
      }),
    ).resolves.toBeNull();
    await expect(
      asOutsider.mutation(api.fileStaging.updateStagedFileContent, {
        stagingId: ids.stagingId,
        content: "outsider content",
        expectedVersion: 3,
      }),
    ).rejects.toThrow("Unauthorized");

    await expect(
      asOutsider.query(api.collaborative.getDocument, {
        vaultId: ids.vaultId,
        branch: "main",
        filePath: "notes/plan.md",
      }),
    ).resolves.toEqual({ content: "", exists: false, version: 0 });
    await expect(
      asOutsider.query(api.collaborative.pullUpdates, {
        repositoryFullName: "owner/shared",
        branch: "main",
        filePath: "notes/plan.md",
        version: 0,
      }),
    ).rejects.toThrow("Vault not found");
    await expect(
      asOutsider.mutation(api.collaborative.pushUpdates, {
        repositoryFullName: "owner/shared",
        branch: "main",
        filePath: "notes/plan.md",
        version: 3,
        updates: [{ clientId: "outsider", changes: "[]" }],
      }),
    ).rejects.toThrow("Vault not found");

    await expect(
      asOutsider.query(api.folderExpansion.getFolderExpansionStates, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual([]);
    await expect(
      asOutsider.mutation(api.folderExpansion.setFolderExpansionState, {
        vaultId: ids.vaultId,
        folderPath: "notes",
        isExpanded: true,
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      asOutsider.mutation(api.folderExpansion.clearFolderExpansionStates, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      asOutsider.mutation(api.vault.folders.moveVaultToFolder, {
        folderId: null,
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Vault not found");
  });
});
