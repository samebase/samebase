// Proof 2: a breadth-first bounded check of the authorization request machine over the memory
// Store. Every reachable state up to a fixed depth is visited once (states compared by content),
// and the properties of design section 6 are asserted on every transition.
import { describe, expect, test } from "vite-plus/test";
import { makeMemoryStore } from "../hosts/memory.ts";
import type { Args, CommandName, Result } from "../store/Store.ts";
import type { Doc } from "../store/tables.ts";
import type { MemorySnapshot } from "../store/memory.ts";
import { patch, remove, seed } from "./testing.ts";

const REQUEST_MS = 600_000;
const CODE_MS = 60_000;
/** The clock moves along these points only, across each expiry of a request made at 0 or 30 s. */
const TIMES = [0, 30_000, 60_000, 600_000, 630_000, 700_000];
const CONNECTORS = ["g", "h"];
const redirectUri = "https://app.test/cb";

interface Model {
  readonly snapshot: MemorySnapshot;
  readonly now: number;
  readonly paused: boolean;
  /** The request ids created so far: a request id is random, so it is never created twice. */
  readonly created: ReadonlyArray<string>;
  /** Successful exchanges per request id. */
  readonly redeemed: Readonly<Record<string, number>>;
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
  | { readonly kind: "block" }
  | { readonly kind: "pause" }
  | { readonly kind: "transfer" }
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
  { kind: "block" },
  { kind: "pause" },
  { kind: "transfer" },
  { kind: "cleanup" },
];

const client = (clientId: string, secretHash: string): Doc<"clients"> => ({
  clientId,
  appId: "app",
  secretHash,
  tokenEndpointAuthMethod: "client_secret_post",
  redirectUris: [redirectUri, "https://app.test/other"],
  deploymentType: "production",
  clientName: "prod",
  softwareVersion: "1",
  createdAt: 0,
  registrationTokenHash: "rt",
  renewedAt: 0,
  app: "app",
  registeredBy: {
    kind: "github",
    githubRepository: "o/r",
    githubOwnerId: "65",
    githubActorId: "1",
    githubActorLogin: "a",
    commitSha: "c",
  },
  connectors: CONNECTORS,
});

const ownerBlock: Doc<"blocks"> = {
  kind: "owner",
  githubId: "65",
  reason: "r",
  adminEmail: "a@b",
  at: 0,
};

/** One state search: the alphabet over `requestIds`, every state up to `depth` steps from the start. */
const search = (requestIds: ReadonlyArray<string>, depth: number) => {
  const hub = makeMemoryStore({ now: 0 });
  seed(hub, "tenants", [{ tenantId: "gh-1", ownerId: "65" }]);
  seed(hub, "apps", [{ appId: "app", name: "app", tenantId: "gh-1", createdAt: 0 }]);
  seed(hub, "clients", [client("cl", "sec"), client("cl2", "sec2")]);
  const actions = alphabet(requestIds);

  const run = <N extends CommandName>(name: N, args: Args<N>): Result<N> => hub.run(name, args);
  const docs = () => hub.db.contents();
  const requestOf = (r: string) => docs().authRequests.find((request) => request.requestId === r);
  const codeOf = (r: string) => docs().authorizationCodes.find((code) => code.requestId === r);
  const blockExists = () => docs().blocks.length > 0;
  /** The owner block stops the tenant while owner 65 is its recorded owner. */
  const blocked = () => blockExists() && docs().tenants.at(0)?.ownerId === "65";
  const stale = () => docs().tenants.at(0)?.ownerId !== "65";

  // oxlint-disable-next-line complexity -- one case per action of the alphabet, each with its property checks.
  const apply = (model: Model, action: Action): Model => {
    hub.db.restore(model.snapshot);
    hub.setNow(model.now);
    const { now } = model;
    const policy = {
      ownerId: "65",
      paused: model.paused,
      connectors: CONNECTORS,
      configured: CONNECTORS,
    };
    const stopped = blocked() || stale() || model.paused;
    let next: Omit<Model, "snapshot"> = {
      now,
      paused: model.paused,
      created: model.created,
      redeemed: model.redeemed,
    };
    switch (action.kind) {
      case "create": {
        if (model.created.includes(action.r)) {
          return model;
        }
        const result = run("authRequests.create", {
          tenantId: "gh-1",
          requestId: action.r,
          appId: "app",
          clientId: "cl",
          redirectUri,
          scope: "openid",
          codeChallenge: `challenge-${action.r}`,
          connectors: CONNECTORS,
          policy,
          freshLogin: false,
          txnCookieHash: `cookie-${action.r}`,
          createdAt: now,
          expiresAt: now + REQUEST_MS,
        });
        // The create step fences the block only; the core decides pause and owner before it.
        if (blocked()) expect(result.ok).toBe(false);
        next = { ...next, created: result.ok ? [...model.created, action.r] : model.created };
        break;
      }
      case "start": {
        const before = requestOf(action.r);
        const result = run("authRequests.startUpstream", {
          requestId: action.r,
          connector: action.connector,
          upstreamStateHash: stateHash(action.r, action.connector, action.k),
          upstreamCodeVerifier: `verifier-${action.k}`,
          policy,
          now,
        });
        if (result.ok) {
          expect(stopped).toBe(false);
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
        const result = run("authRequests.claimUpstream", {
          upstreamStateHash: hash,
          connector: action.asConnector,
          txnCookieHashes: action.cookie ? [`cookie-${action.r}`] : ["cookie-of-another-browser"],
          policy,
          now,
        });
        if (result.status === "claimed") {
          expect(stopped).toBe(false);
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
        const result = run("authRequests.complete", {
          requestId: action.r,
          identity: { connector, upstreamId: "user" },
          authTime: now,
          codeHash: `code-${action.r}`,
          codeExpiresAt: now + CODE_MS,
          policy,
          now,
        });
        if (result.ok) {
          expect(stopped).toBe(false);
          expect(before?.status).toBe("claimed");
          expect(before !== undefined && before.expiresAt > now).toBe(true);
        }
        if (!result.ok && result.error === "refused") {
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
        const { variant } = action;
        const result = run("authRequests.exchangeCode", {
          clientId: variant === "otherClient" ? "cl2" : "cl",
          clientSecretHash:
            variant === "otherClient" ? "sec2" : variant === "badSecret" ? "bad" : "sec",
          tokenEndpointAuthMethod: "client_secret_post",
          codeHash: `code-${action.r}`,
          redirectUri: variant === "badRedirect" ? "https://app.test/other" : redirectUri,
          codeChallengeOfVerifier:
            variant === "badVerifier" ? "challenge-other" : `challenge-${action.r}`,
          policy,
          now,
        });
        if (result.ok) {
          expect(stopped).toBe(false);
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
          !stopped
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
      case "block":
        if (blockExists()) {
          remove(hub, "blocks", "by_kind_and_github_id", ["owner", "65"]);
        } else {
          seed(hub, "blocks", [ownerBlock]);
        }
        break;
      case "pause":
        next = { ...next, paused: !model.paused };
        break;
      case "transfer":
        patch(hub, "tenants", "by_tenant_id", ["gh-1"], (tenant) => ({
          ...tenant,
          ownerId: tenant.ownerId === "65" ? "66" : "65",
        }));
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
    JSON.stringify([hub.db.contents(), model.now, model.paused, model.created, model.redeemed]);

  const start: Model = {
    snapshot: hub.db.snapshot(),
    now: 0,
    paused: false,
    created: [],
    redeemed: {},
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
    // Depth 16 visits every reachable state: the last levels add none.
    const result = search(["r1"], depthOf("MACHINE_DEPTH_ONE", 16));
    console.log("one request", result);
    expect(result.states).toBeGreaterThan(1);
  }, 120_000);

  test("two requests: every property holds in every reachable state", () => {
    // Depth 9 takes about 15 s on the development Mac and about 3.5 times that on a CI runner.
    // Depth 10 (70,742 states, MACHINE_DEPTH_TWO=10) takes about 127 s there, above the limit.
    const result = search(["r1", "r2"], depthOf("MACHINE_DEPTH_TWO", 9));
    console.log("two requests", result);
    expect(result.states).toBeGreaterThan(1);
  }, 120_000);
});
