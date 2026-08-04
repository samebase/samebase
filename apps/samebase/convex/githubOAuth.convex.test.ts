import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

function stubGithubOAuthEnv() {
  vi.stubEnv("PROVIDER_GITHUB_OAUTH_CLIENT_ID", "client_123");
  vi.stubEnv("PROVIDER_GITHUB_OAUTH_CLIENT_SECRET", "secret_123");
  vi.stubEnv("PROVIDER_GITHUB_OAUTH_REDIRECT_URL", "https://samebase.test/oauth/github/callback");
}

async function seedGithubOAuthConnection() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", { name: "GitHub organization" });
    await ctx.db.insert("organizationMemberships", { organizationId, userId });
    const providerConnectionId = await ctx.db.insert("providerConnections", {
      state: "connected",
      kind: "github",
      organizationId,
      connectedByUserId: userId,
      accountId: "123",
      auth: { method: "oauth", credential: "github-oauth-token" },
      username: "ada",
      createdAt: 1,
      updatedAt: 2,
    });
    await ctx.db.patch(organizationId, {
      selectedGithubProviderConnectionId: providerConnectionId,
    });
    return { organizationId, providerConnectionId, userId };
  });
  return { ...ids, t };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GitHub OAuth organization ownership", () => {
  it("keeps the current connection until the callback reauthorizes its exact row", async () => {
    const { organizationId, providerConnectionId, t, userId } = await seedGithubOAuthConnection();
    stubGithubOAuthEnv();
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    const authorizeUrl = await t
      .withIdentity({
        subject: `${userId}|test-session`,
        tokenIdentifier: `test:${userId}`,
      })
      .action(api.githubOAuth.reauthorizeGithubOAuth, {
        organizationId,
        returnToPath: "/providers",
      });

    expect(authorizeUrl).toContain("https://github.com/login/oauth/authorize");
    expect(new URL(authorizeUrl).searchParams.get("scope")?.split(" ")).toContain("workflow");
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      t.query(internal.oauthState.getOauthStateByState, {
        provider: "github",
        state: new URL(authorizeUrl).searchParams.get("state") ?? "",
      }),
    ).resolves.toMatchObject({ organizationId, providerConnectionId, userId });
  });

  it("reconnects through the selected disconnected row", async () => {
    const { organizationId, providerConnectionId, t, userId } = await seedGithubOAuthConnection();
    stubGithubOAuthEnv();
    await t.mutation(internal.providerConnections.disconnect, {
      organizationId,
      disconnectedByUserId: userId,
      providerConnectionId,
      kind: "github",
    });

    const authorizeUrl = await t
      .withIdentity({
        subject: `${userId}|test-session`,
        tokenIdentifier: `test:${userId}`,
      })
      .mutation(api.githubOAuth.getGithubOAuthUrl, {
        organizationId,
        returnToPath: "/providers",
      });

    await expect(
      t.query(internal.oauthState.getOauthStateByState, {
        provider: "github",
        state: new URL(authorizeUrl).searchParams.get("state") ?? "",
      }),
    ).resolves.toMatchObject({ organizationId, providerConnectionId, userId });
  });

  it("revokes only the exact connected OAuth row", async () => {
    const { organizationId, providerConnectionId, t } = await seedGithubOAuthConnection();
    stubGithubOAuthEnv();
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.githubOAuth.revokeGithubOAuthForOrganizationConnection, {
        organizationId,
        providerConnectionId,
      }),
    ).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
