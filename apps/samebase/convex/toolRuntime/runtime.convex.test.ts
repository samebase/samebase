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
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "tool_runtime_installation",
      githubOwnerId: "tool_runtime_owner",
      githubOwnerLogin: "tool-runtime-owner",
      githubOwnerLoginNormalized: "tool-runtime-owner",
      githubOwnerType: "organization",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
    });
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
    const { t, userId, vaultId } = await seedToolRuntimeOwner();

    const result = await t.action(internal.toolRuntime.runtime.cloudflareCreateWorkerTool, {
      userId,
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

  it("lists vaults across every current organization membership", async () => {
    const { organizationId, t, userId } = await seedToolRuntimeOwner();
    const { authorizedVaultId, otherOrganizationId } = await t.run(async (ctx) => {
      const authorizedVaultId = await ctx.db.insert("vaults", {
        organizationId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const authorizedRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId,
        vaultId: authorizedVaultId,
        repositoryFullName: "tool-runtime-owner/authorized",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 1,
        completedAt: 1,
      });
      await ctx.db.replace(authorizedVaultId, {
        organizationId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: authorizedRunId,
        ghRepoId: "authorized-repository",
        name: "authorized",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 1,
      });
      const otherOrganizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "other_installation",
        githubOwnerId: "other_owner",
        githubOwnerLogin: "other-owner",
        githubOwnerLoginNormalized: "other-owner",
        githubOwnerType: "organization",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: otherOrganizationId,
        userId,
        role: "member",
      });
      const otherRunVaultId = await ctx.db.insert("vaults", {
        organizationId: otherOrganizationId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const otherRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId,
        vaultId: otherRunVaultId,
        repositoryFullName: "other-owner/hidden",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 1,
        completedAt: 1,
      });
      await ctx.db.replace(otherRunVaultId, {
        organizationId: otherOrganizationId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: otherRunId,
        ghRepoId: "hidden-repository",
        name: "hidden",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 1,
      });
      return { authorizedVaultId, otherOrganizationId };
    });

    const result = await t.action(internal.toolRuntime.runtime.getUserVaultsTool, {
      userId,
      grantedScopes: ["access_dashboard"],
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error(result.text);
    }
    expect(result.structuredContent.vaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: authorizedVaultId, organizationId }),
        expect.objectContaining({ organizationId: otherOrganizationId }),
      ]),
    );
  });

  it("converts a product helper error into a tool error without a provider write", async () => {
    const { t, userId, vaultId } = await seedToolRuntimeOwner();

    const result = await t.action(internal.toolRuntime.runtime.cloudflareCreateWorkerTool, {
      userId,
      grantedScopes: ["access_provider_connections"],
      vaultId,
      accountId: "account_1",
      workerName: "invalid worker name",
      rootDirectory: "/",
    });

    expect(result).toMatchObject({
      status: "error",
      text: expect.stringContaining("Worker name"),
    });
    expect(result).not.toHaveProperty("structuredContent");
  });

  it("keeps browser handoff behind its dedicated trusted scope", async () => {
    const { t, userId } = await seedToolRuntimeOwner();

    const result = await t.action(internal.toolRuntime.runtime.createBrowserHandoffTool, {
      userId,
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
