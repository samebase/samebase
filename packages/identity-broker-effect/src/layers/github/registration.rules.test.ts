// The GitHub layer's steps on both hosts: the owner proof watermark, a held development
// registration across a transfer, the hourly windows, the caps, and the card that each step
// writes: its connectors from the allow-list and the grants, its gates, `confirm`, budget and ref,
// the rewrite of a tenant's cards when its owner changes, and the renewal that writes a card again.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import { rowsOf, seed, testHosts, type TestHost } from "../../rules/testing.ts";
import type { Args } from "../../store/commands.ts";
import type { Doc } from "../../store/tables.ts";
import { MAX_APPS_PER_TENANT, MAX_CLIENTS_PER_APP } from "./clients.ts";
import { setExemption, setGrant } from "./testing/seeds.ts";

const hosts = testHosts(() => new DatabaseSync(":memory:"));

const T = 1_700_000_000_000;
const HOUR = 3_600_000;
const CONFIGURED = ["g", "h"];
/** The allow-list names repository 1 with owners 65 and 66, so each may enroll in both. */
const ALLOWED = [
  { repositoryId: "1", ownerId: "65" },
  { repositoryId: "1", ownerId: "66" },
];
const settings = { allowList: ALLOWED, configured: CONFIGURED };

let serial = 0;
const runOf = (
  owner: string,
  proofIssuedAt: number,
  deployment: Args<"github.createClient">["deployment"] = {
    type: "production",
    initialAccessTokenHash: `token-${owner}`,
  },
  app = "web",
  more: Partial<Args<"github.createClient">> = {},
): Args<"github.createClient"> => {
  serial += 1;
  return {
    clientId: `client-${serial}`,
    secretHash: "s",
    registrationTokenHash: `r-${serial}`,
    githubRepositoryDatabaseId: "1",
    githubOwnerId: owner,
    githubRepository: `owner-${owner}/repo`,
    githubActorId: "9",
    githubActorLogin: "actor",
    commitSha: "sha",
    proofIssuedAt,
    deployment,
    connectors: CONFIGURED,
    app,
    appId: `gh-1-${app}`,
    redirectUris: ["https://app.test/cb"],
    softwareVersion: "1",
    tokenEndpointAuthMethod: "client_secret_basic",
    ...settings,
    ...more,
  };
};

const developmentOf = (
  owner: string,
  more: Partial<Args<"github.createDevelopmentClient">> = {},
): Args<"github.createDevelopmentClient"> => ({
  clientId: "dev",
  secretHash: "s",
  registrationTokenHash: "r-dev",
  tokenHash: `token-${owner}`,
  githubRepositoryDatabaseId: "1",
  githubOwnerId: owner,
  githubRepository: `owner-${owner}/repo`,
  app: "web",
  appId: "gh-1-web",
  connectors: CONFIGURED,
  redirectUris: ["http://localhost:5173/cb"],
  softwareVersion: "1",
  tokenEndpointAuthMethod: "client_secret_basic",
  ...settings,
  ...more,
});

const contents = (t: TestHost) => ({
  clients: rowsOf(t, "clients", "by_client_id"),
  tenants: rowsOf(t, "tenants", "by_tenant_id"),
  tokens: rowsOf(t, "initialAccessTokens", "by_token_hash"),
  events: rowsOf(t, "events", "by_github_owner_id"),
  apps: rowsOf(t, "apps", "by_app_id"),
  rateLimits: rowsOf(t, "rateLimits", "by_scope_and_github_id"),
});

const cardOf = (t: TestHost, clientId: string) =>
  rowsOf(t, "clients", "by_client_id").find((card) => card.clientId === clientId);

describe.each(hosts)("%s", (_name, make) => {
  describe("the card that a registration writes", () => {
    test("names the repository's key and the owner's, the tenant as ref and budget, and the page", () => {
      const t = make({ now: T });
      const run = runOf("65", 100);
      expect(t.run("github.createClient", run)).toMatchObject({ ok: true });
      expect(cardOf(t, run.clientId)).toMatchObject({
        connectors: ["g", "h"],
        gates: ["github:repository:1", "github:owner:65"],
        confirm: true,
        budget: "github:gh-1",
        ref: "github:gh-1",
        github: { appId: "gh-1-web", deploymentType: "production", enrollment: ["g", "h"] },
      });
    });

    test("gets every configured connector of its enrollment only while the allow-list names the repository with its owner", () => {
      const t = make({ now: T });
      const listed = runOf("65", 100, undefined, "web", { connectors: ["g"] });
      expect(t.run("github.createClient", listed)).toMatchObject({ ok: true });
      expect(cardOf(t, listed.clientId)?.connectors).toEqual(["g"]);
      // The listed repository under another owner, and another repository of the listed owner.
      for (const allowList of [
        [{ repositoryId: "1", ownerId: "1" }],
        [{ repositoryId: "2", ownerId: "65" }],
      ]) {
        expect(
          t.run("github.admit", {
            ...settings,
            allowList,
            githubRepositoryDatabaseId: "1",
            githubOwnerId: "65",
          }),
        ).toEqual({
          ok: false,
          reason: "invalid_connectors",
          allowed: [],
        });
      }
    });

    test("gets a granted connector while the grant's owner owns the repository and registered the client", () => {
      const t = make({ now: T });
      const unlisted = { ...settings, allowList: [] };
      setGrant(t, { repositoryId: "1", ownerId: "65", connector: "h" }, true);
      const run = runOf("65", 100, undefined, "web", { ...unlisted, connectors: ["h"] });
      expect(t.run("github.createClient", run)).toMatchObject({ ok: true });
      expect(cardOf(t, run.clientId)?.connectors).toEqual(["h"]);
      // A grant of another owner gives nothing.
      setGrant(t, { repositoryId: "1", ownerId: "66", connector: "g" }, true);
      expect(
        t.run(
          "github.createClient",
          runOf("65", 100, undefined, "web", { ...unlisted, connectors: ["g"] }),
        ),
      ).toEqual({ ok: false, reason: "invalid_connectors", allowed: ["h"] });
    });

    test("skips the page while an exemption row of the current owner covers the repository", () => {
      const t = make({ now: T });
      setExemption(t, { repositoryId: "1", ownerId: "65" }, true);
      const run = runOf("65", 100);
      t.run("github.createClient", run);
      expect(cardOf(t, run.clientId)?.confirm).toBe(false);
    });
  });

  describe("an owner transfer", () => {
    test("rewrites every card of the tenant in its step: the new owner's key, its grants and its exemption", () => {
      const t = make({ now: T });
      const unlisted = { ...settings, allowList: [] };
      setGrant(t, { repositoryId: "1", ownerId: "65", connector: "h" }, true);
      setExemption(t, { repositoryId: "1", ownerId: "65" }, true);
      const old = runOf("65", 100, undefined, "web", { ...unlisted, connectors: ["h"] });
      const preview = runOf("65", 100, { type: "preview", stage: "pr-1" }, "docs", {
        ...unlisted,
        connectors: ["h"],
      });
      t.run("github.createClient", old);
      t.run("github.createClient", preview);
      for (const clientId of [old.clientId, preview.clientId]) {
        expect(cardOf(t, clientId)).toMatchObject({ connectors: ["h"], confirm: false });
      }
      // Owner 66, with a grant of its own, registers with a newer proof.
      setGrant(t, { repositoryId: "1", ownerId: "66", connector: "g" }, true);
      const moved = runOf("66", 101, undefined, "web", { ...unlisted, connectors: ["g"] });
      expect(t.run("github.createClient", moved)).toMatchObject({ ok: true });
      for (const clientId of [old.clientId, preview.clientId]) {
        // 66 owns the repository but did not register them: no grant counts for them, and 65's
        // exemption no longer covers them.
        expect(cardOf(t, clientId)).toMatchObject({
          connectors: [],
          gates: ["github:repository:1", "github:owner:66"],
          confirm: true,
        });
      }
      expect(cardOf(t, moved.clientId)).toMatchObject({
        connectors: ["g"],
        gates: ["github:repository:1", "github:owner:66"],
        confirm: true,
      });
    });

    test("with the new owner on the allow-list keeps the old cards' enrollment usable", () => {
      const t = make({ now: T });
      const old = runOf("65", 100);
      t.run("github.createClient", old);
      t.run("github.createClient", runOf("66", 101));
      expect(cardOf(t, old.clientId)).toMatchObject({
        connectors: ["g", "h"],
        gates: ["github:repository:1", "github:owner:66"],
      });
    });

    test("needs a strictly newer proof, and stops the old owner's held development token", () => {
      const t = make({ now: T });
      expect(t.run("github.createClient", runOf("65", 100))).toMatchObject({
        ok: true,
        tenantId: "gh-1",
      });
      expect(rowsOf(t, "tenants", "by_tenant_id")).toEqual([
        { tenantId: "gh-1", ownerId: "65", ownerProofIssuedAt: 100 },
      ]);
      // A development server of owner 65 reads its token; the request is held there.
      expect(t.run("github.readInitialAccessToken", { tokenHash: "token-65" })).toEqual({
        githubRepositoryDatabaseId: "1",
        githubOwnerId: "65",
        githubRepository: "owner-65/repo",
        app: "web",
      });
      // Owner 66 cannot take the repository with a proof of the same second or older.
      for (const iat of [100, 99]) {
        const before = contents(t);
        expect(t.run("github.createClient", runOf("66", iat))).toEqual({
          ok: false,
          reason: "stale_proof",
        });
        expect(contents(t)).toEqual(before);
      }
      // A newer proof moves the repository to 66 and deletes 65's token.
      t.setNow(T + 1);
      expect(t.run("github.createClient", runOf("66", 101))).toMatchObject({ ok: true });
      expect(
        rowsOf(t, "initialAccessTokens", "by_token_hash").map((token) => token.githubOwnerId),
      ).toEqual(["66"]);
      // The held request of 65 creates nothing.
      const before = contents(t);
      expect(t.run("github.createDevelopmentClient", developmentOf("65"))).toEqual({
        ok: false,
        reason: "invalid_token",
      });
      expect(contents(t)).toEqual(before);
      // The old owner's stale proof cannot take it back; the new owner's older proof registers
      // but keeps the mark.
      expect(t.run("github.createClient", runOf("65", 101))).toEqual({
        ok: false,
        reason: "stale_proof",
      });
      expect(
        t.run("github.createClient", runOf("66", 50, { type: "preview", stage: "pr-1" })),
      ).toMatchObject({ ok: true });
      expect(rowsOf(t, "tenants", "by_tenant_id")).toEqual([
        { tenantId: "gh-1", ownerId: "66", ownerProofIssuedAt: 101 },
      ]);
    });
  });

  test("a development client keeps the owner and records the token", () => {
    const t = make({ now: T });
    t.run("github.createClient", runOf("65", 100));
    t.setNow(T + 5);
    expect(t.run("github.createDevelopmentClient", developmentOf("65"))).toEqual({
      ok: true,
      createdAt: T + 5,
      clientName: "development",
      tenantId: "gh-1",
    });
    expect(cardOf(t, "dev")).toMatchObject({
      removeAt: T + 5 + 14 * 24 * HOUR,
      gates: ["github:repository:1", "github:owner:65"],
      github: {
        deploymentType: "development",
        registeredBy: { kind: "initial_access_token", githubOwnerId: "65", issuedAt: T },
      },
    });
  });

  describe("a renewal", () => {
    test("writes the card again from the allow-list of its step, and refuses a stopped repository", () => {
      const t = make({ now: T });
      const run = runOf("65", 100, { type: "preview", stage: "pr-1" });
      t.run("github.createClient", run);
      t.setNow(T + HOUR);
      const renew = (allowList: typeof ALLOWED) =>
        t.run("github.renew", {
          clientId: run.clientId,
          registrationTokenHash: run.registrationTokenHash,
          allowList,
          configured: CONFIGURED,
        });
      expect(renew([])).toMatchObject({ ok: true, connectors: ["g", "h"] });
      expect(cardOf(t, run.clientId)).toMatchObject({
        connectors: [],
        removeAt: T + HOUR + 14 * 24 * HOUR,
        github: { renewedAt: T + HOUR, enrollment: ["g", "h"] },
      });
      expect(renew(ALLOWED)).toMatchObject({ ok: true });
      expect(cardOf(t, run.clientId)?.connectors).toEqual(["g", "h"]);
      seed(t, "stops", [{ key: "github:repository:1", at: T }]);
      const before = contents(t);
      expect(renew(ALLOWED)).toEqual({ ok: false, error: "suspended" });
      expect(contents(t)).toEqual(before);
    });

    test("needs the client's own registration token", () => {
      const t = make({ now: T });
      const run = runOf("65", 100);
      t.run("github.createClient", run);
      expect(
        t.run("github.renew", {
          clientId: run.clientId,
          registrationTokenHash: "another",
          ...settings,
        }),
      ).toEqual({ ok: false, error: "invalid_token" });
    });
  });

  test("admission counts per repository in a fixed hour that restarts at its end", () => {
    const t = make({ now: T });
    const admit = () =>
      t.run("github.admit", { githubRepositoryDatabaseId: "1", githubOwnerId: "65", ...settings });
    for (let count = 0; count < 30; count++) {
      expect(admit()).toEqual({ ok: true, enrollment: ["g", "h"] });
    }
    expect(admit()).toEqual({ ok: false, reason: "rate_limited", window: "repository" });
    t.setNow(T + HOUR - 1);
    expect(admit()).toEqual({ ok: false, reason: "rate_limited", window: "repository" });
    t.setNow(T + HOUR);
    expect(admit()).toMatchObject({ ok: true });
    expect(rowsOf(t, "rateLimits", "by_scope_and_github_id")).toEqual([
      { scope: "owner", githubId: "65", startedAt: T + HOUR, count: 1 },
      { scope: "repository", githubId: "1", startedAt: T + HOUR, count: 1 },
    ]);
  });

  test("a stopped owner, and an enrollment outside what the owner may use, are refused and count nowhere", () => {
    const t = make({ now: T });
    const admit = (connectors?: ReadonlyArray<string>) =>
      t.run("github.admit", {
        githubRepositoryDatabaseId: "1",
        githubOwnerId: "65",
        ...(connectors === undefined ? {} : { connectors }),
        ...settings,
        allowList: [],
      });
    setGrant(t, { repositoryId: "1", ownerId: "65", connector: "g" }, true);
    expect(admit(["g", "h"])).toEqual({
      ok: false,
      reason: "invalid_connectors",
      allowed: ["g"],
    });
    seed(t, "stops", [{ key: "github:owner:65", at: 0 }]);
    expect(admit()).toEqual({ ok: false, reason: "blocked" });
    expect(rowsOf(t, "rateLimits", "by_scope_and_github_id")).toEqual([]);
  });

  test("the eleventh app of a repository is refused and writes nothing", () => {
    const t = make({ now: T });
    for (let app = 0; app < MAX_APPS_PER_TENANT; app++) {
      expect(t.run("github.createClient", runOf("65", 100, undefined, `app${app}`))).toMatchObject({
        ok: true,
      });
    }
    const before = contents(t);
    expect(t.run("github.createClient", runOf("65", 100, undefined, "one-more"))).toEqual({
      ok: false,
      reason: "too_many_apps",
    });
    expect(contents(t)).toEqual(before);
  });

  test("at the production cap the least renewed never-used client goes, the first of equals in index order", () => {
    const t = make({ now: T });
    t.run("github.createClient", runOf("65", 100));
    const production = (clientId: string, renewedAt: number, used: boolean): Doc<"clients"> => ({
      clientId,
      redirectUris: ["https://app.test/cb"],
      tokenEndpointAuthMethod: "client_secret_basic",
      secretHash: "s",
      connectors: ["g"],
      gates: ["github:repository:1", "github:owner:65"],
      confirm: true,
      budget: "github:gh-1",
      ref: "github:gh-1",
      createdAt: 0,
      ...(used ? { lastSignInAt: 1 } : {}),
      github: {
        appId: "gh-1-web",
        app: "web",
        deploymentType: "production",
        clientName: "prod",
        softwareVersion: "1",
        registrationTokenHash: "r",
        renewedAt,
        registeredBy: {
          kind: "initial_access_token",
          githubRepository: "o/r",
          githubOwnerId: "65",
          issuedAt: 0,
        },
        enrollment: ["g"],
      },
    });
    // 29 more rows: the cap is full. Two never-used rows share the oldest renewal.
    seed(t, "clients", [
      production("used-oldest", 1, true),
      production("tie-first", 5, false),
      production("tie-second", 5, false),
      ...Array.from({ length: MAX_CLIENTS_PER_APP - 4 }, (_, index) =>
        production(`fresh-${index}`, 10, false),
      ),
    ]);
    expect(t.run("github.createClient", runOf("65", 100))).toMatchObject({ ok: true });
    const ids = rowsOf(t, "clients", "by_client_id").map((client) => client.clientId);
    expect(ids).not.toContain("tie-first");
    expect(ids).toContain("tie-second");
    expect(ids).toContain("used-oldest");
    expect(ids).toHaveLength(MAX_CLIENTS_PER_APP);
  });
});
