/// <reference types="vite-plus/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest, type TestConvex } from "convex-test";
import { calculatePKCECodeChallenge } from "oauth4webapi";
import { describe, expect, test } from "vite-plus/test";
import { api } from "./_generated/api.js";
import { testClientRecord } from "../client/registeredBy.test.helper.js";
import { LEASE_MS } from "./registration.js";
import schema from "./schema.js";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const now = 1_700_000_000_000;
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
/** The enrollment of client "cl", and the set of every request of it. */
const CONNECTORS = ["g", "github", "google"];

/** What the token endpoint passes for client "cl", registered for client_secret_post. */
const cl = {
  clientId: "cl",
  clientSecretHash: "secret-hash",
  tokenEndpointAuthMethod: "client_secret_post",
} as const;

/** The host's decision for "cl" when its policy allows everything it enrolled in. */
const policy = {
  ownerId: "65",
  paused: false,
  connectors: CONNECTORS,
  resources: [],
  configured: CONNECTORS,
};

/** App "app" of the repository `gh-1` of owner 65, with its preview client "cl", with or without a removal date. */
async function registered(expires = false) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("tenants", { tenantId: "gh-1", ownerId: "65" });
    await ctx.db.insert("apps", {
      appId: "app",
      name: "App",
      tenantId: "gh-1",
      createdAt: now,
    });
    await ctx.db.insert("clients", {
      clientId: cl.clientId,
      appId: "app",
      secretHash: cl.clientSecretHash,
      registrationTokenHash: "token-hash",
      tokenEndpointAuthMethod: cl.tokenEndpointAuthMethod,
      redirectUri: "https://app.test/cb",
      deploymentType: "preview",
      clientName: "App preview",
      softwareVersion: "v1",
      createdAt: now,
      renewedAt: now,
      ...testClientRecord,
      connectors: CONNECTORS,
      ...(expires ? { removeAt: now + LEASE_MS } : {}),
    });
  });
  return t;
}

async function pendingRequest(
  requestId = "r1",
  given?: TestConvex<typeof schema>,
  connectors = CONNECTORS,
) {
  const t = given ?? (await registered());
  const created = await t.mutation(api.authRequests.create, {
    tenantId: "gh-1",
    requestId,
    appId: "app",
    clientId: "cl",
    redirectUri: "https://app.test/cb",
    scope: "openid",
    state: "s",
    codeChallenge: await calculatePKCECodeChallenge(verifier),
    connectors,
    policy,
    freshLogin: false,
    txnCookieHash: "cookie-hash",
    createdAt: now,
    expiresAt: now + 600_000,
  });
  expect(created).toEqual({ ok: true, connectors });
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
      policy,
      now,
    });
    expect(started).toEqual({ ok: true, redirectUri: "https://app.test/cb", state: "s" });

    const claim = await t.mutation(api.authRequests.claimUpstream, {
      upstreamStateHash: "sh",
      connector: "github",
      txnCookieHashes: ["cookie-hash"],
      policy,
      now,
    });
    expect(claim.status).toBe("claimed");
    // The claim is single use.
    expect(
      await t.mutation(api.authRequests.claimUpstream, {
        upstreamStateHash: "sh",
        connector: "github",
        txnCookieHashes: ["cookie-hash"],
        policy,
        now,
      }),
    ).toEqual({ status: "missing" });
    // A claimed request cannot restart.
    const restart = await t.mutation(api.authRequests.startUpstream, {
      requestId: "r1",
      connector: "github",
      upstreamStateHash: "x",
      upstreamCodeVerifier: "v",
      policy,
      now,
    });
    expect(restart).toMatchObject({ ok: false, error: "wrong_status" });

    const completed = await t.mutation(api.authRequests.complete, {
      requestId: "r1",
      identity: { connector: "github", upstreamId: "42", email: "a@b.co", emailVerified: true },
      authTime: now,
      codeHash: "ch",
      codeExpiresAt: now + 60_000,
      policy,
      now,
    });
    expect(completed.ok).toBe(true);

    const wrongVerifier = await t.mutation(api.authRequests.exchangeCode, {
      refreshTokenHash: "unused-for-identity",
      codeHash: "ch",
      ...cl,
      codeVerifier: "x".repeat(43),
      policy,
      now,
    });
    expect(wrongVerifier).toMatchObject({
      ok: false,
      description: expect.stringMatching(/code_verifier/),
    });
    const exchanged = await t.mutation(api.authRequests.exchangeCode, {
      refreshTokenHash: "unused-for-identity",
      codeHash: "ch",
      ...cl,
      redirectUri: "https://app.test/cb",
      codeVerifier: verifier,
      policy,
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
      refreshTokenHash: "unused-for-identity",
      codeHash: "ch",
      ...cl,
      codeVerifier: verifier,
      policy,
      now,
    });
    expect(replay).toMatchObject({ ok: false, description: expect.stringMatching(/already used/) });
  });

  /** A request completed through the upstream path, with code hash "ch" issued to client "cl". */
  async function completedCode(given?: TestConvex<typeof schema>) {
    const t = await pendingRequest("r1", given);
    await t.mutation(api.authRequests.startUpstream, {
      requestId: "r1",
      connector: "g",
      upstreamStateHash: "sh",
      upstreamCodeVerifier: "v",
      policy,
      now,
    });
    await t.mutation(api.authRequests.claimUpstream, {
      upstreamStateHash: "sh",
      connector: "g",
      txnCookieHashes: ["cookie-hash"],
      policy,
      now,
    });
    await t.mutation(api.authRequests.complete, {
      requestId: "r1",
      identity: { connector: "g", upstreamId: "1" },
      authTime: now,
      codeHash: "ch",
      codeExpiresAt: now + 60_000,
      policy,
      now,
    });
    const redeem = (
      credentials: {
        clientId: string;
        clientSecretHash: string;
        tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
      },
      decision = policy,
    ) =>
      t.mutation(api.authRequests.exchangeCode, {
        refreshTokenHash: "unused-for-identity",
        ...credentials,
        codeHash: "ch",
        codeVerifier: verifier,
        policy: decision,
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

  test("the policy's pause and a stale owner refuse the redemption and leave the code", async () => {
    const { t, redeem, codes } = await completedCode();
    expect(await redeem(cl, { ...policy, paused: true })).toEqual({
      ok: false,
      error: "invalid_client",
      description: "This client is paused.",
    });
    // The tenant's owner is no longer the one the policy decided on.
    expect(await redeem(cl, { ...policy, ownerId: "66" })).toEqual(refused);
    expect((await codes()).map((code) => code.usedAt)).toEqual([undefined]);
    expect(await t.query(api.authRequests.get, { requestId: "r1" })).toMatchObject({
      status: "completed",
    });
    expect(await redeem(cl)).toMatchObject({ ok: true });
  });

  test("a connector that the policy withdrew after the callback refuses the redemption", async () => {
    const { redeem } = await completedCode();
    expect(await redeem(cl, { ...policy, connectors: ["github", "google"] })).toEqual({
      ok: false,
      error: "invalid_grant",
      description: "This client cannot sign in through that connector.",
    });
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

  test("a sign-in moves the removal date of a client that expires, and gives none to another", async () => {
    for (const expires of [true, false]) {
      const { t, redeem } = await completedCode(await registered(expires));
      // The client was created at `now` too, so an older date shows that the sign-in moved it.
      await t.run(async (ctx) => {
        const client = await ctx.db
          .query("clients")
          .withIndex("by_client_id", (q) => q.eq("clientId", cl.clientId))
          .unique();
        if (client !== null && expires) await ctx.db.patch("clients", client._id, { removeAt: 1 });
      });
      expect(await redeem(cl)).toMatchObject({ ok: true });
      const client = await t.query(api.clients.get, { clientId: cl.clientId });
      expect(client?.lastSignInAt).toBe(now);
      expect(client?.removeAt).toBe(expires ? now + LEASE_MS : undefined);
    }
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
        policy,
        now: late,
      }),
    ).toMatchObject({ ok: false, error: "expired" });
    await t.mutation(api.authRequests.startUpstream, {
      requestId: "r1",
      connector: "g",
      upstreamStateHash: "sh",
      upstreamCodeVerifier: "v",
      policy,
      now,
    });
    expect(
      await t.mutation(api.authRequests.claimUpstream, {
        upstreamStateHash: "sh",
        connector: "g",
        txnCookieHashes: ["cookie-hash"],
        policy,
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
      policy,
      now,
    });
    expect(
      await t.mutation(api.authRequests.claimUpstream, {
        upstreamStateHash: "sh",
        connector: "github",
        txnCookieHashes: ["cookie-hash"],
        policy,
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
        policy,
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
      policy,
      now: late,
    });
    await t.mutation(api.authRequests.claimUpstream, {
      upstreamStateHash: "sh",
      connector: "g",
      txnCookieHashes: ["cookie-hash"],
      policy,
      now: late,
    });
    await t.mutation(api.authRequests.complete, {
      requestId: "r1",
      identity: { connector: "g", upstreamId: "1" },
      authTime: late,
      codeHash: "ch",
      codeExpiresAt: late + 60_000,
      policy,
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
        refreshTokenHash: "unused-for-identity",
        codeHash: "ch",
        ...cl,
        codeVerifier: verifier,
        policy,
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
      policy,
      now,
    });
    await t.mutation(api.authRequests.claimUpstream, {
      upstreamStateHash: "sh",
      connector: "g",
      txnCookieHashes: ["cookie-hash"],
      policy,
      now,
    });
    await t.mutation(api.authRequests.complete, {
      requestId: "r1",
      identity: { connector: "g", upstreamId: "1" },
      authTime: now,
      codeHash: "ch",
      codeExpiresAt: now + 60_000,
      policy,
      now,
    });
    expect(
      await t.mutation(api.authRequests.exchangeCode, {
        refreshTokenHash: "unused-for-identity",
        codeHash: "ch",
        ...cl,
        codeVerifier: verifier,
        policy,
        now: now + 60_001,
      }),
    ).toMatchObject({ ok: false, description: expect.stringMatching(/expired/) });
  });
});

describe("what a request may use", () => {
  test("a connector outside the request's set, the enrollment, or the policy does not start", async () => {
    const t = await pendingRequest("r1", undefined, ["g", "github"]);
    const start = (connector: string, decision = policy) =>
      t.mutation(api.authRequests.startUpstream, {
        requestId: "r1",
        connector,
        upstreamStateHash: `sh-${connector}`,
        upstreamCodeVerifier: "v",
        policy: decision,
        now,
      });
    const refused = {
      ok: false,
      error: "refused",
      redirectUri: "https://app.test/cb",
      state: "s",
    };
    // Enrolled and allowed, but not in the request's set.
    expect(await start("google")).toEqual(refused);
    // In the set, but withdrawn by the policy since the request was stored.
    expect(await start("github", { ...policy, connectors: ["g"] })).toEqual(refused);
    // In the set and allowed, but the policy decided on another owner, or paused the client.
    expect(await start("github", { ...policy, ownerId: "66" })).toEqual(refused);
    expect(await start("github", { ...policy, paused: true })).toEqual(refused);
    expect(await t.query(api.authRequests.get, { requestId: "r1" })).toMatchObject({
      status: "pending",
    });
    expect(await start("github")).toMatchObject({ ok: true });
  });

  test("a callback whose connector the policy withdrew, or that is paused, is refused and deleted", async () => {
    for (const decision of [
      { ...policy, connectors: ["g", "google"] },
      { ...policy, paused: true },
      { ...policy, ownerId: "66" },
    ]) {
      const t = await pendingRequest();
      await t.mutation(api.authRequests.startUpstream, {
        requestId: "r1",
        connector: "github",
        upstreamStateHash: "sh",
        upstreamCodeVerifier: "v",
        policy,
        now,
      });
      expect(
        await t.mutation(api.authRequests.claimUpstream, {
          upstreamStateHash: "sh",
          connector: "github",
          txnCookieHashes: ["cookie-hash"],
          policy: decision,
          now,
        }),
      ).toEqual({
        status: "refused",
        requestId: "r1",
        redirectUri: "https://app.test/cb",
        state: "s",
      });
      expect(await t.query(api.authRequests.get, { requestId: "r1" })).toBeNull();
    }
  });

  test("a block, a changed owner, a pause, or a withdrawn connector that landed while the provider answered refuses the completion", async () => {
    const block = async (t: TestConvex<typeof schema>) => {
      await t.mutation(api.moderation.setBlock, {
        action: "block",
        kind: "owner",
        githubId: "65",
        reason: "Phishing page",
        adminEmail: "admin@example.com",
      });
      return policy;
    };
    for (const landed of [
      block,
      async () => ({ ...policy, ownerId: "66" }),
      async () => ({ ...policy, paused: true }),
      async () => ({ ...policy, connectors: ["g", "google"] }),
    ]) {
      const t = await pendingRequest();
      await t.mutation(api.authRequests.startUpstream, {
        requestId: "r1",
        connector: "github",
        upstreamStateHash: "sh",
        upstreamCodeVerifier: "v",
        policy,
        now,
      });
      await t.mutation(api.authRequests.claimUpstream, {
        upstreamStateHash: "sh",
        connector: "github",
        txnCookieHashes: ["cookie-hash"],
        policy,
        now,
      });
      const decision = await landed(t);
      expect(
        await t.mutation(api.authRequests.complete, {
          requestId: "r1",
          identity: { connector: "github", upstreamId: "42" },
          authTime: now,
          codeHash: "ch",
          codeExpiresAt: now + 60_000,
          policy: decision,
          now,
        }),
      ).toEqual({ ok: false, error: "refused", redirectUri: "https://app.test/cb", state: "s" });
      expect(await t.query(api.authRequests.get, { requestId: "r1" })).toBeNull();
      expect(
        await t.run(async (ctx) => await ctx.db.query("authorizationCodes").collect()),
      ).toEqual([]);
    }
  });

  test("a request of a blocked tenant is not stored, and the budget is per tenant", async () => {
    const t = await registered();
    await t.mutation(api.moderation.setBlock, {
      action: "block",
      kind: "repository",
      githubId: "1",
      reason: "Phishing page",
      adminEmail: "admin@example.com",
    });
    expect(
      await t.mutation(api.authRequests.create, {
        tenantId: "gh-1",
        requestId: "r1",
        appId: "app",
        clientId: "cl",
        redirectUri: "https://app.test/cb",
        scope: "openid",
        codeChallenge: "c",
        connectors: CONNECTORS,
        policy,
        freshLogin: false,
        txnCookieHash: "cookie-hash",
        createdAt: now,
        expiresAt: now + 600_000,
      }),
    ).toEqual({ ok: false, error: "suspended" });
    expect(await t.query(api.authRequests.get, { requestId: "r1" })).toBeNull();
  });
});
