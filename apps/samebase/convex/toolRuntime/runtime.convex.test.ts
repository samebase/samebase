import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

async function seedToolRuntimeOwner() {
  const t = makeConvexTest();
  const { userId, vaultId } = await t.run(async (ctx) => {
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
  return { t, userId, vaultId };
}

describe("MCP tool runtime boundaries", () => {
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
