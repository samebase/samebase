import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { githubUserAuthorizationAad } from "./githubUserAuthorizationModel";
import { sha256Hex } from "./mcp/tokens";
import {
  organizationCiCredentialAad,
  organizationProviderCredentialAad,
} from "./organization/providerCredentialModel";
import { openSecret, type StoredSecret } from "./sealedSecret";
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

/** The GitHub user authorization of `userId`, with `accessToken` and `refreshToken` as given. */
async function insertGitHubUserAuthorization(
  t: ReturnType<typeof makeConvexTest>,
  args: { userId: Id<"users">; accessToken: StoredSecret; refreshToken: StoredSecret },
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("githubUserAuthorizations", {
        userId: args.userId,
        githubUserId: "reseal-github-user",
        githubUserLogin: "reseal-github-user",
        accessToken: args.accessToken,
        accessTokenExpiresAt: 2,
        refreshToken: args.refreshToken,
        refreshTokenExpiresAt: 3,
        createdAt: 1,
        updatedAt: 1,
      }),
  );
}

describe("credential reseal", () => {
  it("seals the plain rows written before sealing, and a second run changes nothing", async () => {
    const t = makeConvexTest();
    const { organizationId, userId } = await insertOwner(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId,
        convex: {
          auth: { method: "api_key", credential: "plain-convex-token" },
          connectedByUserId: userId,
          updatedAt: 1,
        },
        cloudflare: {
          auth: {
            method: "oauth",
            credential: "plain-cloudflare-access-token",
            refreshCredential: "plain-cloudflare-refresh-token",
            credentialExpiresAt: 2,
          },
          connectedByUserId: userId,
          updatedAt: 1,
        },
      });
      await ctx.db.insert("organizationCiCredentials", {
        organizationId,
        cloudflare: {
          apiToken: "plain-cloudflare-ci-token",
          accountId: "cloudflare-account",
          connectedByUserId: userId,
          updatedAt: 1,
        },
        convex: {
          accessToken: "plain-convex-ci-token",
          teamId: "convex-team",
          connectedByUserId: userId,
          updatedAt: 1,
        },
      });
    });
    await insertGitHubUserAuthorization(t, {
      userId,
      accessToken: "plain-github-access-token",
      refreshToken: "plain-github-refresh-token",
    });

    await expect(t.action(internal.resealCredentials.run, {})).resolves.toEqual({
      sealed: 7,
      resealed: 0,
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
    const opened = await Promise.all([
      openSecret({
        sealed: rows.provider.convex.auth.credential,
        aad: providerAad("convex.auth.credential"),
      }),
      openSecret({
        sealed: rows.provider.cloudflare.auth.credential,
        aad: providerAad("cloudflare.auth.credential"),
      }),
      openSecret({
        sealed: rows.provider.cloudflare.auth.refreshCredential,
        aad: providerAad("cloudflare.auth.refreshCredential"),
      }),
      openSecret({
        sealed: rows.ci.cloudflare.apiToken,
        aad: organizationCiCredentialAad(organizationId, "cloudflare.apiToken"),
      }),
      openSecret({
        sealed: rows.ci.convex.accessToken,
        aad: organizationCiCredentialAad(organizationId, "convex.accessToken"),
      }),
      openSecret({
        sealed: rows.github.accessToken,
        aad: githubUserAuthorizationAad(userId, "accessToken"),
      }),
      openSecret({
        sealed: rows.github.refreshToken,
        aad: githubUserAuthorizationAad(userId, "refreshToken"),
      }),
    ]);
    expect(opened).toEqual([
      "plain-convex-token",
      "plain-cloudflare-access-token",
      "plain-cloudflare-refresh-token",
      "plain-cloudflare-ci-token",
      "plain-convex-ci-token",
      "plain-github-access-token",
      "plain-github-refresh-token",
    ]);
    expect(rows.provider.convex.auth.credential).toMatchObject({ keyId: "test" });
    expect(JSON.stringify(rows)).not.toContain("plain-");

    await expect(t.action(internal.resealCredentials.run, {})).resolves.toEqual({
      sealed: 0,
      resealed: 0,
      unchanged: 7,
      skippedChanged: 0,
    });
  });

  it("seals a value under an older key again under the current key", async () => {
    const t = makeConvexTest();
    const { userId } = await insertOwner(t);
    stubKeyRing({ current: "old", keys: { old: oldKey } });
    await insertGitHubUserAuthorization(t, {
      userId,
      accessToken: testCredential("rotated-access-token"),
      refreshToken: testCredential("rotated-refresh-token"),
    });
    await sealTestCredentials(t);
    stubKeyRing({ current: "current", keys: { old: oldKey, current: currentKey } });

    await expect(t.action(internal.resealCredentials.run, {})).resolves.toEqual({
      sealed: 0,
      resealed: 2,
      unchanged: 0,
      skippedChanged: 0,
    });

    const authorization = await t.run(
      async (ctx) => await ctx.db.query("githubUserAuthorizations").unique(),
    );
    if (authorization === null) {
      throw new Error("Expected the GitHub user authorization.");
    }
    expect(authorization.accessToken).toMatchObject({ keyId: "current" });
    expect(authorization.refreshToken).toMatchObject({ keyId: "current" });
    await expect(
      openSecret({
        sealed: authorization.accessToken,
        aad: githubUserAuthorizationAad(userId, "accessToken"),
      }),
    ).resolves.toBe("rotated-access-token");
  });

  it("keeps a field that changed after the read", async () => {
    const t = makeConvexTest();
    const { userId } = await insertOwner(t);
    const authorizationId = await insertGitHubUserAuthorization(t, {
      userId,
      accessToken: "refreshed-access-token",
      refreshToken: "refreshed-refresh-token",
    });

    await expect(
      t.mutation(internal.resealCredentials.writeGitHubUserAuthorization, {
        id: authorizationId,
        accessToken: {
          expected: { plainSha256: await sha256Hex("read-access-token") },
          sealed: testCredential("read-access-token"),
        },
      }),
    ).resolves.toEqual({ sealed: 0, resealed: 0, skippedChanged: 1 });
    await expect(t.run(async (ctx) => await ctx.db.get(authorizationId))).resolves.toMatchObject({
      accessToken: "refreshed-access-token",
    });
  });
});
