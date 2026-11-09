/// <reference types="vite-plus/client" />
import { convexTest, type TestConvex } from "convex-test";
import { calculatePKCECodeChallenge } from "oauth4webapi";
import { expect, test } from "vite-plus/test";
import { api } from "./_generated/api.js";
import { testClientRecord } from "../client/registeredBy.test.helper.js";
import { LEASE_MS, MAX_CLIENTS_PER_APP } from "./registration.js";
import schema from "./schema.js";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const RESOURCE = "https://api.cloudflare.com/client/v4/";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const auth = {
  clientId: "client",
  clientSecretHash: "client-secret-hash",
  tokenEndpointAuthMethod: "client_secret_post",
} as const;
/** The host's decision for the client: the resource of the grant, and nothing stops it. */
const policy = {
  ownerId: "7",
  paused: false,
  connectors: ["fake"],
  resources: [RESOURCE],
  configured: ["fake"],
};
const refresh = {
  ...auth,
  tokenHash: "broker-refresh-hash",
  policy,
  now: NOW,
};

type Test = Awaited<ReturnType<typeof grant>>["t"];

async function setBlock(t: Test, kind: "repository" | "owner", githubId: string, on: boolean) {
  await t.mutation(api.moderation.setBlock, {
    action: on ? "block" : "unblock",
    kind,
    githubId,
    reason: "Phishing page",
    adminEmail: "admin@example.com",
  });
}

/** A resource authorization of the client, up to and including the provider's answer. */
async function claimedAuthorization(
  t: TestConvex<typeof schema>,
  args: { requestId: string; stateHash: string },
) {
  await t.mutation(api.resourceRequests.create, {
    requestId: args.requestId,
    clientId: auth.clientId,
    redirectUri: "https://preview.example/cb",
    resource: RESOURCE,
    codeChallenge: await calculatePKCECodeChallenge(VERIFIER),
    txnCookieHash: "browser",
    upstreamStateHash: args.stateHash,
    upstreamCodeVerifier: "upstream-verifier",
    expiresAt: NOW + 600_000,
    policy,
  });
  await t.mutation(api.resourceRequests.claim, {
    stateHash: args.stateHash,
    resource: RESOURCE,
    cookieHashes: ["browser"],
    now: NOW,
  });
}

const upstreamTokens = {
  accessToken: "upstream-access",
  scope: "workers-scripts.read",
  refreshToken: "upstream-refresh",
  expiresAt: NOW + 3_600_000,
};

/** A completed resource authorization of the client, whose code `codeHash` waits for the exchange. */
async function completedAuthorization(
  t: TestConvex<typeof schema>,
  args: { requestId: string; stateHash: string; codeHash: string },
) {
  await claimedAuthorization(t, args);
  expect(
    await t.mutation(api.resourceRequests.complete, {
      requestId: args.requestId,
      tokens: upstreamTokens,
      codeHash: args.codeHash,
      codeExpiresAt: NOW + 60_000,
      policy,
      now: NOW,
    }),
  ).toBe("completed");
}

async function grant(expires = false) {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("tenants", { tenantId: "gh-1", ownerId: "7" });
    await ctx.db.insert("apps", {
      appId: "app",
      name: "App",
      tenantId: "gh-1",
      createdAt: NOW,
    });
    // A day before the authorization, so a removal date that the authorization moves differs.
    await ctx.db.insert("clients", {
      clientId: auth.clientId,
      appId: "app",
      secretHash: auth.clientSecretHash,
      registrationTokenHash: "token-hash",
      tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
      redirectUris: ["https://preview.example/cb"],
      deploymentType: "preview",
      clientName: "preview",
      softwareVersion: "test",
      createdAt: NOW - DAY,
      renewedAt: NOW - DAY,
      ...testClientRecord,
      ...(expires ? { removeAt: NOW - DAY + LEASE_MS } : {}),
    });
  });
  await completedAuthorization(t, {
    requestId: "request",
    stateHash: "upstream-state",
    codeHash: "code",
  });
  const exchange = {
    ...auth,
    codeHash: "code",
    redirectUri: "https://preview.example/cb",
    codeVerifier: VERIFIER,
    refreshTokenHash: refresh.tokenHash,
    policy,
    now: NOW,
  };
  expect(await t.mutation(api.authRequests.exchangeCode, exchange)).toMatchObject({
    ok: true,
    kind: "resource",
    refresh: true,
  });
  return { t, exchange };
}

test("a resource authorization and a provider refresh move the removal date of a client that expires", async () => {
  for (const expires of [true, false]) {
    const { t } = await grant(expires);
    const client = async () => await t.query(api.clients.get, { clientId: auth.clientId });
    expect(await client()).toMatchObject({ lastSignInAt: NOW });
    expect((await client())?.removeAt).toBe(expires ? NOW + LEASE_MS : undefined);

    expect(
      await t.mutation(api.resourceRequests.claimRefresh, { ...refresh, now: NOW + DAY }),
    ).toMatchObject({ ok: true });
    expect(await client()).toMatchObject({ lastSignInAt: NOW + DAY });
    expect((await client())?.removeAt).toBe(expires ? NOW + DAY + LEASE_MS : undefined);
  }
});

test("only one upstream refresh starts, and a stale attempt can be claimed again", async () => {
  const { t } = await grant();
  const claims = await Promise.all([
    t.mutation(api.resourceRequests.claimRefresh, refresh),
    t.mutation(api.resourceRequests.claimRefresh, refresh),
  ]);
  expect(claims.filter((claim) => claim.ok)).toHaveLength(1);
  expect(claims.find((claim) => !claim.ok)).toMatchObject({ error: "temporarily_unavailable" });
  expect(
    await t.mutation(api.resourceRequests.claimRefresh, { ...refresh, now: NOW + 60_001 }),
  ).toMatchObject({ ok: true, upstreamRefreshToken: "upstream-refresh" });
});

test("refresh binding rejects other clients and resources without changing the grant", async () => {
  const { t } = await grant();
  await t.run(async (ctx) => {
    await ctx.db.insert("clients", {
      clientId: "other-client",
      appId: "app",
      secretHash: auth.clientSecretHash,
      registrationTokenHash: "other-token-hash",
      tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
      redirectUris: ["https://other.example/cb"],
      deploymentType: "preview",
      clientName: "other",
      softwareVersion: "test",
      createdAt: NOW,
      renewedAt: NOW,
      ...testClientRecord,
    });
  });
  expect(
    await t.mutation(api.resourceRequests.claimRefresh, { ...refresh, clientId: "other-client" }),
  ).toMatchObject({ error: "invalid_grant" });
  expect(
    await t.mutation(api.resourceRequests.claimRefresh, {
      ...refresh,
      resource: "https://api.convex.dev",
    }),
  ).toMatchObject({ error: "invalid_target" });
  expect(await t.mutation(api.resourceRequests.claimRefresh, refresh)).toMatchObject({
    ok: true,
    upstreamRefreshToken: "upstream-refresh",
  });
});

test("a client that the cap evicts loses its refresh grant", async () => {
  const { t } = await grant();
  // The grant's client was renewed a day ago, so it is the oldest of the full app.
  await t.run(async (ctx) => {
    for (let index = 1; index < MAX_CLIENTS_PER_APP; index += 1) {
      await ctx.db.insert("clients", {
        clientId: `client-${index}`,
        appId: "app",
        secretHash: "other-secret-hash",
        registrationTokenHash: `token-hash-${index}`,
        tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
        redirectUris: ["https://preview.example/cb"],
        deploymentType: "preview",
        clientName: `pr-${index}`,
        softwareVersion: "test",
        createdAt: NOW,
        renewedAt: NOW,
        ...testClientRecord,
      });
    }
  });

  expect(
    await t.mutation(api.registration.register, {
      tenantId: "gh-1",
      appId: "app",
      deploymentType: "preview",
      clientId: "newest",
      secretHash: "newest-secret-hash",
      registrationTokenHash: "newest-token-hash",
      tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
      redirectUris: ["https://preview.example/cb"],
      clientName: "pr-30",
      softwareVersion: "test",
      ...testClientRecord,
      now: NOW,
    }),
  ).toEqual({ ok: true });

  const left = await t.run(async (ctx) => ({
    client: await ctx.db
      .query("clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", auth.clientId))
      .unique(),
    grants: await ctx.db
      .query("refreshGrants")
      .withIndex("by_client_id", (q) => q.eq("clientId", auth.clientId))
      .collect(),
  }));
  expect(left).toEqual({ client: null, grants: [] });
  expect(await t.mutation(api.resourceRequests.claimRefresh, refresh)).toMatchObject({
    ok: false,
  });
});

test("replaying a resource code revokes its broker refresh grant", async () => {
  const { t, exchange } = await grant();
  expect(await t.mutation(api.authRequests.exchangeCode, exchange)).toMatchObject({
    error: "invalid_grant",
  });
  expect(await t.mutation(api.resourceRequests.claimRefresh, refresh)).toMatchObject({
    error: "invalid_grant",
  });
});

test("a failed attempt frees the grant, and a provider rejection deletes it", async () => {
  const { t } = await grant();
  const first = await t.mutation(api.resourceRequests.claimRefresh, refresh);
  if (!first.ok) throw new Error("Expected a claim");
  await t.mutation(api.resourceRequests.failRefresh, {
    grantId: first.grantId,
    attempt: first.attempt,
    rejected: false,
  });
  const second = await t.mutation(api.resourceRequests.claimRefresh, refresh);
  if (!second.ok) throw new Error("Expected a claim");
  await t.mutation(api.resourceRequests.failRefresh, {
    grantId: second.grantId,
    attempt: second.attempt,
    rejected: true,
  });
  expect(await t.mutation(api.resourceRequests.claimRefresh, refresh)).toMatchObject({
    error: "invalid_grant",
  });
});

test("a deleted app stops refresh before the batches remove its client rows", async () => {
  const { t } = await grant();
  await t.run(async (ctx) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", "app"))
      .unique();
    if (app === null) throw new Error("Fixture app missing");
    await ctx.db.delete("apps", app._id);
  });
  expect(await t.mutation(api.resourceRequests.claimRefresh, refresh)).toMatchObject({
    error: "invalid_client",
  });
});

test("a blocked repository or owner stops refresh, and an unblock restores it", async () => {
  const { t } = await grant();
  await setBlock(t, "repository", "1", true);
  expect(await t.mutation(api.resourceRequests.claimRefresh, refresh)).toMatchObject({
    error: "invalid_client",
  });
  // The unblock restores refresh; the attempt is then freed for the next claim.
  await setBlock(t, "repository", "1", false);
  const restored = await t.mutation(api.resourceRequests.claimRefresh, refresh);
  if (!restored.ok) throw new Error("Expected a claim after the unblock");
  await t.mutation(api.resourceRequests.failRefresh, {
    grantId: restored.grantId,
    attempt: restored.attempt,
    rejected: false,
  });

  await setBlock(t, "owner", "7", true);
  expect(await t.mutation(api.resourceRequests.claimRefresh, refresh)).toMatchObject({
    error: "invalid_client",
  });
  await setBlock(t, "owner", "7", false);
  expect(await t.mutation(api.resourceRequests.claimRefresh, refresh)).toMatchObject({ ok: true });
});

test("a blocked client can still revoke its own token", async () => {
  const { t } = await grant();
  await t.run(async (ctx) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", "app"))
      .unique();
    if (app === null) throw new Error("Fixture app missing");
    await ctx.db.patch("apps", app._id, { tenantId: "gh-1" });
  });
  await setBlock(t, "repository", "1", true);
  expect(
    await t.mutation(api.resourceRequests.revoke, { ...auth, tokenHash: refresh.tokenHash }),
  ).toBe(true);
  await setBlock(t, "repository", "1", false);
  expect(await t.mutation(api.resourceRequests.claimRefresh, refresh)).toMatchObject({
    error: "invalid_grant",
  });
});

test("the policy's resources gate the authorization, the code, the admission, and the release", async () => {
  const { t, exchange } = await grant();
  const withdrawn = { ...policy, resources: [] };
  // A new authorization of a withdrawn resource writes nothing.
  expect(
    await t.mutation(api.resourceRequests.create, {
      requestId: "later",
      clientId: auth.clientId,
      redirectUri: "https://preview.example/cb",
      resource: RESOURCE,
      codeChallenge: await calculatePKCECodeChallenge(VERIFIER),
      txnCookieHash: "browser",
      upstreamStateHash: "later-state",
      upstreamCodeVerifier: "upstream-verifier",
      expiresAt: NOW + 600_000,
      policy: withdrawn,
    }),
  ).toBe(false);
  expect(await t.run(async (ctx) => await ctx.db.query("resourceRequests").collect())).toEqual([]);
  // The admission: before the provider is called.
  expect(
    await t.mutation(api.resourceRequests.claimRefresh, { ...refresh, policy: withdrawn }),
  ).toMatchObject({ ok: false, error: "invalid_target" });
  expect(
    await t.mutation(api.resourceRequests.claimRefresh, {
      ...refresh,
      policy: { ...policy, paused: true },
    }),
  ).toMatchObject({ ok: false, error: "invalid_client" });
  expect(
    await t.mutation(api.resourceRequests.claimRefresh, {
      ...refresh,
      policy: { ...policy, ownerId: "8" },
    }),
  ).toMatchObject({ ok: false, error: "invalid_client" });
  // The release: the rotation is saved, the token is kept from the caller.
  const claim = await t.mutation(api.resourceRequests.claimRefresh, refresh);
  if (!claim.ok) throw new Error("Expected a claim");
  const tokens = { accessToken: "new-access", scope: "", refreshToken: "rotated" };
  expect(
    await t.mutation(api.resourceRequests.finishRefresh, {
      grantId: claim.grantId,
      attempt: claim.attempt,
      tokens,
      policy: withdrawn,
      now: NOW + 1,
    }),
  ).toBe("refused");
  const grantRow = await t.run(async (ctx) => await ctx.db.get("refreshGrants", claim.grantId));
  expect(grantRow?.upstreamRefreshToken).toBe("rotated");
  expect(grantRow?.refreshStartedAt).toBeUndefined();
  // A policy that failed at the release refuses too, and the next claim works again.
  const again = await t.mutation(api.resourceRequests.claimRefresh, { ...refresh, now: NOW + 2 });
  if (!again.ok) throw new Error("Expected a claim");
  expect(
    await t.mutation(api.resourceRequests.finishRefresh, {
      grantId: again.grantId,
      attempt: again.attempt,
      tokens: { ...tokens, refreshToken: "rotated-again" },
      policy: null,
      now: NOW + 3,
    }),
  ).toBe("refused");
  // A release whose owner is no longer the tenant's refuses too, and saves the rotation.
  const third = await t.mutation(api.resourceRequests.claimRefresh, { ...refresh, now: NOW + 4 });
  if (!third.ok) throw new Error("Expected a claim");
  expect(third).toMatchObject({ upstreamRefreshToken: "rotated-again" });
  expect(
    await t.mutation(api.resourceRequests.finishRefresh, {
      grantId: third.grantId,
      attempt: third.attempt,
      tokens: { ...tokens, refreshToken: "rotated-thrice" },
      policy: { ...policy, ownerId: "8" },
      now: NOW + 5,
    }),
  ).toBe("refused");
  expect(
    (await t.run(async (ctx) => await ctx.db.get("refreshGrants", third.grantId)))
      ?.upstreamRefreshToken,
  ).toBe("rotated-thrice");
  expect(
    await t.mutation(api.resourceRequests.claimRefresh, { ...refresh, now: NOW + 6 }),
  ).toMatchObject({ ok: true, upstreamRefreshToken: "rotated-thrice" });
  // The unused code of a completed authorization is refused once the resource is withdrawn.
  await completedAuthorization(t, {
    requestId: "second",
    stateHash: "second-state",
    codeHash: "code-2",
  });
  expect(
    await t.mutation(api.authRequests.exchangeCode, {
      ...exchange,
      codeHash: "code-2",
      refreshTokenHash: "second-refresh-hash",
      policy: withdrawn,
    }),
  ).toMatchObject({ ok: false, error: "invalid_target" });
});

test("a withdrawn resource, a pause, a changed owner, or a block that landed while the provider answered refuses the completion", async () => {
  const block = async (t: TestConvex<typeof schema>) => {
    await setBlock(t, "owner", "7", true);
    return policy;
  };
  for (const landed of [
    async () => ({ ...policy, resources: [] }),
    async () => ({ ...policy, paused: true }),
    async () => ({ ...policy, ownerId: "8" }),
    block,
  ]) {
    const { t } = await grant();
    await claimedAuthorization(t, { requestId: "second", stateHash: "second-state" });
    const decision = await landed(t);
    expect(
      await t.mutation(api.resourceRequests.complete, {
        requestId: "second",
        tokens: upstreamTokens,
        codeHash: "code-2",
        codeExpiresAt: NOW + 60_000,
        policy: decision,
        now: NOW,
      }),
    ).toBe("refused");
    const rows = await t.run(async (ctx) => ({
      requests: await ctx.db.query("resourceRequests").collect(),
      codes: (await ctx.db.query("authorizationCodes").collect()).map((code) => code.codeHash),
    }));
    expect(rows).toEqual({ requests: [], codes: ["code"] });
  }
});

test("the bound browser of an expired resource request learns where to go back", async () => {
  const { t } = await grant();
  await t.mutation(api.resourceRequests.create, {
    requestId: "late",
    clientId: auth.clientId,
    redirectUri: "https://preview.example/cb",
    resource: RESOURCE,
    state: "late-state",
    codeChallenge: await calculatePKCECodeChallenge(VERIFIER),
    txnCookieHash: "browser",
    upstreamStateHash: "late-upstream",
    upstreamCodeVerifier: "upstream-verifier",
    expiresAt: NOW + 600_000,
    policy,
  });
  const claim = (cookieHashes: string[]) =>
    t.mutation(api.resourceRequests.claim, {
      stateHash: "late-upstream",
      resource: RESOURCE,
      cookieHashes,
      now: NOW + 600_001,
    });
  // Another browser learns nothing, and the request waits for its own.
  expect(await claim(["other"])).toEqual({ status: "unbound" });
  expect(await claim(["browser"])).toEqual({
    status: "expired",
    requestId: "late",
    redirectUri: "https://preview.example/cb",
    state: "late-state",
  });
  expect(await claim(["browser"])).toEqual({ status: "missing" });
});

test("cleanup removes expired resource requests and idle refresh secrets", async () => {
  const { t } = await grant();
  await t.mutation(api.resourceRequests.create, {
    requestId: "abandoned",
    clientId: auth.clientId,
    redirectUri: "https://preview.example/cb",
    resource: RESOURCE,
    codeChallenge: await calculatePKCECodeChallenge(VERIFIER),
    txnCookieHash: "browser",
    upstreamStateHash: "abandoned-state",
    upstreamCodeVerifier: "upstream-verifier",
    expiresAt: NOW + 600_000,
    policy,
  });
  expect(
    await t.mutation(api.lifecycle.cleanup, {
      now: NOW + 91 * 24 * 60 * 60 * 1000,
      signInRetentionMs: 90 * 24 * 60 * 60 * 1000,
    }),
  ).toMatchObject({ resourceRequests: 1, refreshGrants: 1 });
  expect(await t.run(async (ctx) => await ctx.db.query("refreshGrants").collect())).toHaveLength(0);
});
