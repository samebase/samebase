// The registration steps (`POST /register`) on both hosts: the owner proof watermark, a held
// development registration across a transfer, the hourly windows, and the caps.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import type { Args } from "../store/Store.ts";
import type { Doc } from "../store/tables.ts";
import { MAX_APPS_PER_TENANT, MAX_CLIENTS_PER_APP } from "./registration.ts";
import { rowsOf, seed, testHosts, type TestHost } from "./testing.ts";

const hosts = testHosts(() => new DatabaseSync(":memory:"));

const T = 1_700_000_000_000;
const HOUR = 3_600_000;

let serial = 0;
const runOf = (
  owner: string,
  proofIssuedAt: number,
  deployment: Args<"hubClients.createClient">["deployment"] = {
    type: "production",
    initialAccessTokenHash: `token-${owner}`,
  },
  app = "web",
): Args<"hubClients.createClient"> => {
  serial += 1;
  return {
    clientId: `client-${serial}`,
    secretHash: "s",
    registrationTokenHash: "r",
    githubRepositoryDatabaseId: "1",
    githubOwnerId: owner,
    githubRepository: `owner-${owner}/repo`,
    githubActorId: "9",
    githubActorLogin: "actor",
    commitSha: "sha",
    proofIssuedAt,
    deployment,
    connectors: ["g"],
    policyConnectors: ["g"],
    configuredConnectors: ["g"],
    app,
    appId: `gh-1-${app}`,
    redirectUris: ["https://app.test/cb"],
    softwareVersion: "1",
    tokenEndpointAuthMethod: "client_secret_basic",
  };
};

const contents = (t: TestHost) => ({
  clients: rowsOf(t, "clients", "by_client_id"),
  tenants: rowsOf(t, "tenants", "by_tenant_id"),
  tokens: rowsOf(t, "initialAccessTokens", "by_token_hash"),
  events: rowsOf(t, "events", "by_kind_and_at"),
  apps: rowsOf(t, "apps", "by_app_id"),
  rateLimits: rowsOf(t, "rateLimits", "by_scope_and_github_id"),
});

describe.each(hosts)("%s", (_name, make) => {
  test("an owner change needs a strictly newer proof, and stops the old owner's held token", () => {
    const t = make({ now: T });
    expect(t.run("hubClients.createClient", runOf("65", 100))).toMatchObject({
      ok: true,
      tenantId: "gh-1",
    });
    expect(rowsOf(t, "tenants", "by_tenant_id")).toEqual([
      { tenantId: "gh-1", ownerId: "65", ownerProofIssuedAt: 100 },
    ]);
    // A development server of owner 65 reads its token; the request is held there.
    const facts = t.run("hubClients.readInitialAccessToken", { tokenHash: "token-65" });
    expect(facts).toEqual({
      githubRepositoryDatabaseId: "1",
      githubOwnerId: "65",
      githubRepository: "owner-65/repo",
      app: "web",
    });
    // Owner 66 cannot take the repository with a proof of the same second or older: nothing is written.
    for (const iat of [100, 99]) {
      const before = contents(t);
      expect(t.run("hubClients.createClient", runOf("66", iat))).toEqual({
        ok: false,
        reason: "stale_proof",
      });
      expect(contents(t)).toEqual(before);
    }
    // A newer proof moves the repository to 66 and deletes 65's token.
    t.setNow(T + 1);
    expect(t.run("hubClients.createClient", runOf("66", 101))).toMatchObject({ ok: true });
    expect(
      rowsOf(t, "initialAccessTokens", "by_token_hash").map((token) => token.githubOwnerId),
    ).toEqual(["66"]);
    // The held request of 65 creates nothing.
    const before = contents(t);
    expect(
      t.run("hubClients.createDevelopmentClient", {
        clientId: "dev",
        secretHash: "s",
        registrationTokenHash: "r",
        tokenHash: "token-65",
        githubRepositoryDatabaseId: "1",
        githubOwnerId: "65",
        githubRepository: "owner-65/repo",
        app: "web",
        appId: "gh-1-web",
        connectors: ["g"],
        policyConnectors: ["g"],
        configuredConnectors: ["g"],
        redirectUris: ["http://localhost:5173/cb"],
        softwareVersion: "1",
        tokenEndpointAuthMethod: "client_secret_basic",
      }),
    ).toEqual({ ok: false, reason: "invalid_token" });
    expect(contents(t)).toEqual(before);
    // The old owner's stale proof cannot take it back; the new owner's older proof registers but keeps the mark.
    expect(t.run("hubClients.createClient", runOf("65", 101))).toEqual({
      ok: false,
      reason: "stale_proof",
    });
    expect(
      t.run("hubClients.createClient", runOf("66", 50, { type: "preview", stage: "pr-1" })),
    ).toMatchObject({ ok: true });
    expect(rowsOf(t, "tenants", "by_tenant_id")).toEqual([
      { tenantId: "gh-1", ownerId: "66", ownerProofIssuedAt: 101 },
    ]);
  });

  test("a development client keeps the owner and records the token", () => {
    const t = make({ now: T });
    t.run("hubClients.createClient", runOf("65", 100));
    t.setNow(T + 5);
    expect(
      t.run("hubClients.createDevelopmentClient", {
        clientId: "dev",
        secretHash: "s",
        registrationTokenHash: "r",
        tokenHash: "token-65",
        githubRepositoryDatabaseId: "1",
        githubOwnerId: "65",
        githubRepository: "owner-65/repo",
        app: "web",
        appId: "gh-1-web",
        connectors: ["g"],
        policyConnectors: ["g"],
        configuredConnectors: ["g"],
        redirectUris: ["http://localhost:5173/cb"],
        softwareVersion: "1",
        tokenEndpointAuthMethod: "client_secret_basic",
      }),
    ).toEqual({ ok: true, createdAt: T + 5, clientName: "development", tenantId: "gh-1" });
    expect(t.run("clients.get", { clientId: "dev" })).toMatchObject({
      deploymentType: "development",
      removeAt: T + 5 + 14 * 24 * HOUR,
      registeredBy: { kind: "initial_access_token", githubOwnerId: "65", issuedAt: T },
    });
  });

  test("admission counts per repository in a fixed hour that restarts at its end", () => {
    const t = make({ now: T });
    const admit = () =>
      t.run("hubClients.admit", { githubRepositoryDatabaseId: "1", githubOwnerId: "65" });
    for (let count = 0; count < 30; count++) {
      expect(admit()).toEqual({ status: "admitted" });
    }
    expect(admit()).toEqual({ status: "rate_limited", window: "repository" });
    t.setNow(T + HOUR - 1);
    expect(admit()).toEqual({ status: "rate_limited", window: "repository" });
    t.setNow(T + HOUR);
    expect(admit()).toEqual({ status: "admitted" });
    expect(rowsOf(t, "rateLimits", "by_scope_and_github_id")).toEqual([
      { scope: "owner", githubId: "65", startedAt: T + HOUR, count: 1 },
      { scope: "repository", githubId: "1", startedAt: T + HOUR, count: 1 },
    ]);
  });

  test("a blocked owner is refused and counts nowhere", () => {
    const t = make({ now: T });
    seed(t, "blocks", [{ kind: "owner", githubId: "65", reason: "r", adminEmail: "a@b", at: 0 }]);
    expect(
      t.run("hubClients.admit", { githubRepositoryDatabaseId: "1", githubOwnerId: "65" }),
    ).toEqual({
      status: "blocked",
    });
    expect(rowsOf(t, "rateLimits", "by_scope_and_github_id")).toEqual([]);
  });

  test("the eleventh app of a repository is refused and writes nothing", () => {
    const t = make({ now: T });
    for (let app = 0; app < MAX_APPS_PER_TENANT; app++) {
      expect(
        t.run("hubClients.createClient", runOf("65", 100, undefined, `app${app}`)),
      ).toMatchObject({ ok: true });
    }
    const before = contents(t);
    expect(t.run("hubClients.createClient", runOf("65", 100, undefined, "one-more"))).toEqual({
      ok: false,
      reason: "too_many_apps",
    });
    expect(contents(t)).toEqual(before);
  });

  test("at the production cap the least renewed never-used client goes, the first of equals in index order", () => {
    const t = make({ now: T });
    t.run("hubClients.createClient", runOf("65", 100));
    const production = (clientId: string, renewedAt: number, used: boolean): Doc<"clients"> => ({
      clientId,
      appId: "gh-1-web",
      secretHash: "s",
      tokenEndpointAuthMethod: "client_secret_basic",
      redirectUris: ["https://app.test/cb"],
      deploymentType: "production",
      clientName: "prod",
      softwareVersion: "1",
      createdAt: 0,
      ...(used ? { lastSignInAt: 1 } : {}),
      registrationTokenHash: "r",
      renewedAt,
      app: "web",
      registeredBy: {
        kind: "initial_access_token",
        githubRepository: "o/r",
        githubOwnerId: "65",
        issuedAt: 0,
      },
      connectors: ["g"],
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
    expect(t.run("hubClients.createClient", runOf("65", 100))).toMatchObject({ ok: true });
    const ids = rowsOf(t, "clients", "by_client_id").map((client) => client.clientId);
    expect(ids).not.toContain("tie-first");
    expect(ids).toContain("tie-second");
    expect(ids).toContain("used-oldest");
    expect(ids).toHaveLength(MAX_CLIENTS_PER_APP);
  });
});
