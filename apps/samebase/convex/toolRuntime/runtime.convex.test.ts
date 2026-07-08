import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

/**
Every runtime bridge must enforce its contract's scope before touching any
product helper. Granting no scopes at all must block all twelve tools with the
tool's own MCP name in the message, the per-bridge half of the authorization
story (the dispatch layer's current-access gate is covered in
mcp/http.convex.test.ts).
*/
describe("toolRuntime scope enforcement", () => {
  it("blocks every catalog tool when the token grants no scopes", async () => {
    const t = makeConvexTest();
    const { userId, vaultId } = await t.run(async (ctx) => {
      const seededUserId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const seededVaultId = await ctx.db.insert("vaults", {
        userId: seededUserId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      return { userId: seededUserId, vaultId: seededVaultId };
    });
    const grantedScopes: string[] = [];

    const getUserVaults = await t.action(internal.toolRuntime.runtime.getUserVaultsTool, {
      userId,
      grantedScopes,
    });
    expect(getUserVaults).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_dashboard_getUserVaults.",
    });

    const createRepository = await t.action(internal.toolRuntime.runtime.createRepositoryTool, {
      userId,
      grantedScopes,
      name: "tmp-app",
      owner: "ada",
      convexProjectName: "tmp-app",
      cloudflareWorkerName: "tmp-app",
    });
    expect(createRepository).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_actions_createRepository.",
    });

    const connectRepository = await t.action(internal.toolRuntime.runtime.connectRepositoryTool, {
      userId,
      grantedScopes,
      repositoryFullName: "ada/existing",
    });
    expect(connectRepository).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_actions_connectRepository.",
    });

    const listProjects = await t.action(internal.toolRuntime.runtime.convexListProjectsTool, {
      userId,
      grantedScopes,
    });
    expect(listProjects).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_convex_listProjects.",
    });

    const listAccounts = await t.action(internal.toolRuntime.runtime.cloudflareListAccountsTool, {
      userId,
      grantedScopes,
    });
    expect(listAccounts).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_listAccounts.",
    });

    const listWorkers = await t.action(internal.toolRuntime.runtime.cloudflareListWorkersTool, {
      userId,
      grantedScopes,
      vaultId,
      appRoot: ".",
      accountId: "account_1",
    });
    expect(listWorkers).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_listWorkers.",
    });

    const connectProject = await t.action(
      internal.toolRuntime.runtime.convexConnectExistingProjectTool,
      {
        userId,
        grantedScopes,
        vaultId,
        appRoot: ".",
        projectId: "project_1",
      },
    );
    expect(connectProject).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_convex_connectExistingProject.",
    });

    const connectWorker = await t.action(
      internal.toolRuntime.runtime.cloudflareConnectExistingWorkerTool,
      {
        userId,
        grantedScopes,
        vaultId,
        appRoot: ".",
        accountId: "account_1",
        workerName: "worker-1",
      },
    );
    expect(connectWorker).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_connectExistingWorker.",
    });

    const wireBuilds = await t.action(internal.toolRuntime.runtime.cloudflareWireBuildsTool, {
      userId,
      grantedScopes,
      vaultId,
      appRoot: ".",
    });
    expect(wireBuilds).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_wireBuilds.",
    });

    const wireConvexBuildAccess = await t.action(
      internal.toolRuntime.runtime.cloudflareWireConvexBuildAccessTool,
      {
        userId,
        grantedScopes,
        vaultId,
        appRoot: ".",
      },
    );
    expect(wireConvexBuildAccess).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_wireConvexBuildAccess.",
    });

    const verifyInfrastructure = await t.action(
      internal.toolRuntime.runtime.cloudflareVerifyInfrastructureTool,
      {
        userId,
        grantedScopes,
        vaultId,
        appRoot: ".",
      },
    );
    expect(verifyInfrastructure).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_verifyInfrastructure.",
    });

    const retry = await t.action(internal.toolRuntime.runtime.retryInfrastructureProvisioningTool, {
      userId,
      grantedScopes,
      vaultId,
    });
    expect(retry).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_actions_retryInfrastructureProvisioning.",
    });
  });
});
