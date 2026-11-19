// The sign-in budget of `authRequests.create` (design section 5): 120 per minute, at most 240
// saved, one row per budget key, written in the step that stores the request. The key is the
// card's `budget`, which its layer sets.
import { DatabaseSync } from "node:sqlite";
import { Effect } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { coreView, type Args } from "../store/commands.ts";
import { create } from "./authRequests.ts";
import { Tx } from "./tables.ts";
import { rowsOf, seed, testHosts, type TestHost } from "./testing.ts";

const hosts = testHosts(() => new DatabaseSync(":memory:"));

const T = 1_700_000_000_000;

describe.each(hosts)("%s", (_name, make) => {
  /** Cards 1a and 1b share the budget `budget-1`; card 2 has `budget-2`. */
  const hub = () => {
    const t = make({ now: T });
    seed(
      t,
      "clients",
      ["1a", "1b", "2"].map((client) => ({
        clientId: `cl-${client}`,
        redirectUris: ["https://app.test/cb"],
        tokenEndpointAuthMethod: "client_secret_post",
        secretHash: "s",
        connectors: ["g"],
        gates: [],
        confirm: false,
        budget: `budget-${client.slice(0, 1)}`,
        ref: `test:${client}`,
        createdAt: 0,
      })),
    );
    return t;
  };

  let next = 0;
  const argsFor = (client: string): Args<"authRequests.create"> => {
    next += 1;
    return {
      requestId: `r-${next}`,
      clientId: `cl-${client}`,
      redirectUri: "https://app.test/cb",
      scope: "openid",
      codeChallenge: "c",
      requested: [],
      configured: ["g"],
      freshLogin: false,
      txnCookieHash: "h",
      createdAt: T,
      expiresAt: T + 600_000,
    };
  };
  const signIn = (t: TestHost, client = "1a") => t.run("authRequests.create", argsFor(client)).ok;
  const burst = (t: TestHost, count: number) => Array.from({ length: count }, () => signIn(t));
  const stored = (t: TestHost) => rowsOf(t, "authRequests", "by_request_id").length;

  test("a cold budget takes a burst of 240, and the refusal stores no request", () => {
    const t = hub();
    expect(burst(t, 240).every(Boolean)).toBe(true);
    expect(signIn(t)).toBe(false);
    expect(stored(t)).toBe(240);
    // Another card of the same budget key gets nothing more; another key is its own.
    expect(signIn(t, "1b")).toBe(false);
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

  test("an idle budget saves at most 240", () => {
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
      t.withTx((tx) =>
        Effect.gen(function* () {
          expect(yield* create(argsFor("1a"), { now: T })).toMatchObject({ ok: true });
          return yield* Effect.die(
            new Error("a defect after the budget and the request were written"),
          );
        }).pipe(Effect.provideService(Tx, coreView(tx))),
      ),
    ).toThrow();
    expect(rowsOf(t, "signInBudgets", "by_key")).toEqual([]);
    expect(stored(t)).toBe(0);
    expect(signIn(t)).toBe(true);
    expect(rowsOf(t, "signInBudgets", "by_key")).toEqual([{ key: "budget-1", tokens: 239, at: T }]);
  });
});
