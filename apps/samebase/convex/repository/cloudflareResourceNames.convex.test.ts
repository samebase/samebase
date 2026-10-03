import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const invalidWorkerNameMessage = "Cloudflare Worker name must include a letter or number.";

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
    const repositoryId = await ctx.db.insert("repositories", {
      createdAt: 1,
      state: "not_connected",
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "00000000000000000000000000000001",
      deletion: { state: "not_deleting" },
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "ada/demo",
      trigger: "retry",
      state: "running",
      currentStep: "attach_worker",
      createdAt: 1,
      updatedAt: 1,
    });
    return { runId, userId, repositoryId };
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

  it("rejects an unusable manual name before a provider request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { asUser, repositoryId } = await createValidationFixture();

    await expect(
      asUser.action(api.repository.cloudflare.createWorker, {
        repositoryId,
        workerName: "___",
        rootDirectory: "/",
        buildTokenUuid: "build-token",
      }),
    ).rejects.toMatchObject({
      name: "ConvexError",
      data: invalidWorkerNameMessage,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unusable managed name before a provider request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runId, t, userId, repositoryId } = await createValidationFixture();

    await expect(
      t.action(internal.repository.cloudflare.ensureCloudflareWorkerConnection, {
        repositoryId,
        runId,
        userId,
        accountId: "00000000000000000000000000000001",
        workerName: "___",
      }),
    ).rejects.toThrow(invalidWorkerNameMessage);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
