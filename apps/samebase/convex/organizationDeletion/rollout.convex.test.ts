import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import { buildPendingUploadStorageContentType } from "../pendingUploads";
import { makeConvexTest } from "../test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("organization deletion storage rollout", () => {
  it("removes old unreferenced storage without a staging request or current membership", async () => {
    vi.useFakeTimers();
    vi.stubEnv("CONVEX_AGENT_MODE", "");
    vi.stubEnv("CONVEX_DEPLOYMENT", "prod:organization-deletion-rollout-test");
    const startedAt = Date.now();
    const t = makeConvexTest();

    const started = await t.mutation(
      internal.organizationDeletion.rollout.advanceStorageCleanup,
      {},
    );
    if (started.state !== "waiting") {
      throw new Error("Production storage rollout did not start.");
    }

    const storage = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "rollout-owner@example.invalid",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "rollout-owner-id",
        githubOwnerType: "organization",
        githubOwnerLogin: "Rollout",
        githubOwnerLoginNormalized: "rollout",
        githubInstallationId: "rollout-installation",
      });
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
      });

      const orphanStorageId = await ctx.storage.store(
        new Blob(["old untracked upload"], { type: "image/png" }),
      );
      const additionalOrphanStorageIds: Array<typeof orphanStorageId> = [];
      for (let index = 0; index < 55; index += 1) {
        additionalOrphanStorageIds.push(
          await ctx.storage.store(
            new Blob([`old untracked upload ${index}`], { type: "image/png" }),
          ),
        );
      }
      const referencedStorageId = await ctx.storage.store(
        new Blob(["observed file"], { type: "application/octet-stream" }),
      );
      await ctx.db.insert("observations_vaultFiles_blobs", {
        vaultId,
        sha: "referenced-sha",
        size: 13,
        storageId: referencedStorageId,
      });

      const markerUploadId = await ctx.db.insert("vaultPendingUploads", {
        organizationId,
        vaultId,
        userId,
        purpose: "action_blob_cache",
        originalContentType: "image/png",
        expiresAt: started.readyAt + 30 * 60_000,
      });
      const markerContentType = buildPendingUploadStorageContentType({
        originalContentType: "image/png",
        uploadId: markerUploadId,
      });
      const markedStorageId = await ctx.storage.store(
        new Blob(["active marked upload"], { type: markerContentType }),
      );
      // convex-test 0.0.53 omits Blob.type from its synthetic _storage row.
      // @ts-expect-error Test-only system-table patch models the real upload metadata.
      await ctx.db.patch(markedStorageId, { contentType: markerContentType });

      const adoptedStorageId = await ctx.storage.store(
        new Blob(["adopted old upload"], { type: "image/png" }),
      );
      await ctx.db.insert("vaultPendingUploads", {
        organizationId,
        vaultId,
        userId,
        purpose: "browser_media",
        originalContentType: "image/png",
        expiresAt: started.readyAt + 30 * 60_000,
        storageId: adoptedStorageId,
      });

      return {
        additionalOrphanStorageIds,
        adoptedStorageId,
        markedStorageId,
        orphanStorageId,
        referencedStorageId,
      };
    });

    vi.setSystemTime(started.readyAt + 1);
    const newerStorageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(new Blob(["new upload"], { type: "application/octet-stream" })),
    );

    await expect(
      t.mutation(internal.organizationDeletion.rollout.advanceStorageCleanup, {}),
    ).resolves.toEqual({ state: "more" });
    await expect(
      t.mutation(internal.organizationDeletion.rollout.advanceStorageCleanup, {}),
    ).resolves.toEqual({ state: "ready" });

    await expect(
      t.run(async (ctx) => await ctx.storage.get(storage.orphanStorageId)),
    ).resolves.toBeNull();
    await expect(
      t.run(async (ctx) => {
        return await Promise.all(
          storage.additionalOrphanStorageIds.map(
            async (storageId) => (await ctx.storage.get(storageId)) === null,
          ),
        );
      }),
    ).resolves.toEqual(storage.additionalOrphanStorageIds.map(() => true));
    for (const storageId of [
      storage.referencedStorageId,
      storage.markedStorageId,
      storage.adoptedStorageId,
      newerStorageId,
    ]) {
      await expect(t.run(async (ctx) => (await ctx.storage.get(storageId)) !== null)).resolves.toBe(
        true,
      );
    }
    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("workflow_organizationDeletion_storageRollout")
          .withIndex("by_key")
          .unique();
      }),
    ).resolves.toMatchObject({
      state: "ready",
      startedAt,
      cutoffAt: started.readyAt,
    });
  });

  it("does not require the production rollout in a development deployment", async () => {
    vi.stubEnv("CONVEX_AGENT_MODE", "");
    vi.stubEnv("CONVEX_DEPLOYMENT", "dev:organization-deletion-rollout-test");
    const t = makeConvexTest();

    await expect(
      t.mutation(internal.organizationDeletion.rollout.advanceStorageCleanup, {}),
    ).resolves.toEqual({ state: "not_required" });
    await expect(
      t.run(
        async (ctx) => await ctx.db.query("workflow_organizationDeletion_storageRollout").take(1),
      ),
    ).resolves.toEqual([]);
  });
});
