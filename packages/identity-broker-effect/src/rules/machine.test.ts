// Proof 2: a breadth-first bounded check of the authorization request machine over the memory
// Store. Every reachable state up to a fixed depth is visited once (states compared by content),
// and the properties of design section 6 are asserted on every transition. Between any two steps
// of a sign-in, a stop on either of the card's two gates can commit or go, the gate in a layer's
// namespace can leave the layer's live gates or come back, a connector can leave the card or come
// back, the request's return address can leave the card or come back, and the
// card's `confirm` can flip: each step must read the card as it is.
import { describe, expect, test } from "vite-plus/test";
import { makeMemoryStore } from "../hosts/memory.ts";
import type { Args, CommandName, Result } from "../store/commands.ts";
import type { MemorySnapshot } from "../store/memory.ts";
import type { Doc } from "../store/tables.ts";
import { patch, remove, seed } from "./testing.ts";

const REQUEST_MS = 600_000;
const CODE_MS = 60_000;
/** The clock moves along these points only, across each expiry of a request made at 0 or 30 s. */
const TIMES = [0, 30_000, 60_000, 600_000, 630_000, 700_000];
const CONNECTORS = ["g", "h"];
/** `key:b` is in the namespace `key:` of a layer, which gives its live gates with each step. */
const GATES = ["gate:a", "key:b"];
const NAMESPACE = "key:";
const redirectUri = "https://app.test/cb";
const otherUri = "https://app.test/other";

interface Model {
  readonly snapshot: MemorySnapshot;
  readonly now: number;
  /** The request ids created so far: a request id is random, so it is never created twice. */
  readonly created: ReadonlyArray<string>;
  /** Successful exchanges per request id. */
  readonly redeemed: Readonly<Record<string, number>>;
  /** The layer's live gates hold `key:b`. */
  readonly keyLive: boolean;
}

type Action =
  | { readonly kind: "create"; readonly r: string }
  | { readonly kind: "start"; readonly r: string; readonly connector: string; readonly k: number }
  | {
      readonly kind: "claim";
      readonly r: string;
      readonly connector: string;
      readonly k: number;
      readonly asConnector: string;
      readonly cookie: boolean;
    }
  | { readonly kind: "complete"; readonly r: string }
  | { readonly kind: "abandon"; readonly r: string }
  | {
      readonly kind: "exchange";
      readonly r: string;
      readonly variant: "right" | "otherClient" | "badSecret" | "badRedirect" | "badVerifier";
    }
  | { readonly kind: "tick" }
  /** A stop on one gate of the card commits, or goes. */
  | { readonly kind: "stop"; readonly gate: string }
  /** `key:b` leaves the layer's live gates, or comes back. */
  | { readonly kind: "live" }
  /** The layer takes `h` off the card, or puts it back. */
  | { readonly kind: "connector" }
  /** The layer takes the request's return address off the card, or puts it back. */
  | { readonly kind: "redirect" }
  /** The layer flips the card's `confirm`. */
  | { readonly kind: "confirm" }
  | { readonly kind: "cleanup" };

const stateHash = (r: string, connector: string, k: number) => `s-${r}-${connector}-${k}`;

const alphabet = (requestIds: ReadonlyArray<string>): ReadonlyArray<Action> => [
  ...requestIds.flatMap((r): Array<Action> => [
    { kind: "create", r },
    ...CONNECTORS.flatMap((connector) =>
      [1, 2].map((k): Action => ({ kind: "start", r, connector, k })),
    ),
    ...CONNECTORS.flatMap((connector) =>
      [1, 2].flatMap((k) =>
        CONNECTORS.flatMap((asConnector) =>
          [true, false].map((cookie): Action => ({
            kind: "claim",
            r,
            connector,
            k,
            asConnector,
            cookie,
          })),
        ),
      ),
    ),
    { kind: "complete", r },
    { kind: "abandon", r },
    ...(["right", "otherClient", "badSecret", "badRedirect", "badVerifier"] as const).map(
      (variant): Action => ({ kind: "exchange", r, variant }),
    ),
  ]),
  { kind: "tick" },
  ...GATES.map((gate): Action => ({ kind: "stop", gate })),
  { kind: "live" },
  { kind: "connector" },
  { kind: "redirect" },
  { kind: "confirm" },
  { kind: "cleanup" },
];

const card = (clientId: string, secretHash: string): Doc<"clients"> => ({
  clientId,
  redirectUris: [redirectUri, otherUri],
  tokenEndpointAuthMethod: "client_secret_post",
  secretHash,
  connectors: CONNECTORS,
  gates: GATES,
  confirm: true,
  budget: "test:app",
  ref: "test:app",
  createdAt: 0,
});

/** One state search: the alphabet over `requestIds`, every state up to `depth` steps from the start. */
const search = (requestIds: ReadonlyArray<string>, depth: number) => {
  const hub = makeMemoryStore({ now: 0 });
  seed(hub, "clients", [card("cl", "sec"), card("cl2", "sec2")]);
  const actions = alphabet(requestIds);

  const run = <N extends CommandName>(name: N, args: Args<N>): Result<N> => hub.run(name, args);
  const docs = () => hub.db.contents();
  const requestOf = (r: string) => docs().authRequests.find((request) => request.requestId === r);
  const codeOf = (r: string) => docs().authorizationCodes.find((code) => code.requestId === r);
  const cardOf = () => docs().clients.find((client) => client.clientId === "cl");
  /** Whether the layer's live gates hold `key:b` in the step being applied. */
  let keyLive = true;
  /** A stop holds a gate of the card, or a gate of the card left the layer's live gates. */
  const stopped = () =>
    cardOf()?.gates.some(
      (gate) =>
        docs().stops.some((stop) => stop.key === gate) || (gate.startsWith(NAMESPACE) && !keyLive),
    ) ?? true;
  /**
   * Whether `request` may go on with `connector` as the card is now: the model's own statement of
   * the three refusals, read from the rows before the step.
   */
  const usable = (
    request: { readonly redirectUri: string; readonly connectors: ReadonlyArray<string> },
    connector: string,
  ) => {
    const now = cardOf();
    return (
      now !== undefined &&
      !stopped() &&
      now.redirectUris.includes(request.redirectUri) &&
      request.connectors.includes(connector) &&
      now.connectors.includes(connector) &&
      CONNECTORS.includes(connector)
    );
  };

  // oxlint-disable-next-line complexity -- one case per action of the alphabet, each with its property checks.
  const apply = (model: Model, action: Action): Model => {
    hub.db.restore(model.snapshot);
    hub.setNow(model.now);
    const { now } = model;
    keyLive = model.keyLive;
    const liveGates = [{ prefix: NAMESPACE, live: keyLive ? ["key:b"] : [] }];
    let next: Omit<Model, "snapshot"> = {
      now,
      created: model.created,
      redeemed: model.redeemed,
      keyLive,
    };
    switch (action.kind) {
      case "create": {
        if (model.created.includes(action.r)) {
          return model;
        }
        const before = cardOf();
        const result = run("authRequests.create", {
          requestId: action.r,
          clientId: "cl",
          redirectUri,
          scope: "openid",
          codeChallenge: `challenge-${action.r}`,
          requested: [],
          configured: CONNECTORS,
          liveGates,
          freshLogin: false,
          txnCookieHash: `cookie-${action.r}`,
          createdAt: now,
          expiresAt: now + REQUEST_MS,
        });
        if (result.ok) {
          expect(stopped()).toBe(false);
          expect(before?.redirectUris.includes(redirectUri)).toBe(true);
          // The set and `confirm` are the card's of this step.
          expect(result.connectors).toEqual(before?.connectors);
          expect(result.confirm).toBe(before?.confirm);
          expect(requestOf(action.r)).toMatchObject({ connectors: before?.connectors });
        } else if (result.error === "stopped") {
          expect(stopped()).toBe(true);
        } else if (result.error === "redirect_uri") {
          expect(before?.redirectUris.includes(redirectUri)).toBe(false);
        }
        // A card that may start a sign-in gets the request: the budget is far from empty here.
        if (!stopped() && before?.redirectUris.includes(redirectUri) === true) {
          expect(result.ok).toBe(true);
        }
        next = { ...next, created: result.ok ? [...model.created, action.r] : model.created };
        break;
      }
      case "start": {
        const before = requestOf(action.r);
        const allowed = before !== undefined && usable(before, action.connector);
        const result = run("authRequests.startUpstream", {
          requestId: action.r,
          connector: action.connector,
          upstreamStateHash: stateHash(action.r, action.connector, action.k),
          upstreamCodeVerifier: `verifier-${action.k}`,
          configured: CONNECTORS,
          liveGates,
          now,
        });
        if (result.ok) {
          expect(allowed).toBe(true);
          expect(before !== undefined && before.expiresAt > now).toBe(true);
          expect(before?.status === "pending" || before?.status === "upstream").toBe(true);
        }
        break;
      }
      case "claim": {
        const hash = stateHash(action.r, action.connector, action.k);
        const before = docs().authRequests.find(
          (request) => request.status === "upstream" && request.upstreamStateHash === hash,
        );
        const allowed = before?.status === "upstream" && usable(before, before.connector);
        const result = run("authRequests.claimUpstream", {
          upstreamStateHash: hash,
          connector: action.asConnector,
          txnCookieHashes: action.cookie ? [`cookie-${action.r}`] : ["cookie-of-another-browser"],
          configured: CONNECTORS,
          liveGates,
          now,
        });
        if (result.status === "claimed") {
          expect(allowed).toBe(true);
          // Only the latest state, from the bound browser, through the request's connector.
          expect(before?.status === "upstream" && before.connector === action.asConnector).toBe(
            true,
          );
          expect(action.cookie).toBe(true);
          expect(before !== undefined && before.expiresAt > now).toBe(true);
        }
        if (result.status === "expired" || result.status === "refused") {
          expect(requestOf(action.r)).toBeUndefined();
        }
        break;
      }
      case "complete": {
        const before = requestOf(action.r);
        const connector = before?.status === "claimed" ? before.connector : "g";
        const allowed = before !== undefined && usable(before, connector);
        const result = run("authRequests.complete", {
          requestId: action.r,
          identity: { connector, upstreamId: "user" },
          authTime: now,
          codeHash: `code-${action.r}`,
          codeExpiresAt: now + CODE_MS,
          configured: CONNECTORS,
          liveGates,
          now,
        });
        if (result.ok) {
          expect(allowed).toBe(true);
          expect(before?.status).toBe("claimed");
          expect(before !== undefined && before.expiresAt > now).toBe(true);
        }
        if (!result.ok && result.error === "refused") {
          expect(allowed).toBe(false);
          expect(requestOf(action.r)).toBeUndefined();
        }
        break;
      }
      case "abandon":
        run("authRequests.abandon", { requestId: action.r });
        expect(requestOf(action.r)).toBeUndefined();
        break;
      case "exchange": {
        const request = requestOf(action.r);
        const code = codeOf(action.r);
        const allowed =
          request?.status === "completed" && usable(request, request.identity.connector);
        const { variant } = action;
        const result = run("authRequests.exchangeCode", {
          clientId: variant === "otherClient" ? "cl2" : "cl",
          clientSecretHash:
            variant === "otherClient" ? "sec2" : variant === "badSecret" ? "bad" : "sec",
          tokenEndpointAuthMethod: "client_secret_post",
          codeHash: `code-${action.r}`,
          redirectUri: variant === "badRedirect" ? otherUri : redirectUri,
          codeChallengeOfVerifier:
            variant === "badVerifier" ? "challenge-other" : `challenge-${action.r}`,
          configured: CONNECTORS,
          liveGates,
          now,
        });
        if (result.ok) {
          expect(allowed).toBe(true);
          // codeSingleUse, and only the right client, redirect and verifier on a completed request.
          expect(model.redeemed[action.r] ?? 0).toBe(0);
          expect(variant).toBe("right");
          expect(request?.status).toBe("completed");
          expect(code !== undefined && code.usedAt === undefined && code.expiresAt > now).toBe(
            true,
          );
          next = {
            ...next,
            redeemed: { ...model.redeemed, [action.r]: (model.redeemed[action.r] ?? 0) + 1 },
          };
        }
        // A replay by the code's own authenticated client is refused and removes the marker.
        if (
          code?.usedAt !== undefined &&
          (variant === "right" || variant === "badRedirect" || variant === "badVerifier") &&
          !stopped()
        ) {
          expect(result).toMatchObject({
            ok: false,
            description: "The authorization code was already used.",
          });
          expect(codeOf(action.r)).toBeUndefined();
          expect(requestOf(action.r)).toBeUndefined();
        }
        break;
      }
      case "tick": {
        const later = TIMES.find((time) => time > now);
        if (later === undefined) {
          return model;
        }
        next = { ...next, now: later };
        break;
      }
      case "stop":
        if (docs().stops.some((stop) => stop.key === action.gate)) {
          remove(hub, "stops", "by_key", [action.gate]);
        } else {
          seed(hub, "stops", [{ key: action.gate, at: now }]);
        }
        break;
      case "live":
        next = { ...next, keyLive: !keyLive };
        break;
      case "connector":
        patch(hub, "clients", "by_client_id", ["cl"], (doc) => ({
          ...doc,
          connectors: doc.connectors.includes("h") ? ["g"] : CONNECTORS,
        }));
        break;
      case "redirect":
        patch(hub, "clients", "by_client_id", ["cl"], (doc) => ({
          ...doc,
          redirectUris: doc.redirectUris.includes(redirectUri)
            ? [otherUri]
            : [redirectUri, otherUri],
        }));
        break;
      case "confirm":
        patch(hub, "clients", "by_client_id", ["cl"], (doc) => ({ ...doc, confirm: !doc.confirm }));
        break;
      case "cleanup":
        run("lifecycle.cleanup", { now, signInRetentionMs: 90 * 86_400_000 });
        break;
      default:
        return action satisfies never;
    }
    // A claimed or completed request holds no upstream state hash, verifier or nonce.
    for (const request of docs().authRequests) {
      if (request.status === "claimed" || request.status === "completed") {
        expect(
          "upstreamStateHash" in request ||
            "upstreamCodeVerifier" in request ||
            "upstreamNonce" in request,
        ).toBe(false);
      }
    }
    return { ...next, snapshot: hub.db.snapshot() };
  };

  const keyOf = (model: Model) =>
    JSON.stringify([hub.db.contents(), model.now, model.created, model.redeemed, model.keyLive]);

  const start: Model = {
    snapshot: hub.db.snapshot(),
    now: 0,
    created: [],
    redeemed: {},
    keyLive: true,
  };
  hub.db.restore(start.snapshot);
  const seen = new Set<string>([keyOf(start)]);
  let frontier: Array<Model> = [start];
  let transitions = 0;
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const nextFrontier: Array<Model> = [];
    for (const model of frontier) {
      for (const action of actions) {
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
  return { states: seen.size, transitions, alphabet: actions.length };
};

const depthOf = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

describe("the authorization request machine", () => {
  test("one request: every property holds in every reachable state", () => {
    // Depth 12 (114,791 states) takes about 24 s on the development Mac; every step of a sign-in
    // with a card change before each of them fits in it.
    const result = search(["r1"], depthOf("MACHINE_DEPTH_ONE", 12));
    console.log("one request", result);
    expect(result.states).toBeGreaterThan(1);
  }, 120_000);

  test("two requests: every property holds in every reachable state", () => {
    // Depth 7 (57,012 states) takes about 10 s on the development Mac and about 3.5 times that on
    // a CI runner.
    const result = search(["r1", "r2"], depthOf("MACHINE_DEPTH_TWO", 7));
    console.log("two requests", result);
    expect(result.states).toBeGreaterThan(1);
  }, 120_000);
});
