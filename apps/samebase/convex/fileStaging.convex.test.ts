import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

async function seedVaultWithStagedFile() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      name: "Owner",
      email: "nicu@samebase.com",
      isApproved: true,
    });
    const otherUserId = await ctx.db.insert("users", {
      name: "Other",
      email: "nicuchiciuc@gmail.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {});
    await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: otherUserId });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    await ctx.db.insert("vaultStagedFiles", {
      vaultId,
      fileDeleted: false,
      kind: "text",
      filePath: "notes/todo.md",
      initialFilePath: "notes/todo.md",
      content: "updated content",
      initialContent: "initial content",
      parentCommitSha: "abc123",
      lastEditTime: 10,
      lastEditUserId: ownerId,
      branch: "main",
      version: 1,
    });
    return { ownerId, otherUserId, vaultId };
  });
  return { ids, t };
}

async function seedConnectedVaultWithForeignStorage() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      name: "Owner",
      email: "nicu@samebase.com",
      isApproved: true,
    });
    const foreignUserId = await ctx.db.insert("users", {
      name: "Foreign owner",
      email: "foreign@example.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {});
    const foreignOrganizationId = await ctx.db.insert("organizations", {});
    await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId });
    await ctx.db.insert("organizationMemberships", {
      organizationId: foreignOrganizationId,
      userId: foreignUserId,
    });
    const githubProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "github",
      state: "connected",
      organizationId,
      connectedByUserId: ownerId,
      accountId: "github-account",
      auth: { method: "api_key", credential: "github-token" },
      createdAt: 1,
      updatedAt: 1,
    });

    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      requestedByUserId: ownerId,
      vaultId,
      repositoryFullName: "owner/repo",
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
      githubProviderConnectionId,
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      owner: "owner",
      name: "repo",
      defaultBranch: "main",
      visibility: "private",
      connectedAt: 4,
    });
    await ctx.db.insert("observations_vaultRepository_branchTrees", {
      vaultId,
      branch: "main",
      commitSHA: "commit-sha",
      treeData: {
        sha: "tree-sha",
        truncated: false,
        tree: [
          {
            path: "notes/delete.md",
            mode: "100644",
            type: "blob",
            sha: "file-sha",
          },
        ],
      },
      lastTreeRefreshAt: 5,
    });

    const foreignVaultId = await ctx.db.insert("vaults", {
      organizationId: foreignOrganizationId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const stagedStorageId = await ctx.storage.store(new Blob(["staged foreign data"]));
    const cachedStorageId = await ctx.storage.store(new Blob(["cached foreign data"]));
    await ctx.db.insert("vaultStagedFiles", {
      vaultId: foreignVaultId,
      fileDeleted: false,
      kind: "binary",
      filePath: "foreign/staged.bin",
      initialFilePath: "foreign/staged.bin",
      content: "",
      initialContent: "",
      storageId: stagedStorageId,
      stagedBlobSha: "staged-sha",
      parentCommitSha: null,
      lastEditTime: 6,
      lastEditUserId: foreignUserId,
      branch: "main",
      version: 0,
    });
    await ctx.db.insert("observations_vaultFiles_blobs", {
      vaultId: foreignVaultId,
      sha: "cached-storage-sha",
      size: 19,
      storageId: cachedStorageId,
    });
    await ctx.db.insert("observations_vaultFiles_blobs", {
      vaultId: foreignVaultId,
      sha: "file-sha",
      size: 18,
      text: "repository content",
    });

    return {
      cachedStorageId,
      foreignUserId,
      ownerId,
      stagedStorageId,
      vaultId,
    };
  });
  return { ids, t };
}

function asIdentity(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

describe("fileStaging.listStagedFiles access control", () => {
  it("rejects anonymous callers", async () => {
    const { ids, t } = await seedVaultWithStagedFile();

    await expect(
      t.query(api.fileStaging.listStagedFiles, {
        vaultId: ids.vaultId,
        branch: "main",
      }),
    ).rejects.toThrowError("Access denied");
  });

  it("returns staged files to another organization member", async () => {
    const { ids, t } = await seedVaultWithStagedFile();

    const asOther = asIdentity(t, ids.otherUserId);
    await expect(
      asOther.query(api.fileStaging.listStagedFiles, {
        vaultId: ids.vaultId,
        branch: "main",
      }),
    ).resolves.toMatchObject([
      {
        vaultId: ids.vaultId,
        filePath: "notes/todo.md",
        branch: "main",
      },
    ]);
  });

  it("returns staged files to the vault owner", async () => {
    const { ids, t } = await seedVaultWithStagedFile();

    const asOwner = asIdentity(t, ids.ownerId);
    await expect(
      asOwner.query(api.fileStaging.listStagedFiles, {
        vaultId: ids.vaultId,
        branch: "main",
      }),
    ).resolves.toMatchObject([
      {
        vaultId: ids.vaultId,
        filePath: "notes/todo.md",
        branch: "main",
      },
    ]);
  });
});

describe("fileStaging.getByNewPath access control", () => {
  it("returns the staged file to another organization member", async () => {
    const { ids, t } = await seedVaultWithStagedFile();

    const asOther = asIdentity(t, ids.otherUserId);
    await expect(
      asOther.query(api.fileStaging.getByNewPath, {
        vaultId: ids.vaultId,
        branch: "main",
        newPath: "notes/todo.md",
      }),
    ).resolves.toMatchObject({
      vaultId: ids.vaultId,
      filePath: "notes/todo.md",
      branch: "main",
    });
  });

  it("returns the staged file to the vault owner", async () => {
    const { ids, t } = await seedVaultWithStagedFile();

    const asOwner = asIdentity(t, ids.ownerId);
    await expect(
      asOwner.query(api.fileStaging.getByNewPath, {
        vaultId: ids.vaultId,
        branch: "main",
        newPath: "notes/todo.md",
      }),
    ).resolves.toMatchObject({
      vaultId: ids.vaultId,
      filePath: "notes/todo.md",
      branch: "main",
    });
  });
});

describe("file staging write boundaries", () => {
  it("does not delete storage attached to a different organization", async () => {
    const { ids, t } = await seedConnectedVaultWithForeignStorage();
    const asOwner = asIdentity(t, ids.ownerId);

    await expect(
      asOwner.mutation(api.fileStaging.deletePendingUploadBlob, {
        vaultId: ids.vaultId,
        storageId: ids.stagedStorageId,
      }),
    ).rejects.toThrow("Cannot delete a blob that is already attached to staging.");
    await expect(
      asOwner.mutation(api.fileStaging.deletePendingUploadBlob, {
        vaultId: ids.vaultId,
        storageId: ids.cachedStorageId,
      }),
    ).rejects.toThrow("Cannot delete a blob that is already attached to staging.");

    await t.run(async (ctx) => {
      expect(await ctx.db.system.get("_storage", ids.stagedStorageId)).not.toBeNull();
      expect(await ctx.db.system.get("_storage", ids.cachedStorageId)).not.toBeNull();
    });
  });

  it("derives a deletion blob SHA from the authorized branch tree", async () => {
    const { ids, t } = await seedConnectedVaultWithForeignStorage();
    const asOwner = asIdentity(t, ids.ownerId);

    await asOwner.mutation(api.fileStaging.markFileForDeletion, {
      vaultId: ids.vaultId,
      filePath: "notes/delete.md",
      branch: "main",
    });

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultStagedFiles")
            .withIndex("by_vault_and_branch_and_path", (q) =>
              q.eq("vaultId", ids.vaultId).eq("branch", "main").eq("filePath", "notes/delete.md"),
            )
            .unique(),
      ),
    ).resolves.toMatchObject({
      fileDeleted: true,
      content: "repository content",
      initialContent: "repository content",
      parentCommitSha: "file-sha",
    });
  });

  it("rejects text initialization when a staged rename already owns the path", async () => {
    const { ids, t } = await seedConnectedVaultWithForeignStorage();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultStagedFiles", {
        vaultId: ids.vaultId,
        fileDeleted: false,
        kind: "text",
        filePath: "notes/target.md",
        initialFilePath: "notes/source.md",
        content: "renamed content",
        initialContent: "renamed content",
        parentCommitSha: "source-sha",
        lastEditTime: 10,
        lastEditUserId: ids.ownerId,
        branch: "main",
        version: 1,
      });
    });

    await expect(
      t.mutation(internal.fileStaging.initializeTextFileStaging, {
        vaultId: ids.vaultId,
        initialFilePath: "notes/target.md",
        content: "repository target",
        initialContent: "repository target",
        parentCommitSha: "target-sha",
        branch: "main",
        userId: ids.ownerId,
      }),
    ).rejects.toThrow("A staged file already uses this path");
  });
});
