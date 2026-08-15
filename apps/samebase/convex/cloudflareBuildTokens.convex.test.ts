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
    await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
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
  it("returns the exact account token records in descending case-insensitive name order", async () => {
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
            build_token_uuid: "token-old",
            build_token_name: "Workers Builds - 2026-08-13 10:00",
            cloudflare_token_id: "provider-token-id",
          },
          {
            build_token_uuid: "token-new-b",
            build_token_name: "Workers Builds - 2026-08-14 01:54",
          },
          {
            build_token_uuid: "token-new-a",
            build_token_name: "Workers Builds - 2026-08-14 01:54",
          },
          {
            build_token_uuid: "token-samebase",
            build_token_name: "samebase build token",
          },
          {
            build_token_uuid: "token-noter",
            build_token_name: "noter-worker build token",
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
        { name: "Workers Builds - 2026-08-14 01:54", uuid: "token-new-a" },
        { name: "Workers Builds - 2026-08-14 01:54", uuid: "token-new-b" },
        { name: "Workers Builds - 2026-08-13 10:00", uuid: "token-old" },
        { name: "Unnamed token", uuid: "token-u" },
        { name: "samebase build token", uuid: "token-samebase" },
        { name: "noter-worker build token", uuid: "token-noter" },
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
