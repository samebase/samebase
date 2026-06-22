import { describe, expect, it, vi } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("users Convex contract", () => {
  it("treats anonymous viewers as signed out", async () => {
    const t = makeConvexTest();

    await expect(t.query(api.users.viewer)).resolves.toBeNull();
    await expect(t.query(api.users.currentViewerAccess)).resolves.toEqual({
      role: "role_anonymous",
      accessKeys: ["access_public"],
    });
    await expect(t.query(api.users.currentViewerRole)).resolves.toEqual({
      role: "role_anonymous",
    });
    await expect(t.mutation(api.users.disconnectGithub)).rejects.toThrowError("Access denied");
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
    await expect(asUser.query(api.users.currentViewerAccess)).resolves.toEqual({
      role: "role_member",
      accessKeys: [
        "access_public",
        "access_user_preferences",
        "access_dashboard",
        "access_provider_connections",
        "access_repo_connect",
        "access_app_create",
        "access_app_refresh",
        "access_files_read",
        "access_files_write",
      ],
    });
    await expect(asUser.query(api.users.currentViewerRole)).resolves.toEqual({
      role: "role_member",
    });
  });

  it("keeps pending-access users on public shell access and denies provider access", async () => {
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
    await expect(asViewer.query(api.users.currentViewerAccess)).resolves.toEqual({
      role: "role_pending_access",
      accessKeys: ["access_public", "access_user_preferences"],
    });
    await expect(asViewer.query(api.users.currentViewerRole)).resolves.toEqual({
      role: "role_pending_access",
    });
    await expect(asViewer.query(api.users.getGithubConnectionStatus)).rejects.toThrowError(
      "Access denied",
    );
    await expect(asViewer.query(api.users.getGithubProviderSummary)).rejects.toThrowError(
      "Access denied",
    );
    await expect(asViewer.mutation(api.users.disconnectGithub)).rejects.toThrowError(
      "Access denied",
    );

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
    await expect(asOwner.query(api.users.getGithubProviderSummary)).resolves.toMatchObject({
      connected: true,
      username: "owner-login",
      authMethod: "api_key",
      reauthorizeAvailable: false,
    });
  });

  it("keeps an approved member as member when they connect the staff GitHub username", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const insertedUserId = await ctx.db.insert("users", {
        name: "Member",
        email: "nicu.dev@gmail.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId: insertedUserId,
        auth: {
          method: "api_key",
          credential: "test-github-api-key",
        },
        username: "nicu-chiciuc",
        createdAt: 1,
        updatedAt: 2,
      });
      return insertedUserId;
    });

    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(asUser.query(api.users.currentViewerRole)).resolves.toEqual({
      role: "role_member",
    });
  });

  it("keeps OAuth reauthorize available when the manage URL env is absent", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const insertedUserId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId: insertedUserId,
        auth: {
          method: "oauth",
          credential: "github-oauth-token",
        },
        username: "ada",
        createdAt: 1,
        updatedAt: 2,
      });
      return insertedUserId;
    });

    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(asUser.query(api.users.getGithubProviderSummary)).resolves.toMatchObject({
      connected: true,
      authMethod: "oauth",
      reauthorizeAvailable: true,
    });
  });

  it("checks GitHub OAuth health from live GitHub responses", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const insertedUserId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId: insertedUserId,
        auth: {
          method: "oauth",
          credential: "github-oauth-token",
        },
        username: "stored-login",
        createdAt: 1,
        updatedAt: 2,
      });
      return insertedUserId;
    });
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        requestedUrls.push(url);

        if (url === "https://api.github.com/user") {
          return new Response(JSON.stringify({ login: "live-login" }), {
            headers: {
              "content-type": "application/json",
              "x-oauth-scopes": "repo, user, read:org",
            },
          });
        }
        if (url.startsWith("https://api.github.com/user/repos")) {
          return new Response("[]", {
            headers: {
              "content-type": "application/json",
              "x-oauth-scopes": "repo, user, read:org",
            },
          });
        }
        if (url.startsWith("https://api.github.com/user/memberships/orgs")) {
          return new Response(
            JSON.stringify([
              {
                role: "admin",
                permissions: {
                  can_create_repository: false,
                },
                organization: {
                  login: "samebase",
                },
              },
              {
                role: "member",
                permissions: {
                  can_create_repository: false,
                },
                organization: {
                  login: "acme-product",
                },
              },
            ]),
            {
              headers: {
                "content-type": "application/json",
                "x-oauth-scopes": "repo, user, read:org",
              },
            },
          );
        }

        return new Response("not found", { status: 404 });
      }),
    );

    try {
      const asUser = t.withIdentity({
        subject: `${userId}|test-session`,
        tokenIdentifier: `test:${userId}`,
      });

      const health = await asUser.action(api.users.checkGithubConnectionHealth);

      expect(requestedUrls).toEqual([
        "https://api.github.com/user",
        "https://api.github.com/user/repos?sort=updated&per_page=1&affiliation=owner%2Ccollaborator%2Corganization_member",
        "https://api.github.com/user/memberships/orgs?state=active&per_page=100&page=1",
      ]);
      expect(health).toMatchObject({
        connected: true,
        username: "live-login",
        authMethod: "oauth",
        grantedScopes: ["repo", "user", "read:org"],
        organizations: [
          {
            login: "acme-product",
            role: "member",
            canCreateRepository: false,
          },
          {
            login: "samebase",
            role: "admin",
            canCreateRepository: false,
          },
        ],
        checks: [
          {
            key: "profile",
            status: "ok",
          },
          {
            key: "repositories",
            status: "ok",
          },
          {
            key: "organizations",
            status: "ok",
          },
        ],
      });
      expect(health.requiredScopes).toEqual([
        {
          scope: "repo",
          label: "List and edit repositories",
          status: "granted",
        },
        {
          scope: "delete_repo",
          label: "Delete Samebase-managed repositories",
          status: "missing",
        },
        {
          scope: "user",
          label: "Read GitHub profile",
          status: "granted",
        },
        {
          scope: "user:email",
          label: "Read GitHub email addresses",
          status: "granted",
        },
        {
          scope: "read:org",
          label: "Read organization memberships",
          status: "granted",
        },
        {
          scope: "read:packages",
          label: "Read packages",
          status: "missing",
        },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("treats absent GitHub scope headers as unknown access", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const insertedUserId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId: insertedUserId,
        auth: {
          method: "oauth",
          credential: "github-oauth-token",
        },
        username: "stored-login",
        createdAt: 1,
        updatedAt: 2,
      });
      return insertedUserId;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        if (url === "https://api.github.com/user") {
          return new Response(JSON.stringify({ login: "live-login" }), {
            headers: {
              "content-type": "application/json",
            },
          });
        }
        if (url.startsWith("https://api.github.com/user/repos")) {
          return new Response("[]", {
            headers: {
              "content-type": "application/json",
            },
          });
        }
        if (url.startsWith("https://api.github.com/user/memberships/orgs")) {
          return new Response("[]", {
            headers: {
              "content-type": "application/json",
            },
          });
        }

        return new Response("not found", { status: 404 });
      }),
    );

    try {
      const asUser = t.withIdentity({
        subject: `${userId}|test-session`,
        tokenIdentifier: `test:${userId}`,
      });

      const health = await asUser.action(api.users.checkGithubConnectionHealth);

      expect(health.requiredScopes.map((scope) => scope.status)).toEqual([
        "unknown",
        "unknown",
        "unknown",
        "unknown",
        "unknown",
        "unknown",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports rejected GitHub credentials and skips repository checks", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const insertedUserId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId: insertedUserId,
        auth: {
          method: "oauth",
          credential: "github-oauth-token",
        },
        username: "stored-login",
        createdAt: 1,
        updatedAt: 2,
      });
      return insertedUserId;
    });
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        requestedUrls.push(url);

        if (url === "https://api.github.com/user") {
          return new Response("denied", { status: 401 });
        }

        return new Response("not found", { status: 404 });
      }),
    );

    try {
      const asUser = t.withIdentity({
        subject: `${userId}|test-session`,
        tokenIdentifier: `test:${userId}`,
      });

      const health = await asUser.action(api.users.checkGithubConnectionHealth);

      expect(requestedUrls).toEqual(["https://api.github.com/user"]);
      expect(health.checks).toMatchObject([
        {
          key: "profile",
          status: "error",
          message: "GitHub rejected this credential. Reconnect GitHub.",
        },
        {
          key: "repositories",
          status: "unknown",
          message: "Skipped because the profile check failed.",
        },
        {
          key: "organizations",
          status: "unknown",
          message: "Skipped because the profile check failed.",
        },
      ]);
      expect(health.requiredScopes.map((scope) => scope.status)).toEqual([
        "unknown",
        "unknown",
        "unknown",
        "unknown",
        "unknown",
        "unknown",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports GitHub repository listing authorization failures", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const insertedUserId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId: insertedUserId,
        auth: {
          method: "oauth",
          credential: "github-oauth-token",
        },
        username: "stored-login",
        createdAt: 1,
        updatedAt: 2,
      });
      return insertedUserId;
    });
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        requestedUrls.push(url);

        if (url === "https://api.github.com/user") {
          return new Response(JSON.stringify({ login: "live-login" }), {
            headers: {
              "content-type": "application/json",
              "x-oauth-scopes": "repo",
            },
          });
        }
        if (url.startsWith("https://api.github.com/user/repos")) {
          return new Response("denied", { status: 403 });
        }
        if (url.startsWith("https://api.github.com/user/memberships/orgs")) {
          return new Response("[]", {
            headers: {
              "content-type": "application/json",
              "x-oauth-scopes": "repo, read:org",
            },
          });
        }

        return new Response("not found", { status: 404 });
      }),
    );

    try {
      const asUser = t.withIdentity({
        subject: `${userId}|test-session`,
        tokenIdentifier: `test:${userId}`,
      });

      const health = await asUser.action(api.users.checkGithubConnectionHealth);

      expect(requestedUrls).toEqual([
        "https://api.github.com/user",
        "https://api.github.com/user/repos?sort=updated&per_page=1&affiliation=owner%2Ccollaborator%2Corganization_member",
        "https://api.github.com/user/memberships/orgs?state=active&per_page=100&page=1",
      ]);
      expect(health.checks).toMatchObject([
        {
          key: "profile",
          status: "ok",
          message: "Authenticated as live-login.",
        },
        {
          key: "repositories",
          status: "error",
          message: "GitHub denied this request. Check org approval, SSO, or rate limits.",
        },
        {
          key: "organizations",
          status: "ok",
          message: "No organizations are visible to this credential.",
        },
      ]);
      expect(health.requiredScopes.map((scope) => scope.status)).toEqual([
        "granted",
        "missing",
        "missing",
        "missing",
        "granted",
        "missing",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
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
      authMethod: "api_key",
    });
  });
});
