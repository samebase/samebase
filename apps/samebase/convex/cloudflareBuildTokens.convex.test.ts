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
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const memberId = await ctx.db.insert("users", {
      state: "active",
      email: "member@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const outsiderId = await ctx.db.insert("users", {
      state: "active",
      email: "outsider@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
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
        lastUsedBuildTokenUuid: "f9e12f48-dd63-4e28-aef7-ece63d11539d",
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
  it("returns only non-secret token fields from the exact organization account", async () => {
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
            build_token_uuid: "f9e12f48-dd63-4e28-aef7-ece63d11539d",
            build_token_name: "Workers Builds - 2026-08-14 01:54",
            cloudflare_token_id: "provider-token-id",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetch);
    const asMember = t.withIdentity({
      subject: memberId,
      tokenIdentifier: `test:${memberId}`,
    });

    await expect(
      asMember.action(api.cloudflareBuildTokens.list, { organizationId }),
    ).resolves.toEqual({
      accountId: "exact-cloudflare-account",
      lastUsedBuildTokenUuid: "f9e12f48-dd63-4e28-aef7-ece63d11539d",
      tokens: [
        { name: "Workers Builds - 2026-08-14 01:54", uuid: "f9e12f48-dd63-4e28-aef7-ece63d11539d" },
      ],
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("returns null when the stored last-used token is not in the live account list", async () => {
    const { memberId, organizationId, t } = await seedCloudflareOrganization();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          errors: [],
          messages: [],
          result: [
            {
              build_token_uuid: "89fa2f0f-ca7c-4f14-af5d-6f95714b68c3",
              build_token_name: "Current token",
              cloudflare_token_id: "provider-token-id",
            },
          ],
        }),
      ),
    );
    const asMember = t.withIdentity({
      subject: memberId,
      tokenIdentifier: `test:${memberId}`,
    });

    await expect(
      asMember.action(api.cloudflareBuildTokens.list, { organizationId }),
    ).resolves.toEqual({
      accountId: "exact-cloudflare-account",
      lastUsedBuildTokenUuid: null,
      tokens: [{ name: "Current token", uuid: "89fa2f0f-ca7c-4f14-af5d-6f95714b68c3" }],
    });
  });

  it("rejects a user outside the organization before a Cloudflare request", async () => {
    const { organizationId, outsiderId, t } = await seedCloudflareOrganization();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const asOutsider = t.withIdentity({
      subject: outsiderId,
      tokenIdentifier: `test:${outsiderId}`,
    });

    await expect(
      asOutsider.action(api.cloudflareBuildTokens.list, { organizationId }),
    ).rejects.toThrow("Organization membership is required.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves Cloudflare provider error details", async () => {
    const { memberId, organizationId, t } = await seedCloudflareOrganization();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: false,
          errors: [{ code: 9999, message: "provider-internal-detail" }],
          messages: [],
          result: null,
        }),
      ),
    );
    const asMember = t.withIdentity({
      subject: memberId,
      tokenIdentifier: `test:${memberId}`,
    });

    let errorMessage = "";
    try {
      await asMember.action(api.cloudflareBuildTokens.list, { organizationId });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    expect(errorMessage).toContain("code 9999: provider-internal-detail");
  });
});
