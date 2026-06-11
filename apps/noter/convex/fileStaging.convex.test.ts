import { describe, expect, it } from "vite-plus/test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

async function seedVaultWithStagedFile() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      name: "Owner",
      email: "owner@example.com",
      isApproved: true,
    });
    const otherUserId = await ctx.db.insert("users", {
      name: "Other",
      email: "other@example.com",
      isApproved: true,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId: ownerId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    await ctx.db.insert("fileStaging", {
      ownerId,
      vaultId,
      fileDeleted: false,
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
    ).rejects.toThrowError("User not authenticated");
  });

  it("returns an empty list to authenticated non-owners", async () => {
    const { ids, t } = await seedVaultWithStagedFile();

    const asOther = asIdentity(t, ids.otherUserId);
    await expect(
      asOther.query(api.fileStaging.listStagedFiles, {
        vaultId: ids.vaultId,
        branch: "main",
      }),
    ).resolves.toEqual([]);
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
