/// <reference types="vite-plus/client" />
import { convexTest } from "convex-test";
import { calculatePKCECodeChallenge } from "oauth4webapi";
import { expect, test } from "vite-plus/test";
import { api } from "./_generated/api.js";
import { LEASE_MS } from "./registration.js";
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
const refresh = {
  ...auth,
  tokenHash: "broker-refresh-hash",
  now: NOW,
};

async function grant(expires = false) {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("apps", {
      appId: "app",
      name: "App",
      firstParty: true,
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
      redirectUri: "https://preview.example/cb",
      deploymentType: "preview",
      clientName: "preview",
      softwareVersion: "test",
      createdAt: NOW - DAY,
      renewedAt: NOW - DAY,
      ...(expires ? { removeAt: NOW - DAY + LEASE_MS } : {}),
    });
  });
  await t.mutation(api.resourceRequests.create, {
    requestId: "request",
    clientId: auth.clientId,
    redirectUri: "https://preview.example/cb",
    resource: RESOURCE,
    codeChallenge: await calculatePKCECodeChallenge(VERIFIER),
    txnCookieHash: "browser",
    upstreamStateHash: "upstream-state",
    upstreamCodeVerifier: "upstream-verifier",
    expiresAt: NOW + 600_000,
  });
  await t.mutation(api.resourceRequests.claim, {
    stateHash: "upstream-state",
    resource: RESOURCE,
    cookieHashes: ["browser"],
    now: NOW,
  });
  await t.mutation(api.resourceRequests.complete, {
    requestId: "request",
    tokens: {
      accessToken: "upstream-access",
      scope: "workers-scripts.read",
      refreshToken: "upstream-refresh",
      expiresAt: NOW + 3_600_000,
    },
    codeHash: "code",
    codeExpiresAt: NOW + 60_000,
    now: NOW,
  });
  const exchange = {
    ...auth,
    codeHash: "code",
    redirectUri: "https://preview.example/cb",
    codeVerifier: VERIFIER,
    refreshTokenHash: refresh.tokenHash,
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
      redirectUri: "https://other.example/cb",
      deploymentType: "preview",
      clientName: "other",
      softwareVersion: "test",
      createdAt: NOW,
      renewedAt: NOW,
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
  await t.mutation(api.resourceRequests.failRefresh, { grantId: first.grantId, rejected: false });
  const second = await t.mutation(api.resourceRequests.claimRefresh, refresh);
  if (!second.ok) throw new Error("Expected a claim");
  await t.mutation(api.resourceRequests.failRefresh, { grantId: second.grantId, rejected: true });
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

test("a blocked repository or owner of a first-party app stops refresh, and an unblock restores it", async () => {
  const { t } = await grant();
  await t.run(async (ctx) => {
    await ctx.db.insert("tenants", { tenantId: "gh-1", ownerId: "7" });
  });
  await t.mutation(api.registration.switchConnection, { tenantId: "gh-1", connected: false });
  expect(await t.mutation(api.resourceRequests.claimRefresh, refresh)).toMatchObject({
    error: "invalid_client",
  });
  // The unblock restores refresh; the attempt is then freed for the next claim.
  await t.mutation(api.registration.switchConnection, { tenantId: "gh-1", connected: true });
  const restored = await t.mutation(api.resourceRequests.claimRefresh, refresh);
  if (!restored.ok) throw new Error("Expected a claim after the unblock");
  await t.mutation(api.resourceRequests.failRefresh, {
    grantId: restored.grantId,
    rejected: false,
  });

  await t.mutation(api.registration.setOwnerBlocked, { ownerId: "7", blocked: true, now: NOW });
  expect(await t.mutation(api.resourceRequests.claimRefresh, refresh)).toMatchObject({
    error: "invalid_client",
  });
  await t.mutation(api.registration.setOwnerBlocked, { ownerId: "7", blocked: false, now: NOW });
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
  await t.mutation(api.registration.switchConnection, { tenantId: "gh-1", connected: false });
  expect(
    await t.mutation(api.resourceRequests.revoke, { ...auth, tokenHash: refresh.tokenHash }),
  ).toBe(true);
  await t.mutation(api.registration.switchConnection, { tenantId: "gh-1", connected: true });
  expect(await t.mutation(api.resourceRequests.claimRefresh, refresh)).toMatchObject({
    error: "invalid_grant",
  });
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
  });
  expect(
    await t.mutation(api.lifecycle.cleanup, {
      now: NOW + 91 * 24 * 60 * 60 * 1000,
      signInRetentionMs: 90 * 24 * 60 * 60 * 1000,
    }),
  ).toMatchObject({ resourceRequests: 1, refreshGrants: 1 });
  expect(await t.run(async (ctx) => await ctx.db.query("refreshGrants").collect())).toHaveLength(0);
});
