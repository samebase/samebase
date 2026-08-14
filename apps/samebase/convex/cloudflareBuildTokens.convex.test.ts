import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function seedCloudflareOrganization() {
  const t = makeConvexTest();
  const { memberId, organizationId, outsiderId, ownerId } = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      state: "active",
      email: "owner@example.test",
      isApproved: true,
    });
    const memberId = await ctx.db.insert("users", {
      state: "active",
      email: "member@example.test",
      isApproved: true,
    });
    const outsiderId = await ctx.db.insert("users", {
      state: "active",
      email: "outsider@example.test",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "cloudflare-token-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "cloudflare-token-owner",
      githubOwnerLoginNormalized: "cloudflare-token-owner",
      githubInstallationId: "cloudflare-token-installation",
      cloudflareAccount: {
        accountId: "exact-cloudflare-account",
        accountName: "Exact Cloudflare account",
      },
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: ownerId,
      role: "owner",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: memberId,
      role: "member",
    });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      cloudflare: {
        auth: {
          method: "oauth",
          credential: "cloudflare-oauth-access",
          refreshCredential: "cloudflare-oauth-refresh",
          credentialExpiresAt: Date.now() + 3_600_000,
        },
        connectedByUserId: ownerId,
        updatedAt: Date.now(),
      },
    });
    return { memberId, organizationId, outsiderId, ownerId };
  });
  return { memberId, organizationId, outsiderId, ownerId, t };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Cloudflare Workers Builds token list", () => {
  it("returns only the exact organization account token UUIDs and names in stable order", async () => {
    const { memberId, organizationId, t } = await seedCloudflareOrganization();
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      expect(url).toBe(
        "https://api.cloudflare.com/client/v4/accounts/exact-cloudflare-account/builds/tokens?page=1&per_page=100",
      );
      return Response.json({
        success: true,
        errors: [],
        messages: [],
        result: [
          {
            build_token_uuid: "token-z",
            build_token_name: "Zulu",
            cloudflare_token_id: "provider-token-id",
          },
          {
            build_token_uuid: "token-b",
            build_token_name: "Alpha",
          },
          {
            build_token_uuid: "token-a",
            build_token_name: "Alpha",
          },
          {
            build_token_uuid: "token-u",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetch);
    const asMember = t.withIdentity({
      subject: `${memberId}|session`,
      tokenIdentifier: `test:${memberId}`,
    });

    await expect(
      asMember.action(api.cloudflareBuildTokens.list, { organizationId }),
    ).resolves.toEqual({
      accountId: "exact-cloudflare-account",
      tokens: [
        { name: "Alpha", uuid: "token-a" },
        { name: "Alpha", uuid: "token-b" },
        { name: "Unnamed token", uuid: "token-u" },
        { name: "Zulu", uuid: "token-z" },
      ],
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects a user outside the organization before a Cloudflare request", async () => {
    const { organizationId, outsiderId, t } = await seedCloudflareOrganization();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const asOutsider = t.withIdentity({
      subject: `${outsiderId}|session`,
      tokenIdentifier: `test:${outsiderId}`,
    });

    await expect(
      asOutsider.action(api.cloudflareBuildTokens.list, { organizationId }),
    ).rejects.toThrow("Organization membership is required.");
    expect(fetch).not.toHaveBeenCalled();
  });
});
