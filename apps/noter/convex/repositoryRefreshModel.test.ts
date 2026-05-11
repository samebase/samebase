import { describe, expect, it } from "vite-plus/test";

import { makeConvexTest } from "./test.setup";
import {
  deriveRepositoryRefreshDedupeKey,
  makeRepositoryRefreshRequest,
  markRepositoryRefreshRequestCanceled,
  markRepositoryRefreshRequestFailed,
  markRepositoryRefreshRequestRunning,
  markRepositoryRefreshRequestSucceeded,
} from "./repositoryRefreshModel";

describe("repository refresh model", () => {
  async function createVaultIds() {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      return { userId, vaultId };
    });
    return { ids, t };
  }

  it("creates queued metadata requests with derived queue fields", async () => {
    const { ids, t } = await createVaultIds();
    const request = makeRepositoryRefreshRequest({
      userId: ids.userId,
      vaultId: ids.vaultId,
      now: 10,
      notBefore: 12,
      intent: {
        source: "dashboard",
        trigger: "page_load",
      },
      work: {
        kind: "repo_metadata",
        enrichment: { kind: "none" },
      },
    });

    expect(request).toMatchObject({
      userId: ids.userId,
      vaultId: ids.vaultId,
      dedupeKey: `user:${ids.userId}:vault:${ids.vaultId}:repo_metadata`,
      priority: "background",
      lifecycle: {
        state: "queued",
        notBefore: 12,
        queuedAt: 10,
      },
      createdAt: 10,
      updatedAt: 10,
    });

    const stored = await t.run(async (ctx) => {
      const requestId = await ctx.db.insert(
        "repositoryRefreshRequests",
        request,
      );
      return await ctx.db.get(requestId);
    });
    expect(stored).toMatchObject(request);
  });

  it("derives work-specific dedupe keys", async () => {
    const { ids } = await createVaultIds();

    expect(
      deriveRepositoryRefreshDedupeKey({
        userId: ids.userId,
        vaultId: ids.vaultId,
        work: {
          kind: "branch_tree",
          branch: "main",
        },
      }),
    ).toBe(`user:${ids.userId}:vault:${ids.vaultId}:branch:main:tree`);
    expect(
      deriveRepositoryRefreshDedupeKey({
        userId: ids.userId,
        vaultId: ids.vaultId,
        work: {
          kind: "link_enrichment",
          branch: "main",
          provider: "cloudflare_pages_comments",
        },
      }),
    ).toBe(
      `user:${ids.userId}:vault:${ids.vaultId}:branch:main:link_enrichment:cloudflare_pages_comments`,
    );
  });

  it("creates link enrichment as separate provider work", async () => {
    const { ids, t } = await createVaultIds();
    const request = makeRepositoryRefreshRequest({
      userId: ids.userId,
      vaultId: ids.vaultId,
      now: 14,
      notBefore: 14,
      intent: {
        source: "dashboard",
        trigger: "visibility",
      },
      work: {
        kind: "link_enrichment",
        branch: "main",
        provider: "cloudflare_pages_comments",
      },
    });

    expect(request).toMatchObject({
      dedupeKey: `user:${ids.userId}:vault:${ids.vaultId}:branch:main:link_enrichment:cloudflare_pages_comments`,
      priority: "background",
      work: {
        kind: "link_enrichment",
        branch: "main",
        provider: "cloudflare_pages_comments",
      },
    });

    const stored = await t.run(async (ctx) => {
      const requestId = await ctx.db.insert(
        "repositoryRefreshRequests",
        request,
      );
      return await ctx.db.get(requestId);
    });
    expect(stored).toMatchObject(request);
  });

  it("keeps source setup intent tied to the provisioning run", async () => {
    const { ids, t } = await createVaultIds();
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/imported",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
    });

    const request = makeRepositoryRefreshRequest({
      userId: ids.userId,
      vaultId: ids.vaultId,
      now: 20,
      notBefore: 20,
      intent: {
        source: "source_setup",
        runId,
        mode: "connect_existing_repository",
      },
      work: {
        kind: "repo_metadata",
        enrichment: { kind: "none" },
      },
    });

    expect(request.priority).toBe("system");
    expect(request.intent).toEqual({
      source: "source_setup",
      runId,
      mode: "connect_existing_repository",
    });
  });

  it("transitions queued requests through running and succeeded", async () => {
    const { ids } = await createVaultIds();
    const queued = makeRepositoryRefreshRequest({
      userId: ids.userId,
      vaultId: ids.vaultId,
      now: 10,
      notBefore: 10,
      intent: {
        source: "manual",
        trigger: "dashboard_status_click",
      },
      work: {
        kind: "repo_metadata",
        enrichment: {
          kind: "pull_request_metadata",
          includeAheadBehind: true,
        },
      },
    });
    const running = markRepositoryRefreshRequestRunning(queued, {
      now: 11,
      attempt: 1,
      workpoolJobId: "job-1",
    });
    const succeeded = markRepositoryRefreshRequestSucceeded(running, {
      now: 12,
      result: {
        kind: "refreshed",
        refreshedAt: 12,
      },
    });

    expect(running.lifecycle).toEqual({
      state: "running",
      attempt: 1,
      startedAt: 11,
      workpoolJobId: "job-1",
    });
    expect(succeeded.lifecycle).toEqual({
      state: "succeeded",
      attempt: 1,
      startedAt: 11,
      completedAt: 12,
      result: {
        kind: "refreshed",
        refreshedAt: 12,
      },
    });
  });

  it("rejects invalid lifecycle transitions", async () => {
    const { ids } = await createVaultIds();
    const queued = makeRepositoryRefreshRequest({
      userId: ids.userId,
      vaultId: ids.vaultId,
      now: 10,
      notBefore: 10,
      intent: {
        source: "dashboard",
        trigger: "visibility",
      },
      work: {
        kind: "repo_metadata",
        enrichment: { kind: "none" },
      },
    });
    const running = markRepositoryRefreshRequestRunning(queued, {
      now: 11,
      attempt: 1,
      workpoolJobId: "job-1",
    });
    const failed = markRepositoryRefreshRequestFailed(running, {
      now: 12,
      failure: {
        kind: "provider_error",
        cooldownUntil: 60,
        message: "GitHub unavailable.",
      },
    });

    expect(() =>
      markRepositoryRefreshRequestSucceeded(queued, {
        now: 12,
        result: { kind: "no_work_needed" },
      }),
    ).toThrow("Only running repository refresh requests can succeed.");
    expect(() =>
      markRepositoryRefreshRequestRunning(failed, {
        now: 13,
        attempt: 2,
        workpoolJobId: "job-2",
      }),
    ).toThrow("Only queued repository refresh requests can start.");
    expect(() =>
      markRepositoryRefreshRequestCanceled(failed, {
        now: 13,
        reason: "superseded",
      }),
    ).toThrow(
      "Only queued or running repository refresh requests can be canceled.",
    );
  });
});
