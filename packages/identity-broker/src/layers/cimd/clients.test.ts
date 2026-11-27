// The store steps of the CIMD layer in a fixed order (design sections C.2 and C.4): each fetch
// starts with `cimd.begin` and ends with `cimd.put` or `cimd.remove`, and the steps of
// two fetches interleave as two sign-ins at the same time can make them.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import { rowsOf, seed, testHosts, type TestHost } from "../../rules/testing.ts";
import type { Args } from "../../store/commands.ts";
import { FETCH_BUDGET, hostKey, NEW_CLIENT_BUDGET } from "./clients.ts";

const hosts = testHosts(() => new DatabaseSync(":memory:"));

const T = 1_700_000_000_000;
const ID = "https://app.example.com/oauth-client.json";
const OLD_URI = "https://app.example.com/old";
const NEW_URI = "https://app.example.com/new";
const LIMITS = { rate: 120, periodMs: 60_000, capacity: 120 };
const HOST_BUDGET = hostKey("app.example.com");

/** The fetch that `begin` started, or its refusal. */
const begin = (t: TestHost, redirectUri = OLD_URI, fetches = LIMITS) =>
  t.run("cimd.begin", { clientId: ID, redirectUri, connectors: ["g"], fetches });

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
  more: Partial<Args<"cimd.put">> = {},
) =>
  t.run("cimd.put", {
    clientId: ID,
    redirectUri: redirectUris[0] ?? OLD_URI,
    fetchStartedAt,
    freshUntil: fetchStartedAt + 3_600_000,
    redirectUris,
    connectors: ["g"],
    clientsPerHost: 20,
    newClients: { rate: 30, periodMs: 3_600_000, capacity: 30 },
    ...more,
  });

const cards = (t: TestHost) => rowsOf(t, "clients", "by_client_id");
const budget = (t: TestHost, key: string) =>
  rowsOf(t, "signInBudgets", "by_key").find((row) => row.key === key)?.tokens;

describe.each(hosts)("%s", (_name, make) => {
  test("two first sign-ins of one new client at the same time make one card and spend one new-client token", () => {
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
        gates: ["cimd:host:app.example.com"],
        budget: "cimd:host:app.example.com",
        confirm: true,
        removeAt: T + 24 * 3_600_000,
        cimd: { fetchStartedAt: T, freshUntil: T + 3_600_000 },
      },
    ]);
    expect(budget(t, NEW_CLIENT_BUDGET)).toBe(29);
    expect(budget(t, FETCH_BUDGET)).toBe(118);
  });

  test("an old fetch that ends after a new one changes nothing; in the other order the new one replaces it", () => {
    const t = make({ now: T });
    const old = startedAt(t);
    t.setNow(T + 1);
    const late = startedAt(t);
    expect(put(t, late, [NEW_URI])).toBe("inserted");
    expect(put(t, old, [OLD_URI])).toBe("older");
    expect(t.run("cimd.remove", { clientId: ID, fetchStartedAt: old })).toEqual({
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

  test("a block of the host during a fetch stores nothing, and the next sign-in stops before a fetch", () => {
    const t = make({ now: T });
    const fetch = startedAt(t);
    expect(t.run("cimd.blockHost", { host: "app.example.com" })).toEqual({ changed: true });
    expect(put(t, fetch, [OLD_URI])).toBe("stopped");
    expect(cards(t)).toEqual([]);
    expect(begin(t)).toEqual({ next: "stopped" });
    expect(t.run("cimd.unblockHost", { host: "app.example.com" })).toEqual({ changed: true });
    expect(begin(t)).toMatchObject({ next: "fetch" });
  });

  test("a file that is removed and made again: the removal deletes the card, and the next document makes a new one", () => {
    const t = make({ now: T });
    expect(put(t, startedAt(t), [OLD_URI])).toBe("inserted");
    t.setNow(T + 3_600_000);
    expect(t.run("cimd.remove", { clientId: ID, fetchStartedAt: startedAt(t) })).toEqual({
      removed: true,
    });
    expect(cards(t)).toEqual([]);
    t.setNow(T + 3_600_001);
    expect(put(t, startedAt(t), [OLD_URI])).toBe("inserted");
    expect(cards(t)).toMatchObject([{ createdAt: T + 3_600_001 }]);
    // An hour refilled the budget, and the card made again spent one token of it.
    expect(budget(t, NEW_CLIENT_BUDGET)).toBe(29);
  });

  test("the removal of a card keeps the sign-in budget of its host, which its other cards share", () => {
    const t = make({ now: T });
    expect(put(t, startedAt(t), [OLD_URI])).toBe("inserted");
    seed(t, "signInBudgets", [{ key: HOST_BUDGET, tokens: 3, at: T }]);
    t.setNow(T + 1);
    expect(t.run("cimd.remove", { clientId: ID, fetchStartedAt: startedAt(t, NEW_URI) })).toEqual({
      removed: true,
    });
    expect(budget(t, HOST_BUDGET)).toBe(3);
  });

  test("clientsPerHost cards of one exact host, by a range of the index: the next one answers rate_limited before the new-client budget, and another host still gets a card", () => {
    const t = make({ now: T });
    const at = (path: string, host = "app.example.com") => ({
      clientId: `https://${host}${path}`,
      redirectUri: `https://${host}/cb`,
      clientsPerHost: 2,
    });
    const card = (path: string, host?: string) =>
      put(t, T, [at(path, host).redirectUri], at(path, host));
    expect(card("/one.json")).toBe("inserted");
    expect(card("/two.json")).toBe("inserted");
    expect(card("/three.json")).toBe("rate_limited");
    expect(budget(t, NEW_CLIENT_BUDGET)).toBe(28);
    // `app.example.co` starts with the same text, and `a.app.example.com` ends with it.
    expect(card("/one.json", "app.example.co")).toBe("inserted");
    expect(card("/one.json", "a.app.example.com")).toBe("inserted");
    // The count stops new cards only: a document of a stored card still goes to its card.
    expect(card("/one.json")).toBe("older");
  });

  test("the budgets: a refused fetch or card stores nothing", () => {
    const t = make({ now: T });
    const two = { rate: 2, periodMs: 60_000, capacity: 2 };
    expect(begin(t, OLD_URI, two)).toMatchObject({ next: "fetch" });
    expect(begin(t, OLD_URI, two)).toMatchObject({ next: "fetch" });
    expect(begin(t, OLD_URI, two)).toEqual({ next: "rate_limited" });
    expect(budget(t, FETCH_BUDGET)).toBe(0);

    const one = { rate: 1, periodMs: 3_600_000, capacity: 1 };
    expect(put(t, T, [OLD_URI], { newClients: one })).toBe("inserted");
    expect(
      put(t, T, [OLD_URI], { clientId: "https://other.example.com/c.json", newClients: one }),
    ).toBe("rate_limited");
    expect(cards(t).map((card) => card.clientId)).toEqual([ID]);
  });
});
