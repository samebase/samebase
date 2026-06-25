import { describe, expect, it } from "vite-plus/test";

import { makeConvexTest } from "../test.setup";
import { buildMcpToolInvocationArgs, listMcpToolsForAccess } from "./http";

describe("MCP HTTP tool invocation args", () => {
  it("uses trusted user and scope values instead of raw tool arguments", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const tokenUserId = await ctx.db.insert("users", {
        name: "Token User",
        email: "token@example.com",
        isApproved: true,
      });
      const argumentUserId = await ctx.db.insert("users", {
        name: "Argument User",
        email: "argument@example.com",
        isApproved: true,
      });
      return { argumentUserId, tokenUserId };
    });

    const toolArgs = buildMcpToolInvocationArgs({
      input: {
        name: "test-app",
        owner: "samebase",
        convexProjectName: "test-app",
        cloudflareWorkerName: "test-app",
        userId: ids.argumentUserId,
        grantedScopes: ["access_app_create"],
      },
      userId: ids.tokenUserId,
      grantedScopes: [],
    });

    expect(toolArgs).toMatchObject({
      name: "test-app",
      owner: "samebase",
      convexProjectName: "test-app",
      cloudflareWorkerName: "test-app",
      userId: ids.tokenUserId,
      grantedScopes: [],
    });
  });
});

describe("MCP tool listing access", () => {
  it("requires both granted scopes and current user access", () => {
    expect(
      listMcpToolsForAccess({
        grantedScopes: ["access_app_create", "access_dashboard"],
        currentAccessKeys: ["access_dashboard"],
      }).map((tool) => tool.name),
    ).toEqual(["vault.dashboard.getUserVaults"]);

    expect(
      listMcpToolsForAccess({
        grantedScopes: ["access_dashboard"],
        currentAccessKeys: ["access_dashboard", "access_app_create"],
      }).map((tool) => tool.name),
    ).toEqual(["vault.dashboard.getUserVaults"]);

    expect(
      listMcpToolsForAccess({
        grantedScopes: ["access_app_create", "access_dashboard"],
        currentAccessKeys: ["access_dashboard", "access_app_create"],
      }).map((tool) => tool.name),
    ).toEqual(["vault.actions.createRepository", "vault.dashboard.getUserVaults"]);
  });
});
