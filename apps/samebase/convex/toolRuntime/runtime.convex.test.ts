import type { FunctionReturnType } from "convex/server";
import type { Infer } from "convex/values";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { cloudflareCreateWorkerContract } from "../vault/contracts/cloudflareAttachments";

type CloudflareCreateWorkerToolResult = FunctionReturnType<
  typeof internal.toolRuntime.runtime.cloudflareCreateWorkerTool
>;

async function seedToolRuntimeOwner() {
  const t = makeConvexTest();
  const { organizationId, userId, vaultId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", { name: "Tool runtime" });
    await ctx.db.insert("organizationMemberships", { organizationId, userId });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    return { organizationId, userId, vaultId };
  });
  return { organizationId, t, userId, vaultId };
}

describe("MCP tool runtime boundaries", () => {
  it("keeps the exact result type through the generic runtime factory", () => {
    expectTypeOf<CloudflareCreateWorkerToolResult>().not.toBeAny();
    expectTypeOf<CloudflareCreateWorkerToolResult>().toEqualTypeOf<
      | {
          status: "ok";
          text: string;
          structuredContent: Infer<typeof cloudflareCreateWorkerContract.structuredContent>;
        }
      | {
          status: "error" | "blocked";
          text: string;
        }
    >();
  });

  it("blocks a generic runtime tool before its product helper runs", async () => {
    const { organizationId, t, userId, vaultId } = await seedToolRuntimeOwner();

    const result = await t.action(internal.toolRuntime.runtime.cloudflareCreateWorkerTool, {
      userId,
      organizationId,
      grantedScopes: [],
      vaultId,
      accountId: "account_1",
      workerName: "worker-new",
      rootDirectory: "/",
    });

    expect(result).toEqual({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_createWorker.",
    });
  });

  it("converts a product helper error into a tool error without a provider write", async () => {
    const { organizationId, t, userId, vaultId } = await seedToolRuntimeOwner();

    const result = await t.action(internal.toolRuntime.runtime.cloudflareCreateWorkerTool, {
      userId,
      organizationId,
      grantedScopes: ["access_provider_connections"],
      vaultId,
      accountId: "account_1",
      workerName: "provider-secret-sentinel invalid",
      rootDirectory: "/",
    });

    expect(result).toEqual({
      status: "error",
      text: "The provider operation failed. Check the provider connection and retry.",
    });
    expect(result.text).not.toContain("provider-secret-sentinel");
    expect(result).not.toHaveProperty("structuredContent");
  });

  it("rejects a vault from another organization before provider access", async () => {
    const { organizationId, t, userId } = await seedToolRuntimeOwner();
    const foreignVaultId = await t.run(async (ctx) => {
      const foreignOrganizationId = await ctx.db.insert("organizations", {
        name: "Foreign runtime",
      });
      return await ctx.db.insert("vaults", {
        organizationId: foreignOrganizationId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
    });

    const result = await t.action(internal.toolRuntime.runtime.cloudflareCreateWorkerTool, {
      userId,
      organizationId,
      grantedScopes: ["access_provider_connections"],
      vaultId: foreignVaultId,
      accountId: "account_1",
      workerName: "worker-new",
      rootDirectory: "/",
    });

    expect(result).toEqual({
      status: "error",
      text: "The provider operation failed. Check the provider connection and retry.",
    });
  });

  it("uses exact deploy-key query arguments and keeps provider errors private", async () => {
    const { organizationId, t, userId, vaultId } = await seedToolRuntimeOwner();
    const { cloudflareProviderConnectionId, convexProjectId, workerId } = await t.run(
      async (ctx) => {
        const githubProviderConnectionId = await ctx.db.insert("providerConnections", {
          state: "connected",
          kind: "github",
          organizationId,
          connectedByUserId: userId,
          accountId: "github-account",
          auth: { method: "api_key", credential: "github-token" },
          username: "ada",
          createdAt: 1,
          updatedAt: 1,
        });
        const cloudflareProviderConnectionId = await ctx.db.insert("providerConnections", {
          state: "disconnected",
          kind: "cloudflare",
          organizationId,
          connectedByUserId: userId,
          defaultAccount: { state: "not_selected" },
          disconnectedAt: 1,
          createdAt: 1,
          updatedAt: 1,
        });
        const convexProviderConnectionId = await ctx.db.insert("providerConnections", {
          state: "disconnected",
          kind: "convex",
          organizationId,
          connectedByUserId: userId,
          teamId: "team_1",
          disconnectedAt: 1,
          createdAt: 1,
          updatedAt: 1,
        });
        const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
          requestedByUserId: userId,
          vaultId,
          repositoryFullName: "ada/demo",
          trigger: "connect_existing_repository",
          state: "succeeded",
          currentStep: "finish",
          createdAt: 2,
          updatedAt: 2,
          completedAt: 2,
        });
        await ctx.db.replace(vaultId, {
          organizationId,
          deletion: { state: "not_deleting" },
          state: "connected",
          githubProviderConnectionId,
          githubMode: "connect_existing_repository",
          runId,
          ghRepoId: "123",
          owner: "ada",
          name: "demo",
          visibility: "private",
          defaultBranch: "main",
          connectedAt: 2,
        });
        const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
          vaultId,
          organizationId,
          providerConnectionId: cloudflareProviderConnectionId,
          accountId: "account_1",
          workerName: "worker",
          workerTag: "worker-tag",
          origin: "selected_existing",
        });
        const convexProjectId = await ctx.db.insert("vaultConvexProjects", {
          vaultId,
          organizationId,
          providerConnectionId: convexProviderConnectionId,
          teamId: "team_1",
          projectId: "project_1",
          convexConfigPath: "convex.json",
          origin: "selected_existing",
        });
        return { cloudflareProviderConnectionId, convexProjectId, workerId };
      },
    );

    await expect(
      t.query(internal.vault.cloudflareMutations.readWorkerConvexProjectConfigurationContext, {
        userId,
        vaultId,
        workerId,
        convexProjectId,
      }),
    ).resolves.toMatchObject({
      providerConnectionId: cloudflareProviderConnectionId,
    });

    const result = await t.action(
      internal.toolRuntime.runtime.cloudflareRotateConvexDeployKeysForWorkersBuildsTool,
      {
        userId,
        organizationId,
        grantedScopes: ["access_provider_connections"],
        vaultId,
        workerId,
        convexProjectId,
      },
    );

    expect(result).toEqual({
      status: "error",
      text: "The provider operation failed. Check the provider connection and retry.",
    });
  });

  it("keeps browser handoff behind its dedicated trusted scope", async () => {
    const { organizationId, t, userId } = await seedToolRuntimeOwner();

    const result = await t.action(internal.toolRuntime.runtime.createBrowserHandoffTool, {
      userId,
      organizationId,
      grantId: "grant_1",
      clientId: "client_1",
      grantedScopes: [],
    });

    expect(result).toEqual({
      status: "blocked",
      text: "Insufficient scope for create_browser_handoff.",
    });
  });
});
