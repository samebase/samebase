import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { githubUserAuthorizationAad } from "./githubUserAuthorizationModel";
import {
  organizationCiCredentialAad,
  organizationProviderCredentialAad,
} from "./organization/providerCredentialModel";
import { openSecret } from "./sealedSecret";
import { makeConvexTest, sealTestCredentials, testCredential } from "./test.setup";

/** Throwaway keys: 32 bytes each, in base64. */
const oldKey = `${"A".repeat(43)}=`;
const currentKey = `${"B".repeat(43)}=`;

function stubKeyRing(ring: { current: string; keys: Record<string, string> }) {
  vi.stubEnv("CREDENTIAL_KEYS", JSON.stringify(ring));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

async function insertOwner(t: ReturnType<typeof makeConvexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "reseal-owner@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "reseal-installation",
      githubOwnerId: "reseal-owner",
      githubOwnerLogin: "reseal-owner",
      githubOwnerLoginNormalized: "reseal-owner",
      githubOwnerType: "organization",
    });
    return { organizationId, userId };
  });
}

/** The provider, CI, and GitHub rows of the owner, with each credential as a testCredential. */
async function insertCredentialRows(
  t: ReturnType<typeof makeConvexTest>,
  owner: { organizationId: Id<"organizations">; userId: Id<"users"> },
) {
  const { organizationId, userId } = owner;
  return await t.run(async (ctx) => {
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        auth: { method: "api_key", credential: testCredential("convex-token") },
        connectedByUserId: userId,
        updatedAt: 1,
      },
      cloudflare: {
        auth: {
          method: "oauth",
          credential: testCredential("cloudflare-access-token"),
          refreshCredential: testCredential("cloudflare-refresh-token"),
          credentialExpiresAt: 2,
        },
        connectedByUserId: userId,
        updatedAt: 1,
      },
    });
    await ctx.db.insert("organizationCiCredentials", {
      organizationId,
      cloudflare: {
        apiToken: testCredential("cloudflare-ci-token"),
        accountId: "cloudflare-account",
        connectedByUserId: userId,
        updatedAt: 1,
      },
      convex: {
        accessToken: testCredential("convex-ci-token"),
        teamId: "convex-team",
        connectedByUserId: userId,
        updatedAt: 1,
      },
    });
    return await ctx.db.insert("githubUserAuthorizations", {
      userId,
      githubUserId: "reseal-github-user",
      githubUserLogin: "reseal-github-user",
      accessToken: testCredential("github-access-token"),
      accessTokenExpiresAt: 2,
      refreshToken: testCredential("github-refresh-token"),
      refreshTokenExpiresAt: 3,
      createdAt: 1,
      updatedAt: 1,
    });
  });
}

describe("credential reseal", () => {
  it("seals the values under an older key again under the current key", async () => {
    const t = makeConvexTest();
    const { organizationId, userId } = await insertOwner(t);
    stubKeyRing({ current: "old", keys: { old: oldKey } });
    await insertCredentialRows(t, { organizationId, userId });
    await sealTestCredentials(t);
    stubKeyRing({ current: "current", keys: { old: oldKey, current: currentKey } });

    await expect(t.action(internal.resealCredentials.run, {})).resolves.toEqual({
      resealed: 7,
      unchanged: 0,
      skippedChanged: 0,
    });

    const rows = await t.run(async (ctx) => ({
      provider: await ctx.db.query("organizationProviderCredentials").unique(),
      ci: await ctx.db.query("organizationCiCredentials").unique(),
      github: await ctx.db.query("githubUserAuthorizations").unique(),
    }));
    if (
      rows.provider?.convex === undefined ||
      rows.provider.cloudflare?.auth.method !== "oauth" ||
      rows.ci?.cloudflare === undefined ||
      rows.ci.convex === undefined ||
      rows.github === null
    ) {
      throw new Error("Expected the provider, CI, and GitHub rows.");
    }
    const providerAad = (field: Parameters<typeof organizationProviderCredentialAad>[1]) =>
      organizationProviderCredentialAad(organizationId, field);
    const fields = [
      { sealed: rows.provider.convex.auth.credential, aad: providerAad("convex.auth.credential") },
      {
        sealed: rows.provider.cloudflare.auth.credential,
        aad: providerAad("cloudflare.auth.credential"),
      },
      {
        sealed: rows.provider.cloudflare.auth.refreshCredential,
        aad: providerAad("cloudflare.auth.refreshCredential"),
      },
      {
        sealed: rows.ci.cloudflare.apiToken,
        aad: organizationCiCredentialAad(organizationId, "cloudflare.apiToken"),
      },
      {
        sealed: rows.ci.convex.accessToken,
        aad: organizationCiCredentialAad(organizationId, "convex.accessToken"),
      },
      {
        sealed: rows.github.accessToken,
        aad: githubUserAuthorizationAad(userId, "accessToken"),
      },
      {
        sealed: rows.github.refreshToken,
        aad: githubUserAuthorizationAad(userId, "refreshToken"),
      },
    ];
    expect(fields.filter(({ sealed }) => sealed.keyId !== "current")).toEqual([]);
    await expect(Promise.all(fields.map(openSecret))).resolves.toEqual([
      "convex-token",
      "cloudflare-access-token",
      "cloudflare-refresh-token",
      "cloudflare-ci-token",
      "convex-ci-token",
      "github-access-token",
      "github-refresh-token",
    ]);

    await expect(t.action(internal.resealCredentials.run, {})).resolves.toEqual({
      resealed: 0,
      unchanged: 7,
      skippedChanged: 0,
    });
  });

  it("keeps a field that changed after the read", async () => {
    const t = makeConvexTest();
    const authorizationId = await insertCredentialRows(t, await insertOwner(t));
    await sealTestCredentials(t);
    const before = await t.run(async (ctx) => await ctx.db.get(authorizationId));
    if (before === null) {
      throw new Error("Expected the GitHub user authorization.");
    }

    await expect(
      t.mutation(internal.resealCredentials.writeGitHubUserAuthorization, {
        id: authorizationId,
        accessToken: {
          expected: testCredential("stale-access-token"),
          sealed: testCredential("resealed-access-token"),
        },
      }),
    ).resolves.toEqual({ resealed: 0, skippedChanged: 1 });
    await expect(t.run(async (ctx) => await ctx.db.get(authorizationId))).resolves.toMatchObject({
      accessToken: before.accessToken,
    });
  });
});
