import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

async function createManagedProviderFixture(currentStep: "attach_convex" | "attach_worker") {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "member@example.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "123",
      githubOwnerType: "organization",
      githubOwnerLogin: "samebase",
      githubOwnerLoginNormalized: "samebase",
      githubInstallationId: "456",
      convexTeam: { teamId: "1000", teamSlug: "convex-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
    });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        auth: { method: "api_key", credential: "convex-token" },
        connectedByUserId: userId,
        updatedAt: 1,
      },
      cloudflare: {
        auth: { method: "api_key", credential: "cloudflare-token" },
        connectedByUserId: userId,
        updatedAt: 1,
      },
    });
    const vaultId = await ctx.db.insert("vaults", {
      state: "not_connected",
      organizationId,
      convexTeamId: "1000",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      organizationId,
      userId,
      vaultId,
      repositoryFullName: "samebase/demo",
      trigger: "create",
      state: "running",
      currentStep,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.replace(vaultId, {
      state: "connected",
      githubMode: "create_repository",
      organizationId,
      convexTeamId: "1000",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      runId,
      ghRepoId: "repository-id",
      defaultBranch: "main",
      connectedAt: 1,
      name: "demo",
      visibility: "private",
    });
    await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
      vaultId,
      owner: { kind: "managed_run", runId },
      state: "active",
      lastWriteAt: {},
      updatedAt: 1,
    });
    await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId,
      convexConfigPath: "convex.json",
      convex: { state: "creating", projectName: "demo" },
      cloudflare: {
        state: "creating",
        workerName: "demo",
        rootDirectory: "/",
      },
      createdAt: 1,
      updatedAt: 1,
    });
    return { runId, userId, vaultId };
  });
  return { ...ids, t };
}

describe("managed provider attachment actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reaches the Convex provider request after loading the provisioning context", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("Convex provider request reached.");
    });
    vi.stubGlobal("fetch", fetch);
    const { runId, t, userId, vaultId } = await createManagedProviderFixture("attach_convex");

    await expect(
      t.action(internal.vault.convex.ensureConvexProjectConnection, {
        vaultId,
        runId,
        userId,
        convexConfigPath: "convex.json",
        projectName: "demo",
      }),
    ).rejects.toThrow("Convex provider request reached.");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("reaches the Cloudflare provider request after loading the provisioning context", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("Cloudflare provider request reached.");
    });
    vi.stubGlobal("fetch", fetch);
    const { runId, t, userId, vaultId } = await createManagedProviderFixture("attach_worker");

    await expect(
      t.action(internal.vault.cloudflare.ensureCloudflareWorkerConnection, {
        vaultId,
        runId,
        userId,
        accountId: "cloudflare-account",
        workerName: "demo",
      }),
    ).rejects.toThrow("Cloudflare provider request reached.");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
