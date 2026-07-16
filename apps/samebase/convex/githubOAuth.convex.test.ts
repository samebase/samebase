import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type TestGithubAuth =
  | {
      method: "oauth";
      credential: string;
    }
  | {
      method: "api_key";
      credential: string;
    };

function stubGithubOAuthEnv() {
  vi.stubEnv("PROVIDER_GITHUB_OAUTH_CLIENT_ID", "client_123");
  vi.stubEnv("PROVIDER_GITHUB_OAUTH_CLIENT_SECRET", "secret_123");
  vi.stubEnv("PROVIDER_GITHUB_OAUTH_REDIRECT_URL", "https://samebase.test/oauth/github/callback");
}

async function seedGithubConnection(t: ReturnType<typeof makeConvexTest>, auth: TestGithubAuth) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    await ctx.db.insert("providerConnections", {
      kind: "github",
      userId,
      githubAccountId: 101,
      auth,
      username: "ada",
      createdAt: 1,
      updatedAt: 2,
    });
    return userId;
  });
}

async function readGithubConnection(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("providerConnections")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", "github"))
      .unique();
  });
}

function asUser(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("reauthorizeGithubOAuth", () => {
  it("persists the stable GitHub account id from an OAuth callback", async () => {
    const t = makeConvexTest();
    const { oauthStateId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const oauthStateId = await ctx.db.insert("oauthStates", {
        provider: "github",
        userId,
        state: "oauth-state",
        createdAt: 1,
        expiresAt: 2,
      });
      return { oauthStateId, userId };
    });

    await t.mutation(internal.githubOAuth.storeGithubOauthConnection, {
      userId,
      accessToken: "github-oauth-token",
      githubAccountId: 101,
      username: "ada",
      oauthStateId,
    });

    await expect(readGithubConnection(t, userId)).resolves.toMatchObject({
      kind: "github",
      githubAccountId: 101,
      username: "ada",
    });
    await expect(t.run(async (ctx) => await ctx.db.get(oauthStateId))).resolves.toBeNull();
  });

  it("revokes the GitHub OAuth grant and removes the local connection", async () => {
    const t = makeConvexTest();
    const userId = await seedGithubConnection(t, {
      method: "oauth",
      credential: "github-oauth-token",
    });
    stubGithubOAuthEnv();
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("DELETE");
      expect(init?.body).toBe(JSON.stringify({ access_token: "github-oauth-token" }));
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetch);

    const authorizeUrl = await asUser(t, userId).action(api.githubOAuth.reauthorizeGithubOAuth, {
      returnToPath: "/providers",
    });

    expect(authorizeUrl).toContain("https://github.com/login/oauth/authorize");
    expect(authorizeUrl).toContain("client_id=client_123");
    expect(authorizeUrl).toContain("state=");
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(readGithubConnection(t, userId)).resolves.toBeNull();
  });

  it("treats a missing GitHub OAuth grant as already revoked", async () => {
    const t = makeConvexTest();
    const userId = await seedGithubConnection(t, {
      method: "oauth",
      credential: "github-oauth-token",
    });
    stubGithubOAuthEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );

    await expect(
      asUser(t, userId).action(api.githubOAuth.reauthorizeGithubOAuth, {
        returnToPath: "/providers",
      }),
    ).resolves.toContain("https://github.com/login/oauth/authorize");
    await expect(readGithubConnection(t, userId)).resolves.toBeNull();
  });

  it("keeps the local connection when GitHub revoke fails", async () => {
    const t = makeConvexTest();
    const userId = await seedGithubConnection(t, {
      method: "oauth",
      credential: "github-oauth-token",
    });
    stubGithubOAuthEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 401 })),
    );

    await expect(
      asUser(t, userId).action(api.githubOAuth.reauthorizeGithubOAuth, {
        returnToPath: "/providers",
      }),
    ).rejects.toThrowError("Failed to revoke GitHub OAuth grant (401).");
    await expect(readGithubConnection(t, userId)).resolves.toMatchObject({
      kind: "github",
      auth: {
        method: "oauth",
        credential: "github-oauth-token",
      },
    });
  });

  it("rejects non-OAuth GitHub connections before network calls", async () => {
    const t = makeConvexTest();
    const userId = await seedGithubConnection(t, {
      method: "api_key",
      credential: "github-api-key",
    });
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      asUser(t, userId).action(api.githubOAuth.reauthorizeGithubOAuth, {
        returnToPath: "/providers",
      }),
    ).rejects.toThrowError("GitHub OAuth is not connected.");
    expect(fetch).not.toHaveBeenCalled();
    await expect(readGithubConnection(t, userId)).resolves.toMatchObject({
      kind: "github",
      auth: {
        method: "api_key",
        credential: "github-api-key",
      },
    });
  });

  it("rejects absent GitHub connections before network calls", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      asUser(t, userId).action(api.githubOAuth.reauthorizeGithubOAuth, {
        returnToPath: "/providers",
      }),
    ).rejects.toThrowError("GitHub OAuth is not connected.");
    expect(fetch).not.toHaveBeenCalled();
  });
});
