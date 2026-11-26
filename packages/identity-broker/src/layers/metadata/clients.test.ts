// The store steps of the metadata layer in a fixed order (design sections C.2 and C.4): each fetch
// starts with `metadata.begin` and ends with `metadata.put` or `metadata.remove`, and the steps of
// two fetches interleave as two sign-ins at the same time can make them.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import { rowsOf, testHosts, type TestHost } from "../../rules/testing.ts";
import type { Args } from "../../store/commands.ts";
import { FETCH_BUDGET, NEW_CARD_BUDGET } from "./clients.ts";

const hosts = testHosts(() => new DatabaseSync(":memory:"));

const T = 1_700_000_000_000;
const ID = "https://app.example.com/oauth-client.json";
const OLD_URI = "https://app.example.com/old";
const NEW_URI = "https://app.example.com/new";
const LIMITS = { rate: 120, periodMs: 60_000, capacity: 120 };

/** The fetch that `begin` started, or its refusal. */
const begin = (t: TestHost, redirectUri = OLD_URI, fetches = LIMITS) =>
  t.run("metadata.begin", { clientId: ID, redirectUri, connectors: ["g"], fetches });

const startedAt = (t: TestHost, redirectUri = OLD_URI) => {
  const begun = begin(t, redirectUri);
  if (begun.next !== "fetch") {
    throw new Error(`No fetch: ${begun.next}`);
  }
  return begun.fetchStartedAt;
};

const put = (
  t: TestHost,
  fetchStartedAt: number,
  redirectUris: ReadonlyArray<string>,
  more: Partial<Args<"metadata.put">> = {},
) =>
  t.run("metadata.put", {
    clientId: ID,
    fetchStartedAt,
    freshUntil: fetchStartedAt + 3_600_000,
    redirectUris,
    connectors: ["g"],
    newCards: { rate: 30, periodMs: 3_600_000, capacity: 30 },
    ...more,
  });

const cards = (t: TestHost) => rowsOf(t, "clients", "by_client_id");
const budget = (t: TestHost, key: string) =>
  rowsOf(t, "signInBudgets", "by_key").find((row) => row.key === key)?.tokens;

describe.each(hosts)("%s", (_name, make) => {
  test("two first sign-ins of one new client at the same time make one card and spend one new-card token", () => {
    const t = make({ now: T });
    const first = startedAt(t);
    const second = startedAt(t);
    expect(put(t, first, [OLD_URI])).toBe("inserted");
    expect(put(t, second, [OLD_URI])).toBe("older");
    expect(cards(t)).toMatchObject([
      {
        clientId: ID,
        tokenEndpointAuthMethod: "none",
        secretHash: null,
        redirectUris: [OLD_URI],
        gates: ["site:app.example.com"],
        budget: "site:app.example.com",
        confirm: true,
        removeAt: T + 24 * 3_600_000,
        metadata: { fetchStartedAt: T, freshUntil: T + 3_600_000 },
      },
    ]);
    expect(budget(t, NEW_CARD_BUDGET)).toBe(29);
    expect(budget(t, FETCH_BUDGET)).toBe(118);
  });

  test("an old fetch that ends after a new one changes nothing; in the other order the new one replaces it", () => {
    const t = make({ now: T });
    const old = startedAt(t);
    t.setNow(T + 1);
    const late = startedAt(t);
    expect(put(t, late, [NEW_URI])).toBe("inserted");
    expect(put(t, old, [OLD_URI])).toBe("older");
    expect(t.run("metadata.remove", { clientId: ID, fetchStartedAt: old })).toEqual({
      removed: false,
    });
    expect(cards(t)).toMatchObject([{ redirectUris: [NEW_URI] }]);

    const u = make({ now: T });
    const before = startedAt(u);
    u.setNow(T + 1);
    const after = startedAt(u);
    expect(put(u, before, [OLD_URI])).toBe("inserted");
    u.setNow(T + 2);
    expect(put(u, after, [NEW_URI])).toBe("replaced");
    // The card keeps its creation; its removal is 24 hours from this check.
    expect(cards(u)).toMatchObject([
      { redirectUris: [NEW_URI], createdAt: T + 1, removeAt: T + 2 + 24 * 3_600_000 },
    ]);
  });

  test("a stop of the site during a fetch stores nothing, and the next sign-in stops before a fetch", () => {
    const t = make({ now: T });
    const fetch = startedAt(t);
    expect(t.run("metadata.stop", { host: "app.example.com" })).toEqual({ changed: true });
    expect(put(t, fetch, [OLD_URI])).toBe("stopped");
    expect(cards(t)).toEqual([]);
    expect(begin(t)).toEqual({ next: "stopped" });
    expect(t.run("metadata.release", { host: "app.example.com" })).toEqual({ changed: true });
    expect(begin(t)).toMatchObject({ next: "fetch" });
  });

  test("a file that is removed and made again: the removal deletes the card, and the next document makes a new one", () => {
    const t = make({ now: T });
    expect(put(t, startedAt(t), [OLD_URI])).toBe("inserted");
    t.setNow(T + 3_600_000);
    expect(t.run("metadata.remove", { clientId: ID, fetchStartedAt: startedAt(t) })).toEqual({
      removed: true,
    });
    expect(cards(t)).toEqual([]);
    t.setNow(T + 3_600_001);
    expect(put(t, startedAt(t), [OLD_URI])).toBe("inserted");
    expect(cards(t)).toMatchObject([{ createdAt: T + 3_600_001 }]);
    // An hour refilled the budget, and the card made again spent one token of it.
    expect(budget(t, NEW_CARD_BUDGET)).toBe(29);
  });

  test("the budgets: a refused fetch or card stores nothing", () => {
    const t = make({ now: T });
    const two = { rate: 2, periodMs: 60_000, capacity: 2 };
    expect(begin(t, OLD_URI, two)).toMatchObject({ next: "fetch" });
    expect(begin(t, OLD_URI, two)).toMatchObject({ next: "fetch" });
    expect(begin(t, OLD_URI, two)).toEqual({ next: "limited" });
    expect(budget(t, FETCH_BUDGET)).toBe(0);

    const one = { rate: 1, periodMs: 3_600_000, capacity: 1 };
    expect(put(t, T, [OLD_URI], { newCards: one })).toBe("inserted");
    expect(
      put(t, T, [OLD_URI], { clientId: "https://other.example.com/c.json", newCards: one }),
    ).toBe("limited");
    expect(cards(t).map((card) => card.clientId)).toEqual([ID]);
  });
});
