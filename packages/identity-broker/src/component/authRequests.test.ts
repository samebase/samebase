/// <reference types="vite-plus/client" />
import { convexTest, type TestConvex } from "convex-test";
import { calculatePKCECodeChallenge } from "oauth4webapi";
import { describe, expect, test } from "vite-plus/test";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const now = 1_700_000_000_000;
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

/** What the token endpoint passes for client "cl", registered for client_secret_post. */
const cl = {
  clientId: "cl",
  clientSecretHash: "secret-hash",
  tokenEndpointAuthMethod: "client_secret_post",
} as const;

/** App "app" with its client "cl", as `registerClient` stores them. */
async function registered() {
  const t = convexTest(schema, modules);
  await t.mutation(api.apps.create, {
    appId: "app",
    name: "App",
    firstParty: true,
    createdAt: now,
  });
  await t.mutation(api.clients.create, {
    clientId: cl.clientId,
    appId: "app",
    secretHash: cl.clientSecretHash,
    tokenEndpointAuthMethod: cl.tokenEndpointAuthMethod,
    redirectUri: "https://app.test/cb",
    deploymentType: "preview",
    clientName: "App preview",
    softwareVersion: "v1",
    createdAt: now,
  });
  return t;
}

async function pendingRequest(requestId = "r1", given?: TestConvex<typeof schema>) {
  const t = given ?? (await registered());
  await t.mutation(api.authRequests.create, {
    requestId,
    appId: "app",
    clientId: "cl",
    redirectUri: "https://app.test/cb",
    scope: "openid",
    state: "s",
    codeChallenge: await calculatePKCECodeChallenge(verifier),
    freshLogin: false,
    txnCookieHash: "cookie-hash",
    createdAt: now,
    expiresAt: now + 600_000,
  });
  return t;
}

describe("upstream path", () => {
  test("pending, upstream, claimed, completed, exchanged", async () => {
    const t = await pendingRequest();
    const started = await t.mutation(api.authRequests.startUpstream, {
      requestId: "r1",
      connector: "github",
      upstreamStateHash: "sh",
      upstreamCodeVerifier: "v",
      now,
    });
    expect(started).toEqual({ ok: true, redirectUri: "https://app.test/cb", state: "s" });

    const claim = await t.mutation(api.authRequests.claimUpstream, {
      upstreamStateHash: "sh",
      connector: "github",
      txnCookieHashes: ["cookie-hash"],
      now,
    });
    expect(claim.status).toBe("claimed");
    // The claim is single use.
    expect(
      await t.mutation(api.authRequests.claimUpstream, {
        upstreamStateHash: "sh",
        connector: "github",
        txnCookieHashes: ["cookie-hash"],
        now,
      }),
    ).toEqual({ status: "missing" });
    // A claimed request cannot restart.
    const restart = await t.mutation(api.authRequests.startUpstream, {
      requestId: "r1",
      connector: "github",
      upstreamStateHash: "x",
      upstreamCodeVerifier: "v",
      now,
    });
    expect(restart).toMatchObject({ ok: false, error: "wrong_status" });

    const completed = await t.mutation(api.authRequests.complete, {
      requestId: "r1",
      identity: { connector: "github", upstreamId: "42", email: "a@b.co", emailVerified: true },
      authTime: now,
      codeHash: "ch",
      codeExpiresAt: now + 60_000,
      now,
    });
    expect(completed.ok).toBe(true);

    const wrongVerifier = await t.mutation(api.authRequests.exchangeCode, {
      codeHash: "ch",
      ...cl,
      codeVerifier: "x".repeat(43),
      now,
    });
    expect(wrongVerifier).toMatchObject({
      ok: false,
      description: expect.stringMatching(/code_verifier/),
    });
    const exchanged = await t.mutation(api.authRequests.exchangeCode, {
      codeHash: "ch",
      ...cl,
      redirectUri: "https://app.test/cb",
      codeVerifier: verifier,
      now,
    });
    expect(exchanged).toMatchObject({
      ok: true,
      appId: "app",
      identity: { upstreamId: "42" },
      authTime: now,
    });
    expect(await t.query(api.authRequests.get, { requestId: "r1" })).toBeNull();
    const replay = await t.mutation(api.authRequests.exchangeCode, {
      codeHash: "ch",
      ...cl,
      codeVerifier: verifier,
      now,
    });
    expect(replay).toMatchObject({ ok: false, description: expect.stringMatching(/already used/) });
  });

  /** A request completed through the upstream path, with code hash "ch" issued to client "cl". */
  async function completedCode() {
    const t = await pendingRequest();
    await t.mutation(api.authRequests.startUpstream, {
      requestId: "r1",
      connector: "g",
      upstreamStateHash: "sh",
      upstreamCodeVerifier: "v",
      now,
    });
    await t.mutation(api.authRequests.claimUpstream, {
      upstreamStateHash: "sh",
      connector: "g",
      txnCookieHashes: ["cookie-hash"],
      now,
    });
    await t.mutation(api.authRequests.complete, {
      requestId: "r1",
      identity: { connector: "g", upstreamId: "1" },
      authTime: now,
      codeHash: "ch",
      codeExpiresAt: now + 60_000,
      now,
    });
    const redeem = (credentials: {
      clientId: string;
      clientSecretHash: string;
      tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
    }) =>
      t.mutation(api.authRequests.exchangeCode, {
        ...credentials,
        codeHash: "ch",
        codeVerifier: verifier,
        now,
      });
    const codes = () => t.run(async (ctx) => await ctx.db.query("authorizationCodes").collect());
    return { t, redeem, codes };
  }

  const refused = {
    ok: false,
    error: "invalid_client",
    description: "Client authentication failed.",
  } as const;

  test("a client that fails authentication in the redemption leaves the code as it was", async () => {
    const { t, redeem, codes } = await completedCode();
    const unchanged = async () => {
      expect((await codes()).map((code) => [code.codeHash, code.usedAt])).toEqual([
        ["ch", undefined],
      ]);
      expect(await t.query(api.authRequests.get, { requestId: "r1" })).toMatchObject({
        status: "completed",
      });
    };
    for (const credentials of [
      { ...cl, clientSecretHash: "wrong-hash" },
      { ...cl, tokenEndpointAuthMethod: "client_secret_basic" as const },
      { ...cl, clientId: "cl_unknown" },
    ]) {
      expect(await redeem(credentials)).toEqual(refused);
      await unchanged();
    }
    // deleteApp deletes the app row first and the app's clients in later batches.
    await t.run(async (ctx) => {
      const app = await ctx.db
        .query("apps")
        .withIndex("by_app_id", (q) => q.eq("appId", "app"))
        .unique();
      if (app !== null) await ctx.db.delete("apps", app._id);
    });
    expect(await redeem(cl)).toEqual(refused);
    await unchanged();
  });

  test("a code redeems once, and a failed authentication does not revoke a used code", async () => {
    const { redeem, codes } = await completedCode();
    expect(await redeem(cl)).toMatchObject({ ok: true, appId: "app" });
    expect(await codes()).toMatchObject([{ codeHash: "ch", usedAt: now }]);
    expect(await redeem({ ...cl, clientSecretHash: "wrong-hash" })).toEqual(refused);
    expect(await codes()).toMatchObject([{ codeHash: "ch", usedAt: now }]);
    // The client's own replay revokes the code (RFC 9700 section 4.5.3).
    expect(await redeem(cl)).toMatchObject({
      ok: false,
      error: "invalid_grant",
      description: "The authorization code was already used.",
    });
    expect(await codes()).toEqual([]);
  });

  test("expiry at every step", async () => {
    const t = await pendingRequest();
    const late = now + 600_001;
    expect(
      await t.mutation(api.authRequests.startUpstream, {
        requestId: "r1",
        connector: "g",
        upstreamStateHash: "sh",
        upstreamCodeVerifier: "v",
        now: late,
      }),
    ).toMatchObject({ ok: false, error: "expired" });
    await t.mutation(api.authRequests.startUpstream, {
      requestId: "r1",
      connector: "g",
      upstreamStateHash: "sh",
      upstreamCodeVerifier: "v",
      now,
    });
    expect(
      await t.mutation(api.authRequests.claimUpstream, {
        upstreamStateHash: "sh",
        connector: "g",
        txnCookieHashes: ["cookie-hash"],
        now: late,
      }),
    ).toEqual({
      status: "expired",
      requestId: "r1",
      redirectUri: "https://app.test/cb",
      state: "s",
    });
    expect(await t.query(api.authRequests.get, { requestId: "r1" })).toBeNull();
  });

  test("another connector's callback cannot claim the request", async () => {
    const t = await pendingRequest();
    await t.mutation(api.authRequests.startUpstream, {
      requestId: "r1",
      connector: "google",
      upstreamStateHash: "sh",
      upstreamCodeVerifier: "v",
      upstreamNonce: "n",
      now,
    });
    expect(
      await t.mutation(api.authRequests.claimUpstream, {
        upstreamStateHash: "sh",
        connector: "github",
        txnCookieHashes: ["cookie-hash"],
        now,
      }),
    ).toEqual({ status: "missing" });
    expect(await t.query(api.authRequests.get, { requestId: "r1" })).toMatchObject({
      status: "upstream",
    });
    expect(
      await t.mutation(api.authRequests.claimUpstream, {
        upstreamStateHash: "sh",
        connector: "google",
        txnCookieHashes: ["cookie-hash"],
        now,
      }),
    ).toMatchObject({ status: "claimed", connector: "google", upstreamNonce: "n" });
  });

  test("a completed request outlives its code, so cleanup keeps it until the code is gone", async () => {
    const t = await pendingRequest();
    // The request expires at now + 600_000; the user finishes just before that.
    const late = now + 599_000;
    await t.mutation(api.authRequests.startUpstream, {
      requestId: "r1",
      connector: "g",
      upstreamStateHash: "sh",
      upstreamCodeVerifier: "v",
      now: late,
    });
    await t.mutation(api.authRequests.claimUpstream, {
      upstreamStateHash: "sh",
      connector: "g",
      txnCookieHashes: ["cookie-hash"],
      now: late,
    });
    await t.mutation(api.authRequests.complete, {
      requestId: "r1",
      identity: { connector: "g", upstreamId: "1" },
      authTime: late,
      codeHash: "ch",
      codeExpiresAt: late + 60_000,
      now: late,
    });
    const cleanup = (at: number) =>
      t.mutation(api.lifecycle.cleanup, {
        now: at,
        previewClientMaxAgeMs: 30 * 86_400_000,
        signInRetentionMs: 90 * 86_400_000,
      });
    expect(await cleanup(late + 59_000)).toMatchObject({ authRequests: 0 });
    expect(
      await t.mutation(api.authRequests.exchangeCode, {
        codeHash: "ch",
        ...cl,
        codeVerifier: verifier,
        now: late + 59_000,
      }),
    ).toMatchObject({ ok: true });
  });

  test("an expired code is refused", async () => {
    const t = await pendingRequest();
    await t.mutation(api.authRequests.startUpstream, {
      requestId: "r1",
      connector: "g",
      upstreamStateHash: "sh",
      upstreamCodeVerifier: "v",
      now,
    });
    await t.mutation(api.authRequests.claimUpstream, {
      upstreamStateHash: "sh",
      connector: "g",
      txnCookieHashes: ["cookie-hash"],
      now,
    });
    await t.mutation(api.authRequests.complete, {
      requestId: "r1",
      identity: { connector: "g", upstreamId: "1" },
      authTime: now,
      codeHash: "ch",
      codeExpiresAt: now + 60_000,
      now,
    });
    expect(
      await t.mutation(api.authRequests.exchangeCode, {
        codeHash: "ch",
        ...cl,
        codeVerifier: verifier,
        now: now + 60_001,
      }),
    ).toMatchObject({ ok: false, description: expect.stringMatching(/expired/) });
  });
});
