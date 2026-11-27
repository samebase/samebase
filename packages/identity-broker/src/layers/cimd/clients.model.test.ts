// The stored state of the CIMD layer as a machine (README "The CIMD layer", design C.2 to C.4).
// Facts:
//   clock               now, moves only forward
//   block of a host     set by a block, cleared by an unblock
//   card of a client    return addresses, start of the read it holds, freshUntil, removal; or none
//   reads in progress   client, start, return address; several of one client, ending in any order
//   fetch budget        a bucket of fetchesPerMinute tokens that refills fetchesPerMinute each minute
//   new-client budget   a bucket of newClientsPerHour tokens that refills newClientsPerHour each hour
//   sign-ins            pending, at the provider, or finished
// Events (store commands):
//   a read starts       cimd.begin: "stopped", "fresh" (a sign-in starts at once), "fetch" (a read)
//   a read ends, good   cimd.put when the document lists the read's address; then its sign-in starts
//   a read ends, gone   cimd.remove: the file answers 404, or the reader or the policy refuses it
//   a read ends, short  nothing: no answer, 429 or 5xx, and the card stays
//   block, unblock      cimd.blockHost, cimd.unblockHost
//   time passes         the step clock moves on
//   the cleanup runs    lifecycle.cleanup
//   a person continues  authRequests.startUpstream
//   a person finishes   authRequests.claimUpstream, complete and exchangeCode
import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";
import { makeMemoryStore } from "../../hosts/memory.ts";
import { rowsOf } from "../../rules/testing.ts";

const T0 = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** README: an unused card goes 24 hours after its last good read; a used one stays 14 days. */
const UNUSED_MS = DAY;
const USED_MS = 14 * DAY;
const REQUEST_MS = 10 * MINUTE;

const CLIENTS = [
  { id: "https://a.example.com/one.json", host: "a.example.com" },
  { id: "https://a.example.com/two.json", host: "a.example.com" },
  { id: "https://b.example.com/c.json", host: "b.example.com" },
] as const;
const HOSTS = ["a.example.com", "b.example.com"] as const;
const PATHS = ["/cb1", "/cb2"] as const;
/** The return addresses of each document a read can find, as paths on the client's origin. */
const DOCUMENTS = [["/cb1"], ["/cb2"], ["/cb1", "/cb2"]] as const;
const FRESH_MS = [0, MINUTE, HOUR, DAY] as const;
const TICKS = [1, 1, 1_000, 30_000, MINUTE, 10 * MINUTE, HOUR, DAY, USED_MS] as const;
/** Small budgets, so that a story reaches them: fetchesPerMinute 4, newClientsPerHour 1. */
const FETCHES = { rate: 4, periodMs: MINUTE, capacity: 4 };
const NEW_CLIENTS = { rate: 1, periodMs: HOUR, capacity: 1 };
const BROKER = { configured: ["g"], liveGates: [] };

type Event =
  | { kind: "readStart"; client: number; path: number }
  | { kind: "readGood"; read: number; document: number; freshMs: number }
  | { kind: "readGone"; read: number }
  | { kind: "readShort"; read: number }
  | { kind: "block"; host: number }
  | { kind: "unblock"; host: number }
  | { kind: "tick"; ms: number }
  | { kind: "cleanup" }
  | { kind: "continue"; signIn: number }
  | { kind: "finish"; signIn: number };

const event: fc.Arbitrary<Event> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant("readStart" as const),
      client: fc.oneof(
        { weight: 4, arbitrary: fc.constant(0) },
        fc.nat({ max: CLIENTS.length - 1 }),
      ),
      path: fc.nat({ max: PATHS.length - 1 }),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("readGood" as const),
      read: fc.nat({ max: 7 }),
      document: fc.nat({ max: DOCUMENTS.length - 1 }),
      freshMs: fc.constantFrom(...FRESH_MS),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant("readGone" as const), read: fc.nat({ max: 7 }) }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("readShort" as const), read: fc.nat({ max: 7 }) }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("block" as const), host: fc.nat({ max: 1 }) }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("unblock" as const), host: fc.nat({ max: 1 }) }),
  },
  {
    weight: 4,
    arbitrary: fc.record({ kind: fc.constant("tick" as const), ms: fc.constantFrom(...TICKS) }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: "cleanup" as const }) },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant("continue" as const), signIn: fc.nat({ max: 7 }) }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant("finish" as const), signIn: fc.nat({ max: 7 }) }),
  },
);

/** A good read that the store took (inserted, replaced, or older), as the model knows it. */
type StoredRead = { start: number; redirectUris: ReadonlyArray<string>; freshUntil: number };
type Read = { client: number; start: number; redirectUri: string };
type SignIn = {
  requestId: string;
  client: number;
  redirectUri: string;
  step: "pending" | "upstream" | "done";
};
/** What the model knows of one client, from the events alone. */
type ClientModel = {
  /** The good reads that the store took since the card last appeared; none: no card. */
  stored: StoredRead[];
  /** The read that the card holds: design C.2 step 6 replaces it only by a read that started after it. */
  card: StoredRead | undefined;
  lastGoodAt: number;
  lastSignInAt: number | undefined;
  /** The ended reads that found the file gone. */
  gone: number[];
};

const latestStart = (reads: ReadonlyArray<StoredRead>) =>
  Math.max(...reads.map((read) => read.start));
const emptyModel = (): ClientModel => ({
  stored: [],
  card: undefined,
  lastGoodAt: 0,
  lastSignInAt: undefined,
  gone: [],
});

/** The token-bucket rule of a budget: in any span [a, b], at most capacity + rate * (b - a) / period spends. */
function expectBucket(times: ReadonlyArray<number>, limits: typeof FETCHES) {
  for (let i = 0; i < times.length; i += 1) {
    for (let j = i; j < times.length; j += 1) {
      const span = (times[j] ?? 0) - (times[i] ?? 0);
      expect(j - i + 1).toBeLessThanOrEqual(
        limits.capacity + (limits.rate * span) / limits.periodMs,
      );
    }
  }
}

/**
 * Plays `events` on the memory store and checks the rules after each one. `strict` adds the rule
 * that the store does not keep: after a later read found the file gone, an earlier read never
 * stores the card, and no new sign-in starts until a later good read.
 */
function play(events: ReadonlyArray<Event>, strict = false) {
  const t = makeMemoryStore({ now: T0 });
  let now = T0;
  const blocked = new Set<string>();
  const reads: Read[] = [];
  const signIns: SignIn[] = [];
  const fetchStarts: number[] = [];
  const inserts: number[] = [];
  const clients = CLIENTS.map(emptyModel);
  const uriOf = (client: number, path: string) =>
    `${new URL(CLIENTS[client]?.id ?? "").origin}${path}`;
  const hostOf = (client: number) => CLIENTS[client]?.host ?? "";
  const model = (client: number) => clients[client] ?? emptyModel();

  /** No read of `client` that started after the read of its card found the file gone. */
  const laterGoodRead = (client: number) => {
    const { gone, card } = model(client);
    return card !== undefined && gone.every((start) => start <= card.start);
  };

  const startSignIn = (client: number, redirectUri: string) => {
    const requestId = `r${signIns.length}`;
    const created = t.run("authRequests.create", {
      requestId,
      clientId: CLIENTS[client]?.id ?? "",
      redirectUri,
      scope: "openid",
      codeChallenge: "challenge",
      requested: [],
      ...BROKER,
      freshLogin: false,
      txnCookieHash: `cookie-${requestId}`,
      createdAt: now,
      expiresAt: now + REQUEST_MS,
    });
    if (blocked.has(hostOf(client))) {
      expect(created.ok).toBe(false);
    }
    if (created.ok) {
      signIns.push({ requestId, client, redirectUri, step: "pending" });
    }
  };

  const takeRead = (index: number) => {
    const at = index % Math.max(1, reads.length);
    return reads.splice(at, 1)[0];
  };

  // oxlint-disable-next-line complexity -- one case per event of the machine, each with its checks.
  const apply = (e: Event) => {
    switch (e.kind) {
      case "readStart": {
        const redirectUri = uriOf(e.client, PATHS[e.path] ?? "");
        const { card, gone } = model(e.client);
        const begun = t.run("cimd.begin", {
          clientId: CLIENTS[e.client]?.id ?? "",
          redirectUri,
          connectors: ["g"],
          fetches: FETCHES,
        });
        if (blocked.has(hostOf(e.client))) {
          expect(begun.next).toBe("stopped");
          return;
        }
        expect(begun.next).not.toBe("stopped");
        // README: a card is used while its file is fresh and it holds the address; else the file is read.
        const usable =
          card !== undefined && card.freshUntil > now && card.redirectUris.includes(redirectUri);
        expect(begun.next === "fresh").toBe(usable);
        if (begun.next === "rate_limited") {
          // A bucket of N each minute always has a token after a minute with no read.
          expect(now - (fetchStarts.at(-1) ?? -Infinity)).toBeLessThan(FETCHES.periodMs);
        }
        if (begun.next === "fetch") {
          reads.push({ client: e.client, start: begun.fetchStartedAt, redirectUri });
          fetchStarts.push(now);
        }
        if (begun.next === "fresh") {
          if (strict) {
            expect(laterGoodRead(e.client)).toBe(true);
          }
          // The bounded promise: a card that an earlier read stored again gives sign-ins only while that read is fresh.
          if (card !== undefined && gone.some((start) => start > card.start)) {
            expect(now).toBeLessThan(card.freshUntil);
          }
          startSignIn(e.client, redirectUri);
        }
        return;
      }
      case "readGood": {
        const read = takeRead(e.read);
        if (read === undefined) {
          return;
        }
        const redirectUris = (DOCUMENTS[e.document] ?? [])
          .map((path) => uriOf(read.client, path))
          .sort();
        // An address that the document does not list stores nothing.
        if (!redirectUris.includes(read.redirectUri)) {
          return;
        }
        const client = model(read.client);
        const { card } = client;
        const put = t.run("cimd.put", {
          clientId: CLIENTS[read.client]?.id ?? "",
          fetchStartedAt: read.start,
          freshUntil: now + e.freshMs,
          redirectUris,
          connectors: ["g"],
          newClients: NEW_CLIENTS,
        });
        expect(put === "stopped").toBe(blocked.has(hostOf(read.client)));
        if (put === "stopped") {
          return;
        }
        expect(put === "inserted" || put === "rate_limited").toBe(card === undefined);
        if (put === "rate_limited") {
          // A bucket of N each hour always has a token after an hour with no new client.
          expect(now - (inserts.at(-1) ?? -Infinity)).toBeLessThan(NEW_CLIENTS.periodMs);
          return;
        }
        if (card !== undefined) {
          expect(put).toBe(read.start > card.start ? "replaced" : "older");
        }
        if (strict && put === "inserted") {
          expect(client.gone.every((start) => start <= read.start)).toBe(true);
        }
        const stored = { start: read.start, redirectUris, freshUntil: now + e.freshMs };
        if (put === "inserted") {
          inserts.push(now);
          client.stored = [stored];
          client.card = stored;
          client.lastGoodAt = now;
          client.lastSignInAt = undefined;
        } else {
          client.stored.push(stored);
        }
        if (put === "replaced") {
          client.card = stored;
          client.lastGoodAt = now;
        }
        startSignIn(read.client, read.redirectUri);
        return;
      }
      case "readGone": {
        const read = takeRead(e.read);
        if (read === undefined) {
          return;
        }
        const client = model(read.client);
        const { removed } = t.run("cimd.remove", {
          clientId: CLIENTS[read.client]?.id ?? "",
          fetchStartedAt: read.start,
        });
        // Design C.2 step 7: the card goes when this read started after the read that the card holds.
        expect(removed).toBe(client.card !== undefined && read.start > client.card.start);
        if (removed) {
          client.stored = [];
          client.card = undefined;
        }
        client.gone.push(read.start);
        return;
      }
      case "readShort":
        takeRead(e.read);
        return;
      case "block":
        t.run("cimd.blockHost", { host: HOSTS[e.host] ?? "" });
        blocked.add(HOSTS[e.host] ?? "");
        return;
      case "unblock":
        t.run("cimd.unblockHost", { host: HOSTS[e.host] ?? "" });
        blocked.delete(HOSTS[e.host] ?? "");
        return;
      case "tick":
        now += e.ms;
        t.setNow(now);
        return;
      case "cleanup": {
        t.run("lifecycle.cleanup", { now, signInRetentionMs: 90 * DAY });
        const present = new Set(rowsOf(t, "clients", "by_client_id").map((row) => row.clientId));
        clients.forEach((client, index) => {
          if (client.card === undefined) {
            return;
          }
          const removeAt = Math.max(
            client.lastGoodAt + UNUSED_MS,
            client.lastSignInAt === undefined ? -Infinity : client.lastSignInAt + USED_MS,
          );
          expect(present.has(CLIENTS[index]?.id ?? "")).toBe(removeAt >= now);
          if (removeAt < now) {
            client.stored = [];
            client.card = undefined;
          }
        });
        return;
      }
      case "continue": {
        const open = signIns.filter((s) => s.step !== "done");
        const signIn = open[e.signIn % Math.max(1, open.length)];
        if (signIn === undefined) {
          return;
        }
        const started = t.run("authRequests.startUpstream", {
          requestId: signIn.requestId,
          connector: "g",
          upstreamStateHash: `state-${signIn.requestId}`,
          upstreamCodeVerifier: "verifier",
          ...BROKER,
          now,
        });
        if (blocked.has(hostOf(signIn.client))) {
          expect(started.ok).toBe(false);
        }
        if (started.ok) {
          signIn.step = "upstream";
        }
        return;
      }
      case "finish": {
        const waiting = signIns.filter((s) => s.step === "upstream");
        const signIn = waiting[e.signIn % Math.max(1, waiting.length)];
        if (signIn === undefined) {
          return;
        }
        signIn.step = "done";
        const isBlocked = blocked.has(hostOf(signIn.client));
        const claimed = t.run("authRequests.claimUpstream", {
          upstreamStateHash: `state-${signIn.requestId}`,
          connector: "g",
          txnCookieHashes: [`cookie-${signIn.requestId}`],
          ...BROKER,
          now,
        });
        if (isBlocked) {
          expect(claimed.status).not.toBe("claimed");
        }
        if (claimed.status !== "claimed") {
          return;
        }
        const codeHash = `code-${signIn.requestId}`;
        const completed = t.run("authRequests.complete", {
          requestId: signIn.requestId,
          identity: { connector: "g", upstreamId: "person" },
          authTime: now,
          codeHash,
          codeExpiresAt: now + MINUTE,
          ...BROKER,
          now,
        });
        if (!completed.ok) {
          return;
        }
        const exchanged = t.run("authRequests.exchangeCode", {
          clientId: CLIENTS[signIn.client]?.id ?? "",
          authentication: { method: "none" },
          codeHash,
          redirectUri: signIn.redirectUri,
          codeChallengeOfVerifier: "challenge",
          ...BROKER,
          now,
        });
        if (exchanged.ok) {
          model(signIn.client).lastSignInAt = now;
        }
        return;
      }
      default:
        return e satisfies never;
    }
  };

  for (const e of events) {
    apply(e);
    const rows = rowsOf(t, "clients", "by_client_id");
    // A stored client: https return addresses on the origin of its id, no secret, no integration.
    for (const row of rows) {
      expect(row.tokenEndpointAuthMethod).toBe("none");
      expect(row.secretHash).toBeNull();
      expect(row.connections).toEqual([]);
      expect(row.confirm).toBe(true);
      for (const uri of row.redirectUris) {
        expect(new URL(uri).protocol).toBe("https:");
        expect(new URL(uri).origin).toBe(new URL(row.clientId).origin);
      }
    }
    // The card holds the document of the stored read that started last, in any order of the ends.
    clients.forEach((client, index) => {
      const row = rows.find((r) => r.clientId === CLIENTS[index]?.id);
      expect(row !== undefined).toBe(client.card !== undefined);
      if (row === undefined || client.card === undefined) {
        return;
      }
      expect(row.cimd?.fetchStartedAt).toBe(latestStart(client.stored));
      expect(row.redirectUris).toEqual(client.card.redirectUris);
      expect(row.cimd?.freshUntil).toBe(client.card.freshUntil);
    });
    expectBucket(fetchStarts, FETCHES);
    expectBucket(inserts, NEW_CLIENTS);
  }
}

const stories = fc.array(event, { minLength: 1, maxLength: 40, size: "max" });

describe("the stored state of the CIMD layer", () => {
  test("blocks, card shape, the later read wins, freshness, the two budgets as token buckets, and the card's lifetime hold after every event", () => {
    fc.assert(
      fc.property(stories, (events) => {
        play(events);
      }),
      { numRuns: 600, seed: 4_0207 },
    );
  });

  test("the model finds the known limit: an earlier read stores the card again after a later read found the file gone", () => {
    const result = fc.check(
      fc.property(stories, (events) => {
        play(events, true);
      }),
      { numRuns: 300, seed: 4_0208 },
    );
    expect(result.failed).toBe(true);
  });
});
