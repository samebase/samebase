import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { githubUserAuthorizationAad } from "./githubUserAuthorizationModel";
import type { McpTokenHealth } from "./mcpTokenHealth";
import { organizationProviderCredentialAad } from "./organization/providerCredentialModel";
import { openSecret } from "./sealedSecret";
import { makeConvexTest, sealTestCredentials, testCredential } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

const ISSUER = "https://auth.samebase.com";
const CLOUDFLARE_RESOURCE = "https://api.cloudflare.com/client/v4/";
const GITHUB_RESOURCE = "https://api.github.com";
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The old hub's export: an answer for each hub refresh token it knows, else `invalid_grant`. */
function stubExport(answers: Partial<Record<string, () => Response>>) {
  const requests: { url: string; clientId: unknown; clientSecret: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const form = await request.formData();
      requests.push({
        url: request.url,
        clientId: form.get("client_id"),
        clientSecret: form.get("client_secret"),
      });
      const token = form.get("refresh_token");
      const answer = typeof token === "string" ? answers[token] : undefined;
      return answer === undefined ? json({ error: "invalid_grant" }, 400) : answer();
    }),
  );
  return requests;
}

async function insertOwner(t: ConvexTest, name: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: `${name}@example.test`,
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: `${name}-installation`,
      githubOwnerId: name,
      githubOwnerLogin: name,
      githubOwnerLoginNormalized: name,
      githubOwnerType: "organization",
    });
    return { organizationId, userId };
  });
}

async function insertCloudflare(
  t: ConvexTest,
  owner: { organizationId: Id<"organizations">; userId: Id<"users"> },
  hubToken: string,
  tokenHealth?: McpTokenHealth,
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId: owner.organizationId,
        cloudflare: {
          auth: {
            method: "oauth",
            credential: testCredential(`${hubToken}-access`),
            refreshCredential: testCredential(hubToken),
            credentialExpiresAt: Date.now() + 60 * 60 * 1000,
          },
          ...(tokenHealth ? { tokenHealth } : {}),
          connectedByUserId: owner.userId,
          updatedAt: 1,
        },
      }),
  );
}

async function insertGitHub(t: ConvexTest, userId: Id<"users">, hubToken: string) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("githubUserAuthorizations", {
        userId,
        githubUserId: hubToken,
        githubUserLogin: hubToken,
        accessToken: testCredential(`${hubToken}-access`),
        accessTokenExpiresAt: 1,
        refreshToken: testCredential(hubToken),
        // A refresh that the hub refused set the deadline to its own time.
        refreshTokenExpiresAt: 1,
        createdAt: 1,
        updatedAt: 1,
      }),
  );
}

async function readCloudflare(t: ConvexTest, rowId: Id<"organizationProviderCredentials">) {
  const row = await t.run(async (ctx) => await ctx.db.get(rowId));
  if (row?.cloudflare?.auth.method !== "oauth") throw new Error("Expected the Cloudflare row.");
  return { ...row.cloudflare, auth: row.cloudflare.auth, organizationId: row.organizationId };
}

async function readGitHub(t: ConvexTest, rowId: Id<"githubUserAuthorizations">) {
  const row = await t.run(async (ctx) => await ctx.db.get(rowId));
  if (row === null) throw new Error("Expected the GitHub row.");
  return row;
}

describe("hub grant copy", () => {
  it("stores each provider token that the export gives, maps every other answer, and a rerun changes nothing", async () => {
    const t = makeConvexTest();
    vi.stubEnv("IDENTITY_HUB_ISSUER", ISSUER);
    vi.stubEnv("IDENTITY_HUB_CLIENT_ID", "client-old");
    vi.stubEnv("IDENTITY_HUB_CLIENT_SECRET", "secret-old");
    const first = await insertOwner(t, "first");
    const second = await insertOwner(t, "second");
    const third = await insertOwner(t, "third");
    const copiedCloudflare = await insertCloudflare(t, first, "hub-cf-copied", {
      status: "invalid",
      checkedAt: 1,
      source: "refresh_attempt",
    });
    const expiredCloudflare = await insertCloudflare(t, second, "hub-cf-expired");
    const otherResource = await insertCloudflare(t, third, "hub-cf-other-resource");
    const copiedGitHub = await insertGitHub(t, first.userId, "hub-gh-copied");
    const busyGitHub = await insertGitHub(t, second.userId, "hub-gh-busy");
    const failedGitHub = await insertGitHub(t, third.userId, "hub-gh-unavailable");
    await sealTestCredentials(t);

    const answers = {
      "hub-cf-copied": () =>
        json({ refresh_token: "provider-cf", resource: CLOUDFLARE_RESOURCE }, 200),
      "hub-cf-other-resource": () =>
        json({ refresh_token: "provider-gh-elsewhere", resource: GITHUB_RESOURCE }, 200),
      "hub-gh-copied": () => json({ refresh_token: "provider-gh", resource: GITHUB_RESOURCE }, 200),
      "hub-gh-busy": () => json({ error: "refresh_in_progress" }, 409),
      "hub-gh-unavailable": () => json({ error: "temporarily_unavailable" }, 503),
    };
    const requests = stubExport(answers);
    const before = Date.now();
    const results = await t.action(internal.hubGrantCopy.copyLegacyGrants, {});
    const after = Date.now();

    expect(results).toEqual([
      { provider: "cloudflare", rowId: copiedCloudflare, status: "copied" },
      { provider: "cloudflare", rowId: expiredCloudflare, status: "not_found" },
      { provider: "cloudflare", rowId: otherResource, status: "failed" },
      { provider: "github", rowId: copiedGitHub, status: "copied" },
      { provider: "github", rowId: busyGitHub, status: "busy" },
      { provider: "github", rowId: failedGitHub, status: "failed" },
    ]);
    expect(requests).toEqual(
      Array.from({ length: 6 }, () => ({
        url: `${ISSUER}/migration/export`,
        clientId: "client-old",
        clientSecret: "secret-old",
      })),
    );

    const cloudflare = await readCloudflare(t, copiedCloudflare);
    await expect(
      t.action(
        async () =>
          await openSecret({
            sealed: cloudflare.auth.refreshCredential,
            aad: organizationProviderCredentialAad(
              cloudflare.organizationId,
              "cloudflare.auth.refreshCredential",
            ),
          }),
      ),
    ).resolves.toBe("provider-cf");
    expect(cloudflare.tokenHealth).toMatchObject({
      status: "valid",
      source: "refresh_attempt",
      expiresAt: cloudflare.auth.credentialExpiresAt,
    });
    const github = await readGitHub(t, copiedGitHub);
    await expect(
      t.action(
        async () =>
          await openSecret({
            sealed: github.refreshToken,
            aad: githubUserAuthorizationAad(github.userId, "refreshToken"),
          }),
      ),
    ).resolves.toBe("provider-gh");
    expect(github.refreshTokenExpiresAt).toBeGreaterThanOrEqual(before + NINETY_DAYS_MS);
    expect(github.refreshTokenExpiresAt).toBeLessThanOrEqual(after + NINETY_DAYS_MS);
    expect((await readGitHub(t, busyGitHub)).refreshTokenExpiresAt).toBe(1);

    // The frozen hub answers the same; a copied row now holds a token that it does not know, and
    // every row that was not copied still holds its hub token.
    stubExport(answers);
    const rerun = await t.action(internal.hubGrantCopy.copyLegacyGrants, {});
    expect(rerun.map(({ status }) => status)).toEqual([
      "not_found",
      "not_found",
      "failed",
      "not_found",
      "busy",
      "failed",
    ]);
    expect(await readCloudflare(t, copiedCloudflare)).toEqual(cloudflare);
    expect(await readGitHub(t, copiedGitHub)).toEqual(github);
  });

  it("writes a copy only over the hub token that the run read", async () => {
    const t = makeConvexTest();
    const owner = await insertOwner(t, "owner");
    const cloudflareRow = await insertCloudflare(t, owner, "hub-cf");
    const githubRow = await insertGitHub(t, owner.userId, "hub-gh");
    await sealTestCredentials(t);
    const cloudflare = await readCloudflare(t, cloudflareRow);
    const github = await readGitHub(t, githubRow);

    await expect(
      t.mutation(internal.hubGrantCopy.writeCloudflareGrant, {
        rowId: cloudflareRow,
        expected: testCredential("hub-cf-before-a-reconnect"),
        refreshCredential: testCredential("provider-cf"),
      }),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.hubGrantCopy.writeGitHubGrant, {
        rowId: githubRow,
        expected: testCredential("hub-gh-before-a-reconnect"),
        refreshToken: testCredential("provider-gh"),
      }),
    ).resolves.toBe(false);

    expect(await readCloudflare(t, cloudflareRow)).toEqual(cloudflare);
    expect(await readGitHub(t, githubRow)).toEqual(github);
  });
});
