// The tenant sign-in budget of `authRequests.create` (design section 5): 120 per minute, at most
// 240 saved, one row per tenant, written in the step that stores the request.
import { DatabaseSync } from "node:sqlite";
import { Effect } from "effect";
import { describe, expect, test } from "vite-plus/test";
import type { Args } from "../store/Store.ts";
import { create } from "./authRequests.ts";
import { rowsOf, seed, testHosts, type TestHost } from "./testing.ts";

const hosts = testHosts(() => new DatabaseSync(":memory:"));

const T = 1_700_000_000_000;
const policy = { ownerId: "65", paused: false, connectors: ["g"], configured: ["g"] };

describe.each(hosts)("%s", (_name, make) => {
  const hub = () => {
    const t = make({ now: T });
    for (const repository of ["1", "2"]) {
      seed(t, "tenants", [{ tenantId: `gh-${repository}`, ownerId: "65" }]);
      seed(t, "apps", [
        { appId: `app-${repository}`, name: "a", tenantId: `gh-${repository}`, createdAt: 0 },
      ]);
      seed(t, "clients", [
        {
          clientId: `cl-${repository}`,
          appId: `app-${repository}`,
          secretHash: "s",
          tokenEndpointAuthMethod: "client_secret_post",
          redirectUris: ["https://app.test/cb"],
          deploymentType: "production",
          clientName: "prod",
          softwareVersion: "1",
          createdAt: 0,
          registrationTokenHash: "r",
          renewedAt: 0,
          app: "a",
          registeredBy: {
            kind: "initial_access_token",
            githubRepository: "o/r",
            githubOwnerId: "65",
            issuedAt: 0,
          },
          connectors: ["g"],
        },
      ]);
    }
    return t;
  };

  let next = 0;
  const argsFor = (repository: string): Args<"authRequests.create"> => {
    next += 1;
    return {
      tenantId: `gh-${repository}`,
      requestId: `r-${next}`,
      appId: `app-${repository}`,
      clientId: `cl-${repository}`,
      redirectUri: "https://app.test/cb",
      scope: "openid",
      codeChallenge: "c",
      connectors: ["g"],
      policy,
      freshLogin: false,
      txnCookieHash: "h",
      createdAt: T,
      expiresAt: T + 600_000,
    };
  };
  const signIn = (t: TestHost, repository = "1") =>
    t.run("authRequests.create", argsFor(repository)).ok;
  const burst = (t: TestHost, count: number) => Array.from({ length: count }, () => signIn(t));
  const stored = (t: TestHost) => rowsOf(t, "authRequests", "by_request_id").length;

  test("a cold tenant takes a burst of 240, and the refusal stores no request", () => {
    const t = hub();
    expect(burst(t, 240).every(Boolean)).toBe(true);
    expect(signIn(t)).toBe(false);
    expect(stored(t)).toBe(240);
    // The budget is the tenant's own.
    expect(signIn(t, "2")).toBe(true);
  });

  test("one sign-in comes back 500 ms after the bucket is empty, not before", () => {
    const t = hub();
    burst(t, 240);
    t.setNow(T + 499);
    expect(signIn(t)).toBe(false);
    t.setNow(T + 500);
    expect(signIn(t)).toBe(true);
    expect(signIn(t)).toBe(false);
  });

  test("an idle tenant saves at most 240", () => {
    const t = hub();
    burst(t, 240);
    t.setNow(T + 60 * 60_000);
    expect(burst(t, 240).every(Boolean)).toBe(true);
    expect(signIn(t)).toBe(false);
  });

  test("a step with an older clock refills nothing", () => {
    const t = hub();
    burst(t, 240);
    t.setNow(T - 60_000);
    expect(signIn(t)).toBe(false);
    t.setNow(T + 500);
    expect(signIn(t)).toBe(true);
  });

  test("a step that rolls back after storing the request spends no budget", () => {
    const t = hub();
    expect(() =>
      t.withTx(
        Effect.gen(function* () {
          expect(yield* create(argsFor("1"), { now: T })).toMatchObject({ ok: true });
          return yield* Effect.die(
            new Error("a defect after the budget and the request were written"),
          );
        }),
      ),
    ).toThrow();
    expect(rowsOf(t, "signInBudgets", "by_tenant_id")).toEqual([]);
    expect(stored(t)).toBe(0);
    expect(signIn(t)).toBe(true);
    expect(rowsOf(t, "signInBudgets", "by_tenant_id")).toEqual([
      { tenantId: "gh-1", tokens: 239, at: T },
    ]);
  });
});
