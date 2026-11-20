// A breadth-first bounded check of one connection grant's states over the memory Store: idle,
// leased by an attempt, and gone. Every reachable state up to a fixed depth is visited once
// (states compared by content), and design version 2 items 4 and 5 are asserted on every
// transition. Between any two steps a stop on the card's gate can commit or go, the card's gate
// in the layer's namespace can leave the live gates or come back, the connection can leave the
// card or come back, the card can delete itself, the clock can move across the lease, and two
// attempts can be in flight, each finishing with a rotation or without, or failing with the
// provider's `invalid_grant` or another error.
import { describe, expect, test } from "vite-plus/test";
import { makeMemoryStore } from "../hosts/memory.ts";
import type { Args, CommandName, Result } from "../store/commands.ts";
import type { MemorySnapshot } from "../store/memory.ts";
import type { Doc } from "../store/tables.ts";
import { patch, remove, seed } from "../rules/testing.ts";
import { REFRESH_LEASE_MS } from "./rules.ts";

const RESOURCE = "https://api.provider.test/";
const PROVIDERS = [{ name: "p", resource: RESOURCE }];
const NAMESPACE = "key:";
const GATES = ["gate:a", "key:b"];
/** The clock moves along these points only: inside, at and past the lease of an attempt at 0. */
const TIMES = [0, 30_000, REFRESH_LEASE_MS - 1, REFRESH_LEASE_MS, 120_000, 2 * REFRESH_LEASE_MS];
const auth = {
  clientId: "cl",
  clientSecretHash: "sec",
  tokenEndpointAuthMethod: "client_secret_post",
} as const;

interface Model {
  readonly snapshot: MemorySnapshot;
  readonly now: number;
  /** The attempt numbers that admissions gave out, newest last: at most the last two are kept. */
  readonly attempts: ReadonlyArray<number>;
  readonly keyLive: boolean;
  /** The grant's row was seen gone: no step may bring it back. */
  readonly gone: boolean;
}

type Action =
  | { readonly kind: "claim" }
  | { readonly kind: "finish"; readonly which: number; readonly rotated: boolean }
  | { readonly kind: "fail"; readonly which: number; readonly rejected: boolean }
  | { readonly kind: "revoke" }
  | { readonly kind: "tick" }
  | { readonly kind: "stop" }
  | { readonly kind: "live" }
  | { readonly kind: "connection" }
  | { readonly kind: "deleteCard" }
  | { readonly kind: "cleanup" };

const ACTIONS: ReadonlyArray<Action> = [
  { kind: "claim" },
  ...[0, 1].flatMap((which) =>
    [true, false].flatMap((flag): Array<Action> => [
      { kind: "finish", which, rotated: flag },
      { kind: "fail", which, rejected: flag },
    ]),
  ),
  { kind: "revoke" },
  { kind: "tick" },
  { kind: "stop" },
  { kind: "live" },
  { kind: "connection" },
  { kind: "deleteCard" },
  { kind: "cleanup" },
];

const card: Doc<"clients"> = {
  clientId: "cl",
  redirectUris: ["https://app.test/cb"],
  tokenEndpointAuthMethod: "client_secret_post",
  secretHash: "sec",
  connectors: ["g"],
  connections: ["p"],
  gates: GATES,
  confirm: false,
  budget: "key:b",
  ref: "key:b:pr-1",
  removeAt: 10 * REFRESH_LEASE_MS,
  createdAt: 0,
  stack: {
    key: "b",
    name: "pr-1",
    softwareId: "app",
    softwareVersion: "1",
    registrationTokenHash: "rt",
    enrollment: ["g"],
  },
};

const search = (depth: number) => {
  const hub = makeMemoryStore({ now: 0 });
  seed(hub, "clients", [card]);
  seed(hub, "connectionGrants", [
    {
      tokenHash: "g",
      clientId: "cl",
      resource: RESOURCE,
      upstreamRefreshToken: "t0",
      expiresAt: 100 * REFRESH_LEASE_MS,
      attempt: 0,
    },
  ]);
  const run = <N extends CommandName>(name: N, args: Args<N>): Result<N> => hub.run(name, args);
  const grant = () => hub.db.contents().connectionGrants.find((row) => row.tokenHash === "g");
  const cardOf = () => hub.db.contents().clients.find((row) => row.clientId === "cl");
  let keyLive = true;
  /** The model's own statement of whether the client may use the connection now. */
  const usable = () => {
    const now = cardOf();
    return (
      now !== undefined &&
      now.connections.includes("p") &&
      !now.gates.some(
        (gate) =>
          hub.db.contents().stops.some((stop) => stop.key === gate) ||
          (gate.startsWith(NAMESPACE) && !keyLive),
      )
    );
  };
  const leased = (row: Doc<"connectionGrants"> | undefined, now: number) =>
    row?.refreshStartedAt !== undefined && row.refreshStartedAt + REFRESH_LEASE_MS > now;

  // oxlint-disable-next-line complexity -- one case per action of the alphabet, each with its property checks.
  const apply = (model: Model, action: Action): Model => {
    hub.db.restore(model.snapshot);
    hub.setNow(model.now);
    keyLive = model.keyLive;
    const { now } = model;
    const liveGates = [{ prefix: NAMESPACE, live: keyLive ? ["key:b"] : [] }];
    const before = grant();
    let next: Omit<Model, "snapshot"> = { ...model };
    switch (action.kind) {
      case "claim": {
        const wasUsable = usable();
        const result = run("connections.claimRefresh", {
          ...auth,
          tokenHash: "g",
          providers: PROVIDERS,
          liveGates,
          now,
        });
        const after = grant();
        if (result.ok) {
          // One attempt at a time: an admission takes a free or run-out lease, with the next number.
          expect(wasUsable && before !== undefined && !leased(before, now)).toBe(true);
          expect(after?.attempt).toBe((before?.attempt ?? 0) + 1);
          expect(after?.refreshStartedAt).toBe(now);
          expect(result.upstreamRefreshToken).toBe(before?.upstreamRefreshToken);
          next = { ...next, attempts: [...model.attempts, result.attempt].slice(-2) };
        } else {
          expect(after).toEqual(before);
          if (result.error === "temporarily_unavailable") {
            expect(wasUsable && leased(before, now)).toBe(true);
          }
          // A contender is never told that a grant that exists is dead (design version 2 item 5).
          if (result.error === "invalid_grant") {
            expect(before).toBeUndefined();
          }
        }
        if (wasUsable && before !== undefined) {
          expect(result.ok || result.error === "temporarily_unavailable").toBe(true);
        }
        break;
      }
      case "finish": {
        const attempt = model.attempts.at(-1 - action.which);
        if (attempt === undefined) return model;
        const result = run("connections.finishRefresh", {
          tokenHash: "g",
          attempt,
          ...(action.rotated ? { refreshToken: `t${attempt}` } : {}),
          providers: PROVIDERS,
          liveGates,
          now,
        });
        const after = grant();
        if (before === undefined) {
          // A deleted or revoked grant stays gone.
          expect([result, after]).toEqual(["gone", undefined]);
        } else if (before.attempt !== attempt) {
          // A stale attempt's success writes nothing.
          expect([result, after]).toEqual(["stale", before]);
        } else {
          // The current attempt's rotation is saved whether or not the token is released.
          expect(after?.upstreamRefreshToken).toBe(
            action.rotated ? `t${attempt}` : before.upstreamRefreshToken,
          );
          expect(after?.refreshStartedAt).toBeUndefined();
          expect(result).toBe(usable() ? "released" : "refused");
        }
        break;
      }
      case "fail": {
        const attempt = model.attempts.at(-1 - action.which);
        if (attempt === undefined) return model;
        const result = run("connections.failRefresh", {
          tokenHash: "g",
          attempt,
          rejected: action.rejected,
          now,
        });
        const after = grant();
        if (before === undefined) {
          expect([result, after]).toEqual(["gone", undefined]);
        } else if (before.attempt !== attempt || before.refreshStartedAt === undefined) {
          // A stale failure writes nothing and is retryable.
          expect([result, after]).toEqual(["retry", before]);
        } else if (!action.rejected) {
          expect(result).toBe("retry");
          expect(after).toEqual({ ...before, refreshStartedAt: undefined });
        } else if (leased(before, now)) {
          // Only the provider's refusal of the current attempt, while its lease holds, ends it.
          expect([result, after]).toEqual(["rejected", undefined]);
        } else {
          expect([result, after]).toEqual(["retry", before]);
        }
        break;
      }
      case "revoke": {
        const authenticated = run("connections.revoke", { ...auth, tokenHash: "g" });
        expect(authenticated).toBe(cardOf() !== undefined);
        expect(grant()).toBeUndefined();
        break;
      }
      case "tick": {
        const later = TIMES.find((time) => time > now);
        if (later === undefined) return model;
        next = { ...next, now: later };
        break;
      }
      case "stop":
        if (hub.db.contents().stops.some((stop) => stop.key === "gate:a")) {
          remove(hub, "stops", "by_key", ["gate:a"]);
        } else {
          seed(hub, "stops", [{ key: "gate:a", at: now }]);
        }
        break;
      case "live":
        next = { ...next, keyLive: !keyLive };
        break;
      case "connection":
        if (cardOf() === undefined) return model;
        patch(hub, "clients", "by_client_id", ["cl"], (doc) => ({
          ...doc,
          connections: doc.connections.length === 0 ? ["p"] : [],
        }));
        break;
      case "deleteCard": {
        if (cardOf() === undefined) return model;
        expect(run("stack.remove", { clientId: "cl", registrationTokenHash: "rt" })).toEqual({
          ok: true,
        });
        // No grant outlives its card.
        expect(grant()).toBeUndefined();
        break;
      }
      case "cleanup":
        run("connections.cleanup", { now });
        break;
      default:
        return action satisfies never;
    }
    const after = grant();
    if (model.gone) {
      expect(after).toBeUndefined();
    }
    // The attempt count never goes back.
    if (before !== undefined && after !== undefined) {
      expect(after.attempt).toBeGreaterThanOrEqual(before.attempt);
    }
    return { ...next, gone: model.gone || after === undefined, snapshot: hub.db.snapshot() };
  };

  const keyOf = (model: Model) =>
    JSON.stringify([hub.db.contents(), model.now, model.attempts, model.keyLive, model.gone]);

  const start: Model = {
    snapshot: hub.db.snapshot(),
    now: 0,
    attempts: [],
    keyLive: true,
    gone: false,
  };
  hub.db.restore(start.snapshot);
  const seen = new Set<string>([keyOf(start)]);
  let frontier: Array<Model> = [start];
  let transitions = 0;
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const nextFrontier: Array<Model> = [];
    for (const model of frontier) {
      for (const action of ACTIONS) {
        const next = apply(model, action);
        transitions += 1;
        if (next === model) continue;
        hub.db.restore(next.snapshot);
        const key = keyOf(next);
        if (!seen.has(key)) {
          seen.add(key);
          nextFrontier.push(next);
        }
      }
    }
    frontier = nextFrontier;
  }
  return { states: seen.size, transitions, alphabet: ACTIONS.length };
};

const depthOf = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

describe("the connection grant", () => {
  test("every lease property holds in every reachable state", () => {
    // Depth 14 (31,223 states) takes about 5 s on the development Mac: two attempts of one grant,
    // each admitted, failed or finished, with a stop, a gate, the connection and the clock moving
    // around them.
    const result = search(depthOf("GRANT_MACHINE_DEPTH", 14));
    console.log("connection grant", result);
    expect(result.states).toBeGreaterThan(1);
  }, 300_000);
});
