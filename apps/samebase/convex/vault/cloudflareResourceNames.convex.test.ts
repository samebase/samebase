import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const invalidWorkerNameMessage =
  "Cloudflare Worker name can use lowercase letters, numbers, underscores, and dashes, and cannot start with a dash.";

async function createValidationFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "123",
      githubOwnerType: "user",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubInstallationId: "456",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
    });
    const vaultId = await ctx.db.insert("vaults", {
      state: "not_connected",
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "00000000000000000000000000000001",
      deletion: { state: "not_deleting" },
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      organizationId,
      userId,
      vaultId,
      repositoryFullName: "ada/demo",
      trigger: "retry",
      state: "running",
      currentStep: "attach_worker",
      createdAt: 1,
      updatedAt: 1,
    });
    return { runId, userId, vaultId };
  });
  return {
    ...ids,
    asUser: t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
    t,
  };
}

describe("Cloudflare Worker name validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects an invalid manual name before a provider request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { asUser, vaultId } = await createValidationFixture();

    await expect(
      asUser.action(api.vault.cloudflare.createWorker, {
        vaultId,
        accountId: "00000000000000000000000000000001",
        workerName: "samebase app",
        rootDirectory: "/",
        buildTokenUuid: "build-token",
      }),
    ).rejects.toMatchObject({
      name: "ConvexError",
      data: invalidWorkerNameMessage,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid managed name before a provider request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runId, t, userId, vaultId } = await createValidationFixture();

    await expect(
      t.action(internal.vault.cloudflare.ensureCloudflareWorkerConnection, {
        vaultId,
        runId,
        userId,
        accountId: "00000000000000000000000000000001",
        workerName: "samebase app",
      }),
    ).rejects.toThrow(invalidWorkerNameMessage);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
