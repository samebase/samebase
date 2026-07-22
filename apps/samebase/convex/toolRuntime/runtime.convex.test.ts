import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

/**
Every runtime bridge must enforce its contract's scope before touching any
product helper. Granting no scopes at all must block all non-public tools with
the tool's own MCP name in the message, the per-bridge half of the
authorization story (the dispatch layer's current-access gate is covered in
mcp/http.convex.test.ts).
*/
describe("toolRuntime scope enforcement", () => {
  it("blocks every non-public catalog tool when the token grants no scopes", async () => {
    const t = makeConvexTest();
    const { convexProjectId, userId, vaultId, workerId } = await t.run(async (ctx) => {
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
      const seededWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: seededVaultId,
        userId: seededUserId,
        accountId: "account_1",
        workerName: "worker-1",
        workerTag: "worker-tag-1",
        origin: "selected_existing",
      });
      const seededConvexProjectId = await ctx.db.insert("vaultConvexProjects", {
        vaultId: seededVaultId,
        userId: seededUserId,
        teamId: "team_1",
        projectId: "project_1",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
      return {
        convexProjectId: seededConvexProjectId,
        userId: seededUserId,
        vaultId: seededVaultId,
        workerId: seededWorkerId,
      };
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

    const discoverProjects = await t.action(
      internal.toolRuntime.runtime.convexDiscoverProjectsTool,
      {
        userId,
        grantedScopes,
        vaultId,
      },
    );
    expect(discoverProjects).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_convex_discoverProjects.",
    });

    const listAccounts = await t.action(internal.toolRuntime.runtime.cloudflareListAccountsTool, {
      userId,
      grantedScopes,
    });
    expect(listAccounts).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_listAccounts.",
    });

    const discoverWorkers = await t.action(
      internal.toolRuntime.runtime.cloudflareDiscoverWorkersTool,
      {
        userId,
        grantedScopes,
        vaultId,
        accountId: "account_1",
      },
    );
    expect(discoverWorkers).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_discoverWorkers.",
    });

    const attachProjects = await t.action(internal.toolRuntime.runtime.convexAttachProjectsTool, {
      userId,
      grantedScopes,
      vaultId,
      projects: [
        {
          projectId: "project_1",
          codeLocation: {
            kind: "config",
            convexConfigPath: "convex.json",
            blobSha: "blob_1",
          },
        },
      ],
    });
    expect(attachProjects).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_convex_attachProjects.",
    });

    const attachWorkers = await t.action(internal.toolRuntime.runtime.cloudflareAttachWorkersTool, {
      userId,
      grantedScopes,
      vaultId,
      accountId: "account_1",
      workers: [{ workerName: "worker-1", workerTag: "worker-tag-1" }],
    });
    expect(attachWorkers).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_attachWorkers.",
    });

    const configureWorkersBuildsForGitHub = await t.action(
      internal.toolRuntime.runtime.cloudflareConfigureWorkersBuildsForGitHubTool,
      {
        userId,
        grantedScopes,
        vaultId,
        workerId,
        rootDirectory: "/",
      },
    );
    expect(configureWorkersBuildsForGitHub).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_configureWorkersBuildsForGitHub.",
    });

    const rotateConvexDeployKeysForWorkersBuilds = await t.action(
      internal.toolRuntime.runtime.cloudflareRotateConvexDeployKeysForWorkersBuildsTool,
      {
        userId,
        grantedScopes,
        vaultId,
        workerId,
        convexProjectId,
      },
    );
    expect(rotateConvexDeployKeysForWorkersBuilds).toMatchObject({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_rotateConvexDeployKeysForWorkersBuilds.",
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
