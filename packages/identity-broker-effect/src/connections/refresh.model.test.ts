// The refresh lease as a property, ported from the Convex broker's refresh.model.test.ts (RFC 136
// property B) and made stronger: the fake provider spends each refresh token once, like the
// rotation of GitHub and Cloudflare, and the test holds its answer to deliver it late, lose it, or let
// the hub's commit fail after it. Random stories of connections, refreshes, stops, withdrawn
// connections and keys, self-deletes, revocations and clock steps run over HTTP against the hub on
// the stack layer, on the memory and the node:sqlite Store. After every command the hub's rows are
// held to the provider's truth: a grant that the model did not end exists, and while no attempt
// is in flight it holds the provider's live token, unless one of the design's known limits broke
// its chain (an answer lost after the provider spent the token).
import { DatabaseSync } from "node:sqlite";
import { Config, Redacted, Schema } from "effect";
import fc from "fast-check";
import { describe, expect, test, vi } from "vite-plus/test";
import { createBroker, sqliteTestStore, useTestStore } from "../core/testing/harness.ts";
import { makeMemoryStore } from "../hosts/memory.ts";
import { stack, type StackKey } from "../layers/stack/routes.ts";
import { REFRESH_LEASE_MS } from "./rules.ts";
import { connectionsPart } from "./routes.ts";
import {
  cloudflare,
  connect,
  fakeProviders,
  PROVIDERS,
  refresh,
  revoke,
  type HeldRefresh,
} from "./testing.ts";
import { REFRESH_TIMEOUT_MS } from "./upstream.ts";

const KEYS = ["production", "preview"] as const;
type KeyName = (typeof KEYS)[number];
/** The clients of every story: a production client and two previews. */
const CLIENTS = [
  { key: "production", name: "prod" },
  { key: "preview", name: "pr-1" },
  { key: "preview", name: "pr-2" },
] as const;
/** Around the call timeout of 30 s and the lease of 90 s. */
const TICKS = [1_000, 29_000, 31_000, 91_000] as const;
const OUTCOMES = ["deliver", "transient", "lose", "crash"] as const;
type Outcome = (typeof OUTCOMES)[number];

type Command =
  | { readonly kind: "authorize"; readonly client: number }
  | { readonly kind: "refreshStart"; readonly grant: number }
  | { readonly kind: "refreshFinish"; readonly attempt: number; readonly outcome: Outcome }
  | { readonly kind: "stop"; readonly key: KeyName }
  | { readonly kind: "withdraw"; readonly client: number }
  | { readonly kind: "keyGone"; readonly key: KeyName }
  | { readonly kind: "deleteOwn"; readonly client: number }
  | { readonly kind: "revoke"; readonly grant: number }
  | { readonly kind: "tick"; readonly ms: number };

const clientIndex = fc.nat({ max: CLIENTS.length - 1 });
const key = fc.constantFrom(...KEYS);
const commandArbitrary: fc.Arbitrary<Command> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("authorize"), client: clientIndex }) },
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("refreshStart"), grant: fc.nat(5) }) },
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant("refreshFinish"),
      attempt: fc.nat(5),
      outcome: fc.constantFrom(...OUTCOMES),
    }),
  },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("stop"), key }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("withdraw"), client: clientIndex }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("keyGone"), key }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("deleteOwn"), client: clientIndex }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("revoke"), grant: fc.nat(5) }) },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant("tick"), ms: fc.constantFrom(...TICKS) }),
  },
);

type Client = {
  readonly handle: string;
  readonly key: KeyName;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly registrationAccessToken: string;
  readonly permanent: boolean;
  deleted: boolean;
  withdrawn: boolean;
};

type Grant = {
  readonly handle: string;
  readonly client: Client;
  /** The hub's refresh token, the same for the grant's life. */
  readonly hubToken: string;
  ended: "revoked" | "rejected" | "deleted" | null;
  /** A known limit spent the provider's token without the hub saving its successor. */
  broken: boolean;
  /** Until when an attempt holds the lease, as the model counts it. */
  leaseUntil: number;
};

type Attempt = {
  readonly handle: string;
  readonly grant: Grant;
  readonly held: HeldRefresh;
  readonly settle: (answer: Response | Error) => void;
  readonly response: Promise<Response>;
  readonly startedAt: number;
  open: boolean;
};

const Answer = Schema.Struct({ error: Schema.optionalKey(Schema.String) });
const NewClient = Schema.Struct({
  client_id: Schema.String,
  client_secret: Schema.String,
  registration_access_token: Schema.String,
});
const Grant = Schema.Struct({ refresh_token: Schema.optionalKey(Schema.String) });

const REDIRECT = "https://app.example/oauth/hub/callback";

/** Plays one story on a fresh hub and returns each broken property, with the story's trace. */
async function play(commands: ReadonlyArray<Command>) {
  const violations: string[] = [];
  const trace: string[] = [];
  const check = (property: string, holds: boolean, detail: string) => {
    if (!holds) {
      violations.push(`${property}: ${detail}`);
    }
  };
  const keyOf = (value: string, permanent: boolean): StackKey => ({
    key: Config.succeed(Redacted.make(value)),
    permanent,
    connections: ["cloudflare"],
  });
  const settings: Record<KeyName, StackKey> = {
    production: keyOf("production-key", true),
    preview: keyOf("preview-key", false),
  };
  const keys: Record<string, StackKey> = { ...settings };
  const h = await createBroker({ registration: stack({ keys }), part: connectionsPart(PROVIDERS) });
  const providers = fakeProviders(h.fetch);
  const stops = new Set<KeyName>();
  const gone = new Set<KeyName>();
  const grants: Grant[] = [];
  const attempts: Attempt[] = [];
  let arrival: ((attempt: Pick<Attempt, "held" | "settle">) => void) | undefined;
  providers.holdRefreshes(
    (held) =>
      new Promise<Response>((resolve, reject) => {
        const settle = (answer: Response | Error) =>
          answer instanceof Response ? resolve(answer) : reject(answer);
        if (arrival === undefined) {
          reject(new Error("A refresh reached the provider with no attempt waiting"));
        } else {
          arrival({ held, settle });
        }
      }),
  );

  const clients: Client[] = [];
  for (const [index, spec] of CLIENTS.entries()) {
    const response = await h.fetchBroker(`${h.issuer}/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${spec.key}-key`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        redirect_uris: [REDIRECT],
        software_id: "apps/model",
        software_version: "1",
        client_name: spec.name,
        deployment_type: spec.key === "production" ? "production" : "preview",
        token_endpoint_auth_method: "client_secret_post",
      }),
    });
    const answer = Schema.decodeUnknownSync(NewClient)(await response.json());
    clients.push({
      handle: `C${index + 1}`,
      key: spec.key,
      clientId: answer.client_id,
      clientSecret: answer.client_secret,
      redirectUri: REDIRECT,
      registrationAccessToken: answer.registration_access_token,
      permanent: spec.key === "production",
      deleted: false,
      withdrawn: false,
    });
  }

  /** Why the client may get no provider token now, or null. */
  const stopReason = (client: Client) =>
    client.deleted
      ? `${client.handle} deleted itself`
      : stops.has(client.key)
        ? `the key ${client.key} is stopped`
        : gone.has(client.key)
          ? `the key ${client.key} left the settings`
          : client.withdrawn
            ? `${client.handle}'s connection was withdrawn`
            : null;
  const rows = () => h.memory.db.contents().connectionGrants;
  const errorOf = async (response: Response) =>
    Schema.decodeUnknownSync(Answer)(await response.clone().json()).error;

  /** What a refresh answer may be, for a grant whose attempt ended now. */
  const checkRefreshAnswer = async (label: string, grant: Grant, response: Response) => {
    const stop =
      stopReason(grant.client) ?? (grant.ended === null ? null : `it was ${grant.ended}`);
    check(
      "noTokenAfterStop",
      !(response.status === 200 && stop !== null),
      `${label} answered a provider token after ${stop ?? ""}`,
    );
    if (response.status === 400 && (await errorOf(response)) === "invalid_grant") {
      check(
        "onlyADeadGrantIsRefused",
        grant.ended !== null || grant.broken,
        `${label} answered invalid_grant for ${grant.handle}, whose chain is whole`,
      );
      grant.ended = grant.ended ?? "rejected";
      grant.leaseUntil = 0;
    }
  };

  /** Releases a held attempt with `outcome`, and checks the hub's answer. */
  const finish = async (attempt: Attempt, outcome: Outcome | "timeout") => {
    const { grant, held } = attempt;
    attempt.open = false;
    const label = `finish ${attempt.handle} (${grant.handle}) with ${outcome}`;
    switch (outcome) {
      case "deliver":
        attempt.settle(held.answer);
        break;
      case "transient":
        attempt.settle(held.unavailable());
        break;
      case "lose":
      case "timeout":
        // The provider spent the token on arrival, and its answer never reached the hub.
        attempt.settle(
          outcome === "lose"
            ? new TypeError("fetch failed")
            : new DOMException("The operation timed out.", "TimeoutError"),
        );
        grant.broken ||= held.spent;
        break;
      case "crash":
        // The provider rotated the token, and the hub's commit after its answer failed.
        h.failCommands(
          (name) => name === "connections.finishRefresh" || name === "connections.failRefresh",
        );
        attempt.settle(held.answer);
        grant.broken ||= held.spent;
        break;
      default:
        return outcome satisfies never;
    }
    const response = await attempt.response;
    h.failCommands(null);
    trace.push(`${label}: ${response.status} ${(await errorOf(response)) ?? ""}`);
    check("noServerError", response.status !== 500 || outcome === "crash", `${label} answered 500`);
    // The hub ends the lease in every case but a failed commit.
    if (outcome !== "crash") {
      grant.leaseUntil = 0;
    }
    await checkRefreshAnswer(label, grant, response);
  };

  /** Advances the clock to `to`, ending each held attempt at its call timeout on the way. */
  const advanceTo = async (to: number) => {
    for (;;) {
      const due = attempts
        .filter((attempt) => attempt.open && attempt.startedAt + REFRESH_TIMEOUT_MS <= to)
        .sort((a, b) => a.startedAt - b.startedAt)
        .at(0);
      if (due === undefined) {
        break;
      }
      h.clock.set(due.startedAt + REFRESH_TIMEOUT_MS);
      await finish(due, "timeout");
    }
    h.clock.set(to);
  };

  // oxlint-disable-next-line complexity -- one case per command of the story, each with its property checks.
  const playCommand = async (command: Command) => {
    switch (command.kind) {
      case "authorize": {
        const client = clients.at(command.client);
        if (client === undefined) return;
        const stop = stopReason(client);
        const response = await connect(h, client, cloudflare.resource);
        const label = `authorize ${client.handle}`;
        check(
          "noTokenAfterStop",
          !(response.status === 200 && stop !== null),
          `${label} answered a token after ${stop ?? ""}`,
        );
        const answer =
          response.status === 200 ? Schema.decodeUnknownSync(Grant)(await response.json()) : {};
        if (answer.refresh_token === undefined) {
          trace.push(`${label}: ${response.status}`);
          return;
        }
        const grant: Grant = {
          handle: `G${grants.length + 1}`,
          client,
          hubToken: answer.refresh_token,
          ended: null,
          broken: false,
          leaseUntil: 0,
        };
        grants.push(grant);
        trace.push(`${label}: 200, ${grant.handle}`);
        return;
      }
      case "refreshStart": {
        const grant = grants.at(command.grant % Math.max(1, grants.length));
        if (grant === undefined) return;
        const label = `refresh ${grant.handle} (${grant.client.handle})`;
        const now = h.clock.now();
        const reached = new Promise<Pick<Attempt, "held" | "settle">>((resolve) => {
          arrival = resolve;
        });
        const response = refresh(h, grant.client, grant.hubToken);
        const first = await Promise.race([
          reached.then((held) => ({ held })),
          response.then((done) => ({ done })),
        ]);
        arrival = undefined;
        if ("done" in first) {
          const error = await errorOf(first.done);
          trace.push(`${label}: ${first.done.status} ${error ?? ""}, the provider saw nothing`);
          // A contender is told to retry exactly while an attempt holds the lease.
          if (first.done.status === 503) {
            check(
              "retryOnlyWhileLeased",
              error === "temporarily_unavailable" && now < grant.leaseUntil,
              `${label} answered 503 with no lease held`,
            );
          }
          await checkRefreshAnswer(label, grant, first.done);
          return;
        }
        const stop =
          stopReason(grant.client) ?? (grant.ended === null ? null : `it was ${grant.ended}`);
        check("noRefreshWhenStopped", stop === null, `${label} reached the provider after ${stop}`);
        check(
          "oneAttemptAtATime",
          !(now < grant.leaseUntil),
          `${label} reached the provider while another attempt held the lease`,
        );
        const attempt: Attempt = {
          handle: `A${attempts.length + 1}`,
          grant,
          held: first.held.held,
          settle: first.held.settle,
          response,
          startedAt: now,
          open: true,
        };
        attempts.push(attempt);
        grant.leaseUntil = now + REFRESH_LEASE_MS;
        trace.push(`${label}: ${attempt.handle} held at the provider`);
        return;
      }
      case "refreshFinish": {
        const open = attempts.filter((attempt) => attempt.open);
        const attempt = open.at(command.attempt % Math.max(1, open.length));
        if (attempt === undefined) return;
        await finish(attempt, command.outcome);
        return;
      }
      case "stop": {
        const on = !stops.has(command.key);
        await h.setStop(`stack:${command.key}`, on);
        if (on) stops.add(command.key);
        else stops.delete(command.key);
        trace.push(`${on ? "stop" : "unstop"} ${command.key}`);
        return;
      }
      case "withdraw": {
        const client = clients.at(command.client);
        if (client === undefined || client.deleted) return;
        client.withdrawn = !client.withdrawn;
        await h.editCard(client.clientId, (card) => ({
          ...card,
          connections: client.withdrawn ? [] : ["cloudflare"],
        }));
        trace.push(`${client.withdrawn ? "withdraw" : "restore"} ${client.handle}'s connection`);
        return;
      }
      case "keyGone": {
        if (gone.has(command.key)) {
          gone.delete(command.key);
          keys[command.key] = settings[command.key];
        } else {
          gone.add(command.key);
          delete keys[command.key];
        }
        trace.push(`key ${command.key} ${gone.has(command.key) ? "removed" : "back"}`);
        return;
      }
      case "deleteOwn": {
        const client = clients.at(command.client);
        if (client === undefined) return;
        const response = await h.fetchBroker(`${h.issuer}/register/${client.clientId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${client.registrationAccessToken}` },
        });
        const expected = client.deleted ? 401 : client.permanent ? 403 : 204;
        trace.push(`self-delete ${client.handle}: ${response.status}`);
        check("selfDelete", response.status === expected, `answered ${response.status}`);
        if (response.status === 204) {
          client.deleted = true;
          for (const grant of grants.filter((each) => each.client === client)) {
            grant.ended = grant.ended ?? "deleted";
          }
          const left = rows().filter((row) => row.clientId === client.clientId).length;
          check("deletedClientHasNoGrants", left === 0, `${client.handle} kept ${left} grant(s)`);
        }
        return;
      }
      case "revoke": {
        const grant = grants.at(command.grant % Math.max(1, grants.length));
        if (grant === undefined) return;
        const response = await revoke(h, grant.client, grant.hubToken);
        trace.push(`revoke ${grant.handle}: ${response.status}`);
        // A stopped client still revokes its own grant; a deleted one cannot authenticate.
        const expected = grant.client.deleted ? 401 : 200;
        check("revoke", response.status === expected, `answered ${response.status}`);
        if (response.status === 200) {
          grant.ended = grant.ended ?? "revoked";
        }
        return;
      }
      case "tick":
        await advanceTo(h.clock.now() + command.ms);
        trace.push(`tick ${command.ms / 1000} s`);
        return;
      default:
        return command satisfies never;
    }
  };

  /**
   * After each command: each grant that the model did not end has its row, and an ended grant
   * has none; a row with no attempt in flight holds the provider's live token unless a known limit
   * broke its chain.
   */
  const rowsMatch = async () => {
    const stored = rows();
    for (const grant of grants) {
      const hash = await sha256(grant.hubToken);
      const row = stored.find((each) => each.tokenHash === hash);
      check(
        "grantRowFollowsTheModel",
        (row === undefined) === (grant.ended !== null),
        `${grant.handle} is ${grant.ended ?? "live"} but its row ${row === undefined ? "is gone" : "exists"}`,
      );
      const inFlight = attempts.some((attempt) => attempt.open && attempt.grant === grant);
      if (row !== undefined && !grant.broken && !inFlight && row.refreshStartedAt === undefined) {
        check(
          "hubHoldsTheLiveToken",
          providers.isLive(row.upstreamRefreshToken),
          `${grant.handle} holds a provider token that the provider spent`,
        );
      }
    }
  };

  // The hub logs each failed provider call by its error name; a story makes many on purpose.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  try {
    for (const command of commands) {
      await playCommand(command);
      await rowsMatch();
    }
  } finally {
    for (const attempt of attempts.filter((each) => each.open)) {
      attempt.open = false;
      attempt.settle(new Response(null, { status: 503 }));
      await attempt.response.catch(() => undefined);
    }
    vi.restoreAllMocks();
  }
  check("noUnexpectedRequest", h.fetch.unexpected.length === 0, h.fetch.unexpected.join("; "));
  return { violations, trace };
}

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const useMemory = () =>
  useTestStore((now) => {
    const memory = makeMemoryStore({ now });
    return { ...memory, seed: async (body) => memory.withTx(body) };
  });
const useSqlite = () => useTestStore((now) => sqliteTestStore(new DatabaseSync(":memory:"), now));

describe.each([
  ["memory", useMemory],
  ["node:sqlite", useSqlite],
] as const)("the refresh lease on the %s Store", (_name, useStore) => {
  test("keeps every property in random stories", async () => {
    useStore();
    await fc.assert(
      fc.asyncProperty(
        fc.array(commandArbitrary, { minLength: 1, maxLength: 30, size: "max" }),
        async (commands) => {
          const { violations, trace } = await play(commands);
          if (violations.length > 0) {
            throw new Error(`${violations.join("\n")}\ntrace:\n${trace.join("\n")}`);
          }
        },
      ),
      // 600 stories take about 2 s here; a lease shorter than the call timeout fails in about 50,
      // a rotation dropped under a stop in about 150.
      { numRuns: 600 },
    );
  }, 300_000);

  // The sequence of the design review: an attempt spends the provider's token and its answer
  // comes late; a second refresh in between must be told to retry, not lose the grant.
  test("a contender during a late answer is told to retry, and the grant survives", async () => {
    useStore();
    const { violations, trace } = await play([
      { kind: "authorize", client: 0 },
      { kind: "refreshStart", grant: 0 },
      { kind: "tick", ms: 29_000 },
      { kind: "refreshStart", grant: 0 },
      { kind: "refreshFinish", attempt: 0, outcome: "deliver" },
      { kind: "refreshStart", grant: 0 },
      { kind: "refreshFinish", attempt: 0, outcome: "deliver" },
    ]);
    expect(violations).toEqual([]);
    expect(trace.slice(3)).toEqual([
      "refresh G1 (C1): 503 temporarily_unavailable, the provider saw nothing",
      "finish A1 (G1) with deliver: 200 ",
      "refresh G1 (C1): A2 held at the provider",
      "finish A2 (G1) with deliver: 200 ",
    ]);
  });

  test("a stop during a refresh keeps the rotation, so an unstop restores the grant", async () => {
    useStore();
    const { violations, trace } = await play([
      { kind: "authorize", client: 1 },
      { kind: "refreshStart", grant: 0 },
      { kind: "stop", key: "preview" },
      { kind: "refreshFinish", attempt: 0, outcome: "deliver" },
      { kind: "stop", key: "preview" },
      { kind: "refreshStart", grant: 0 },
      { kind: "refreshFinish", attempt: 0, outcome: "deliver" },
    ]);
    expect(violations).toEqual([]);
    expect(trace.at(3)).toBe("finish A1 (G1) with deliver: 401 invalid_client");
    expect(trace.at(-1)).toBe("finish A2 (G1) with deliver: 200 ");
  });

  // The known limit of design version 2 item 5: an attempt whose outcome stays unknown past its
  // lease can cost one reconnect. Until the lease ends, a contender is told to retry.
  test("a failed commit holds the lease until it ends, then costs the grant", async () => {
    useStore();
    const { violations, trace } = await play([
      { kind: "authorize", client: 0 },
      { kind: "refreshStart", grant: 0 },
      { kind: "refreshFinish", attempt: 0, outcome: "crash" },
      { kind: "tick", ms: 31_000 },
      { kind: "refreshStart", grant: 0 },
      { kind: "tick", ms: 91_000 },
      { kind: "refreshStart", grant: 0 },
      { kind: "refreshFinish", attempt: 0, outcome: "deliver" },
    ]);
    expect(violations).toEqual([]);
    expect(trace.slice(2)).toEqual([
      "finish A1 (G1) with crash: 500 server_error",
      "tick 31 s",
      "refresh G1 (C1): 503 temporarily_unavailable, the provider saw nothing",
      "tick 91 s",
      "refresh G1 (C1): A2 held at the provider",
      "finish A2 (G1) with deliver: 400 invalid_grant",
    ]);
  });
});
