import { describe, expect, it } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("users Convex contract", () => {
  it("treats anonymous viewers as signed out", async () => {
    const t = makeConvexTest();

    await expect(t.query(api.users.viewer)).resolves.toBeNull();
    await expect(t.query(api.users.isCurrentUserApproved)).resolves.toBe(false);
    await expect(t.mutation(api.users.disconnectGithub)).rejects.toThrowError(
      "User not authenticated",
    );
  });

  it("loads viewer connection state from authenticated database rows", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId,
        auth: {
          method: "api_key",
          credential: "test-github-api-key",
        },
        username: "ada",
        createdAt: 1,
        updatedAt: 2,
      });
    });

    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(asUser.query(api.users.viewer)).resolves.toMatchObject({
      _id: userId,
      name: "Ada",
      email: "ada@example.com",
      githubUsername: "ada",
      hasGithubConnection: true,
      hasConvexConnection: false,
      hasCloudflareConnection: false,
    });
    await expect(asUser.query(api.users.isCurrentUserApproved)).resolves.toBe(true);
  });

  it("keeps provider connection state scoped to the authenticated user", async () => {
    const t = makeConvexTest();
    const ownerId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Owner",
        email: "owner@example.com",
        isApproved: true,
      });
    });
    const viewerId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Viewer",
        email: "viewer@example.com",
        isApproved: false,
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId: ownerId,
        auth: {
          method: "api_key",
          credential: "test-owner-github-api-key",
        },
        username: "owner-login",
        createdAt: 1,
        updatedAt: 2,
      });
    });

    const asViewer = t.withIdentity({
      subject: `${viewerId}|viewer-session`,
      tokenIdentifier: `test:${viewerId}`,
    });

    await expect(asViewer.query(api.users.viewer)).resolves.toMatchObject({
      _id: viewerId,
      name: "Viewer",
      email: "viewer@example.com",
      hasGithubConnection: false,
      hasConvexConnection: false,
      hasCloudflareConnection: false,
    });
    await expect(asViewer.query(api.users.getGithubConnectionStatus)).resolves.toEqual({
      connected: false,
    });
    await expect(asViewer.query(api.users.isCurrentUserApproved)).resolves.toBe(false);
    await expect(asViewer.mutation(api.users.disconnectGithub)).resolves.toBeNull();

    const ownerConnectionAfterViewerDisconnect = await t.run(async (ctx) => {
      return await ctx.db
        .query("providerConnections")
        .withIndex("by_user_kind", (q) => q.eq("userId", ownerId).eq("kind", "github"))
        .unique();
    });
    expect(ownerConnectionAfterViewerDisconnect).toMatchObject({
      kind: "github",
      userId: ownerId,
      username: "owner-login",
    });

    const asOwner = t.withIdentity({
      subject: `${ownerId}|owner-session`,
      tokenIdentifier: `test:${ownerId}`,
    });

    await expect(asOwner.query(api.users.getGithubConnectionStatus)).resolves.toEqual({
      connected: true,
      username: "owner-login",
      authMethod: "api_key",
    });
  });

  it("reports whether the Cloudflare connection still needs account selection", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId,
        auth: {
          method: "api_key",
          credential: "test-cloudflare-api-key",
        },
        defaultAccount: { state: "not_selected" },
        createdAt: 1,
        updatedAt: 2,
      });
      return userId;
    });

    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(asUser.query(api.users.getCloudflareConnectionStatus)).resolves.toEqual({
      connected: true,
      accountSelection: "not_selected",
      authMethod: "api_key",
    });
  });
});
