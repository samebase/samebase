// Test helpers of the core, for the sign-in tests and, through a layer's own helpers, the
// registration tests. No test framework import: a helper returns values and records, and the
// test asserts.
import { Clock, Effect, Layer, Redacted, Schema } from "effect";
import fc from "fast-check";
import { base64url, exportJWK, generateKeyPair, SignJWT } from "jose";
import { calculatePKCECodeChallenge } from "oauth4webapi";
import { makeMemoryStore } from "../../hosts/memory.ts";
import { makeSqliteStore, type SqliteDatabase } from "../../hosts/nodeSqlite.ts";
import type { Args, CommandName, Result } from "../../store/commands.ts";
import {
  dyingStep,
  edgeStep,
  foundOf,
  longStep,
  memoryConnection,
  memoryPlayer,
  memorySignIn,
  negativeZero,
  play,
  playConnection,
  playSignIn,
  sameKey,
  stepLists,
  type Player,
} from "../../store/contract.ts";
import { playStep } from "../../store/testing.ts";
import { Store, StoreUnavailable } from "../../store/Store.ts";
import type { Doc, IndexName, TableName, Tables } from "../../store/tables.ts";
import { first, type TxShape } from "../../store/Tx.ts";
import { readConnector } from "../../hosts/settings.ts";
import { brokerLogger, makeHandle, type Part, type Registration } from "../router.ts";
import { sha256Hex } from "../subject.ts";
import { github, google } from "../connectors/index.ts";
import type { Connector, OidcConnector } from "../connectors/types.ts";
import { createKeySet, type KeySet } from "../keys.ts";
import {
  Fetch,
  BrokerConfig,
  Keys,
  Random,
  SignInPage,
  type BrokerConfigInput,
  type ServiceSettings,
} from "../services.ts";
import type { SignInPageFunction } from "../html.ts";

/**
 * A deterministic `Random`: the same seed gives the same bytes in the same order (xorshift32).
 * Request ids, cookies and codes are then the same on every run of a test.
 */
export function seededRandom(seed = 1): Random["Service"] {
  let state = seed >>> 0 || 1;
  return Random.of({
    bytes: (length) =>
      Effect.sync(() => {
        const buffer = new Uint8Array(length);
        for (let index = 0; index < length; index++) {
          state ^= state << 13;
          state >>>= 0;
          state ^= state >>> 17;
          state ^= state << 5;
          state >>>= 0;
          buffer[index] = state & 0xff;
        }
        return buffer;
      }),
  });
}

/** One planned upstream answer: `match` picks the request, `respond` answers it. */
export type Plan = {
  readonly match: (request: Request) => boolean;
  readonly respond: (request: Request) => Response | Promise<Response>;
};

/**
 * A `Fetch` that serves planned responses and fails on an unplanned call. A plan stays until the
 * test removes it, so a discovery document serves every sign-in of the test. `unexpected` records
 * the method, origin and path of each unplanned call (no query: a callback URL carries codes), so a
 * test can assert that there was none.
 */
export function stubFetch() {
  const plans: Plan[] = [];
  const requests: Request[] = [];
  const unexpected: string[] = [];
  const service = Fetch.of({
    fetch: async (request) => {
      requests.push(request.clone());
      const plan = plans.find((candidate) => candidate.match(request));
      if (plan === undefined) {
        const url = new URL(request.url);
        unexpected.push(`${request.method} ${url.origin}${url.pathname}`);
        throw new TypeError("fetch failed: no planned response");
      }
      return await plan.respond(request);
    },
  });
  return {
    service,
    requests,
    unexpected,
    /** Adds a plan. Returns a function that removes it. */
    plan(plan: Plan): () => void {
      plans.unshift(plan);
      return () => {
        const index = plans.indexOf(plan);
        if (index >= 0) plans.splice(index, 1);
      };
    },
    /** Answers `GET url` (exact URL without query) with `body` as JSON. */
    json(url: string, body: unknown, status = 200): () => void {
      return this.plan({
        match: (request) => request.url.split("?")[0] === url,
        respond: () => Response.json(body, { status }),
      });
    },
  };
}
export type StubFetch = ReturnType<typeof stubFetch>;

/** A clock that moves only when the test moves it. */
export function testClock(start = 1_700_000_000_000) {
  let now = start;
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => now,
    currentTimeMillis: Effect.sync(() => now),
    currentTimeNanosUnsafe: () => BigInt(now) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(now) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => BigInt(now) * 1_000_000n,
    monotonicTimeNanos: Effect.sync(() => BigInt(now) * 1_000_000n),
    // The core does not sleep; a sleep that reaches here ends at once.
    sleep: () => Effect.void,
  };
  return {
    clock,
    now: () => now,
    set: (millis: number) => {
      now = millis;
    },
    advance: (millis: number) => {
      now += millis;
    },
  };
}
export type TestClock = ReturnType<typeof testClock>;

/** One key set per test file run: RSA generation takes a while. */
let keySetOnce: Promise<KeySet> | undefined;
export function testKeySet(): Promise<KeySet> {
  keySetOnce ??= createKeySet();
  return keySetOnce;
}

/** `Keys` over a mutable JSON value, so a test can rotate or remove keys. */
export function testKeys(json: string | undefined) {
  let current = json;
  return {
    service: Keys.of({
      read: () => (current === undefined ? undefined : Redacted.make(current)),
    }),
    set: (next: string | undefined) => {
      current = next;
    },
  };
}

export const TEST_ISSUER = "https://auth.example.com";

/** The two connectors of the broker, with fake credentials. */
export function testConnectors(): Connector[] {
  return Effect.runSync(
    Effect.all([
      readConnector(
        google({
          clientId: Effect.succeed(Redacted.make("google-client-id")),
          clientSecret: Effect.succeed(Redacted.make("google-client-secret")),
        }),
      ),
      readConnector(
        github({
          clientId: Effect.succeed(Redacted.make("github-client-id")),
          clientSecret: Effect.succeed(Redacted.make("github-client-secret")),
        }),
      ),
    ]),
  );
}

/** The test broker's sign-in service. */
export const TEST_SERVICE: ServiceSettings = {
  name: "Test broker",
  terms: "https://broker.example.com/terms",
  privacy: "https://broker.example.com/privacy",
};

/**
 * Every core service but `Store`, as one layer, with the handles a test needs to steer them, and
 * the broker's logger, so a test that reads the console reads the broker's own log lines. `config`
 * overrides the issuer, the connectors and the service.
 */
export async function coreServices(
  config: Partial<BrokerConfigInput> = {},
  seed = 1,
  /** A stub that the test made first, to plan a fake provider whose connector the config needs. */
  fetch: StubFetch = stubFetch(),
  /** The broker's own page before the provider; the default page without it. */
  signInPage?: SignInPageFunction,
) {
  const clock = testClock();
  const keySet = await testKeySet();
  const keys = testKeys(JSON.stringify(keySet));
  const broker = Effect.runSync(
    BrokerConfig.make({
      issuer: config.issuer ?? TEST_ISSUER,
      connectors: config.connectors ?? testConnectors(),
      service: "service" in config ? config.service : TEST_SERVICE,
    }),
  );
  const layer = Layer.mergeAll(
    Layer.succeed(BrokerConfig, broker),
    SignInPage.layer(signInPage),
    Layer.succeed(Keys, keys.service),
    Layer.succeed(Random, seededRandom(seed)),
    Layer.succeed(Fetch, fetch.service),
    Layer.succeed(Clock.Clock, clock.clock),
    brokerLogger,
  );
  return { layer, fetch, clock, keys, keySet, broker };
}

/**
 * One console line of the broker's logger (`brokerLogger` in src/core/router.ts). A line with another
 * member, such as a cause, does not decode.
 */
const decodeBrokerLogLine = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      message: Schema.Unknown,
      level: Schema.String,
      timestamp: Schema.String,
      annotations: Schema.Record(Schema.String, Schema.Unknown),
      spans: Schema.Record(Schema.String, Schema.Number),
      fiberId: Schema.String,
    }),
  ),
  { onExcessProperty: "error" },
);

/** A line of the broker's logger without its time and fiber, which differ on each run. */
export function brokerLogLine(line: unknown) {
  const { message, level, annotations, spans } = decodeBrokerLogLine(line);
  return { message, level, annotations, spans };
}

/** What the tests use of a Store host: the memory host's API (src/hosts/memory.ts). */
export type TestStore = {
  readonly store: Store["Service"];
  readonly run: <N extends CommandName>(name: N, args: Args<N>) => Result<N>;
  readonly setNow: (ms: number) => void;
  readonly withTx: <A>(body: (tx: TxShape<Tables>) => Effect.Effect<A>) => A;
  /** `withTx` for a host whose steps are async; `registerClient` seeds through it. */
  readonly seed: <A>(body: (tx: TxShape<Tables>) => Effect.Effect<A>) => Promise<A>;
  readonly db: { readonly contents: () => { readonly [T in TableName]: ReadonlyArray<Doc<T>> } };
};

let makeTestStore: (now: number) => TestStore = (now) => {
  const memory = makeMemoryStore({ now });
  return { ...memory, seed: async (body) => memory.withTx(body) };
};

/**
 * Runs every later `createBroker` of this test file on `make`: a test file that sets it and then
 * imports other test files runs their tests on another Store host.
 */
export function useTestStore(make: (now: number) => TestStore) {
  makeTestStore = make;
}

/** Every document of every table, read in one step through each table's first index. */
const contentsOf = (store: Pick<TestStore, "withTx">) => () =>
  store.withTx((tx) =>
    Effect.gen(function* () {
      const all = <T extends TableName>(table: T, index: IndexName<T>) =>
        tx
          .query(table, index, { eq: [], order: "asc", limit: 100_000 })
          .pipe(Effect.map((rows) => rows.map((row) => row.doc)));
      return {
        clients: yield* all("clients", "by_client_id"),
        stops: yield* all("stops", "by_key"),
        authRequests: yield* all("authRequests", "by_request_id"),
        authorizationCodes: yield* all("authorizationCodes", "by_code_hash"),
        signIns: yield* all("signIns", "by_at"),
        signInBudgets: yield* all("signInBudgets", "by_key"),
        apps: yield* all("apps", "by_app_id"),
        tenants: yield* all("tenants", "by_tenant_id"),
        signInPageExemptions: yield* all("signInPageExemptions", "by_tenant_id_and_owner_id"),
        connectorGrants: yield* all("connectorGrants", "by_tenant_id_and_owner_id_and_connector"),
        events: yield* all("events", "by_github_owner_id"),
        initialAccessTokens: yield* all("initialAccessTokens", "by_token_hash"),
        rateLimits: yield* all("rateLimits", "by_scope_and_github_id"),
        connectionRequests: yield* all("connectionRequests", "by_request_id"),
        connectionCodes: yield* all("connectionCodes", "by_code_hash"),
        registrations: yield* all("registrations", "by_at"),
        blocks: yield* all("blocks", "by_kind_and_github_id"),
        blockEvents: yield* all("blockEvents", "by_at"),
        everyAppExemptions: yield* all("everyAppExemptions", "by_reason"),
      };
    }),
  );

/**
 * The node:sqlite host (src/hosts/nodeSqlite.ts) as a `TestStore`. The test file opens the
 * database, so this module needs no Node types.
 */
export function sqliteTestStore(database: SqliteDatabase, now: number): TestStore {
  const sqlite = makeSqliteStore(database, { now });
  return {
    ...sqlite,
    seed: async (body) => sqlite.withTx(body),
    db: { contents: contentsOf(sqlite) },
  };
}

/** A host's storage for `checkStore`: one fresh, empty store. */
export type HostUnderTest = {
  /** Runs `body` as one transaction. A `body` that dies rejects, and its transaction writes nothing. */
  readonly transaction: <A>(body: (tx: TxShape<Tables>) => Effect.Effect<A>) => Promise<A>;
  /** The host's `Store` over the same storage. A command's step clock is Effect's `Clock`. */
  readonly store: Store["Service"];
};

const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Unknown));

/** Equal by content: object keys in any order, and a member that is `undefined` is absent. */
const sameData = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, at) => sameData(item, b[at]))
    );
  }
  if (isRecord(a) && isRecord(b)) {
    const keysA = Object.keys(a).filter((key) => a[key] !== undefined);
    const keysB = Object.keys(b).filter((key) => b[key] !== undefined);
    return keysA.length === keysB.length && keysA.every((key) => sameData(a[key], b[key]));
  }
  return a === b;
};

const same = (check: string, host: unknown, memory: unknown) => {
  if (!sameData(host, memory)) {
    throw new Error(
      `${check}: the host gave ${JSON.stringify(host)}, the memory host ${JSON.stringify(memory)}`,
    );
  }
};

/**
 * Checks a host's storage against the memory host: random steps of inserts, replaces, deletes and
 * index queries, steps at the edges of index order, a step that dies, and a sign-in and a
 * connection through the host's `Store`. `make` gives a fresh, empty store on each call. Rejects
 * with the first difference.
 */
export async function checkStore(
  make: () => HostUnderTest | Promise<HostUnderTest>,
  options: { readonly runs?: number } = {},
): Promise<void> {
  const player = async (): Promise<Player> => {
    const host = await make();
    return (input) => host.transaction((tx) => playStep(tx, input));
  };
  const rolledBack = (after: unknown, before: unknown) =>
    same("A step that died changed the state", after, before);
  await fc.assert(
    fc.asyncProperty(stepLists, async (steps) =>
      same(
        "Random steps",
        await play(steps, await player(), rolledBack),
        await play(steps, memoryPlayer(), rolledBack),
      ),
    ),
    { numRuns: options.runs ?? 100 },
  );
  same("Equal index keys", (await (await player())(sameKey.step)).log, sameKey.log);
  const edges = [longStep, edgeStep, dyingStep];
  const fromHost = await play(edges, await player(), rolledBack);
  same("Steps at the edges", fromHost, await play(edges, memoryPlayer(), rolledBack));
  same("A step that died", fromHost.at(-2), "rolled back");
  same("-0 and 0", foundOf(await (await player())(negativeZero.step)), negativeZero.found);
  const scripts = [
    { check: "A sign-in", play: playSignIn, memory: memorySignIn() },
    { check: "A connection", play: playConnection, memory: memoryConnection() },
  ];
  for (const script of scripts) {
    const { store } = await make();
    const results = await script.play((name, args, now) =>
      Effect.runPromise(
        store.run(name, args).pipe(Effect.provideService(Clock.Clock, testClock(now).clock)),
      ),
    );
    same(script.check, results, script.memory);
  }
}

/**
 * The broker on a fresh test Store (the memory host unless `useTestStore` chose another), driven
 * through `fetchBroker`. The
 * Store's step clock follows the test clock, so `clock.set` and `clock.advance` move both.
 * `failCommands` makes the commands whose name it answers true for fail with `StoreUnavailable`,
 * as a lost RPC reply does, until it is set to null. `registration` is a layer as a host mounts it,
 * each route with the layer's own services provided.
 */
export async function createBroker(
  options: {
    config?: Partial<BrokerConfigInput>;
    seed?: number;
    registration?: Registration;
    /** An optional part of the broker, such as integrations. */
    part?: Part;
    fetch?: StubFetch;
    signInPage?: SignInPageFunction;
  } = {},
) {
  const core = await coreServices(options.config, options.seed, options.fetch, options.signInPage);
  // `memory` is the test Store of the run: the memory Store, or node:sqlite (`useTestStore`).
  const memory = makeTestStore(core.clock.now());
  const failing: { commands: ((name: string) => boolean) | null } = { commands: null };
  const store = Store.of({
    run: (name, args) =>
      failing.commands?.(name) === true
        ? Effect.fail(new StoreUnavailable())
        : memory.store.run(name, args),
  });
  const handle = makeHandle(options.registration ?? { routes: [] }, options.part);
  const layer = Layer.merge(core.layer, Layer.succeed(Store, store));
  const clock = {
    now: core.clock.now,
    set: (millis: number) => {
      core.clock.set(millis);
      memory.setNow(millis);
    },
    advance: (millis: number) => {
      core.clock.advance(millis);
      memory.setNow(core.clock.now());
    },
  };

  async function fetchBroker(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    return await Effect.runPromise(handle(new Request(input, init)).pipe(Effect.provide(layer)));
  }

  /**
   * One card with `redirectUri` (and `otherRedirectUris`), as a layer writes it: its `ref` is
   * `test:<appName>`, and its budget is the ref's. It offers `connectors`, else every configured
   * connector, and shows no page unless `confirm`.
   */
  async function registerClient(args: {
    appName: string;
    redirectUri: string;
    otherRedirectUris?: string[];
    connectors?: string[];
    /** The integrations of the card; none without it. */
    connections?: string[];
    tokenEndpointAuthMethod?: "client_secret_post" | "client_secret_basic";
    gates?: string[];
    confirm?: boolean;
    budget?: string;
    /** Set: a temporary card. */
    removeAt?: number;
  }) {
    const ref = `test:${args.appName.toLowerCase()}`;
    const clientId = `cl_${randomHex(16)}`;
    const clientSecret = randomHex(32);
    const secretHash = await sha256Hex(clientSecret);
    const now = clock.now();
    const connectors = [
      ...new Set(args.connectors ?? core.broker.connectors.map((connector) => connector.name)),
    ].sort();
    await memory.seed((tx) =>
      Effect.asVoid(
        tx.insert("clients", {
          clientId,
          redirectUris: [args.redirectUri, ...(args.otherRedirectUris ?? [])].sort(),
          tokenEndpointAuthMethod: args.tokenEndpointAuthMethod ?? "client_secret_post",
          secretHash,
          connectors,
          connections: args.connections ?? [],
          gates: args.gates ?? [],
          confirm: args.confirm ?? false,
          budget: args.budget ?? ref,
          ref,
          ...(args.removeAt === undefined ? {} : { removeAt: args.removeAt }),
          createdAt: now,
        }),
      ),
    );
    return { clientId, clientSecret, connectors, ref };
  }

  /** Replaces the card of `clientId` with `change` applied, in one step, as a layer's rewrite. */
  const editCard = (clientId: string, change: (card: Doc<"clients">) => Doc<"clients">) =>
    memory.seed((tx) =>
      Effect.gen(function* () {
        const row = yield* first(tx, "clients", "by_client_id", [clientId]);
        if (row === undefined) {
          return yield* Effect.die(new Error(`No card ${clientId}`));
        }
        yield* tx.replace("clients", row.id, change(row.doc));
      }),
    );

  /** Adds (`on`) or removes the stop of `key`, in one step. */
  const setStop = (key: string, on: boolean) =>
    memory.seed((tx) =>
      Effect.gen(function* () {
        const row = yield* first(tx, "stops", "by_key", [key]);
        if (on && row === undefined) {
          yield* tx.insert("stops", { key, at: clock.now() });
        }
        if (!on && row !== undefined) {
          yield* tx.delete("stops", row.id);
        }
      }),
    );

  return {
    ...core,
    clock,
    memory,
    handle,
    layer,
    fetchBroker,
    registerClient,
    editCard,
    setStop,
    issuer: core.broker.issuer,
    failCommands: (commands: ((name: string) => boolean) | null) => {
      failing.commands = commands;
    },
  };
}
export type Broker = Awaited<ReturnType<typeof createBroker>>;

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The `Cookie` header of the browser that received `response`, with its transaction cookie. */
export function txnCookie(response: Response): { Cookie: string } {
  return { Cookie: (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "" };
}

/** PKCE values for a client-side test. */
export async function pkce() {
  const verifier = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge: await calculatePKCECodeChallenge(verifier) };
}

/** The user that the fake plain-OAuth provider's user endpoint answers. */
const decodeFakeUser = Schema.decodeUnknownSync(
  Schema.Struct({ id: Schema.String, name: Schema.String, email: Schema.String }),
);

/**
 * A fake plain-OAuth provider on `fetch`: RFC 8414 metadata without `iss` support, a token endpoint
 * and a user endpoint. Returns the connector pointing at it.
 */
export function fakeUpstream(fetch: StubFetch, options: { userId?: string } = {}) {
  fetch.json("https://upstream.test/.well-known/oauth-authorization-server", {
    issuer: "https://upstream.test",
    authorization_endpoint: "https://upstream.test/authorize",
    token_endpoint: "https://upstream.test/token",
    response_types_supported: ["code"],
  });
  fetch.plan({
    match: (request) => request.url === "https://upstream.test/token" && request.method === "POST",
    respond: async (request) => {
      const body = new URLSearchParams(await request.text());
      if (body.get("code") !== "upstream-code" || body.get("client_secret") !== "up-secret") {
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      return Response.json({ access_token: "up-access", token_type: "bearer" });
    },
  });
  fetch.plan({
    match: (request) => request.url === "https://api.upstream.test/user",
    respond: (request) =>
      request.headers.get("authorization") === "Bearer up-access"
        ? Response.json({
            id: options.userId ?? "42",
            name: "Octo Cat",
            email: "octo@example.com",
          })
        : new Response("unauthorized", { status: 401 }),
  });
  const connector: Connector = {
    kind: "oauth",
    provider: "fake",
    name: "fake",
    label: "Fake",
    issuer: "https://upstream.test",
    scopes: ["read:user"],
    clientId: Redacted.make("up-client"),
    clientSecret: Redacted.make("up-secret"),
    identity: async (accessToken, fetchUpstream) => {
      const response = await fetchUpstream(
        new Request("https://api.upstream.test/user", {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      const user = decodeFakeUser(await response.json());
      return { upstreamId: user.id, name: user.name, email: user.email, emailVerified: true };
    },
  };
  return { connector };
}

/**
 * A fake OpenID provider on `fetch`: discovery, JWKS, and a token endpoint that signs an id_token.
 * Its issuer, client, subject and `acr` come from the example ID Token of OpenID Connect Core 1.0
 * section 2; `nextIdToken` sets the nonce and the `auth_time` of the next one (`undefined`: the
 * claim is left out). The connector documents `prompt=login`.
 */
export async function fakeOidcUpstream(fetch: StubFetch) {
  const issuer = "https://server.example.com";
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  let next: { nonce: string; authTime: number | undefined } | undefined;
  fetch.json(`${issuer}/.well-known/openid-configuration`, {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    code_challenge_methods_supported: ["S256"],
  });
  fetch.json(`${issuer}/jwks`, { keys: [jwk] });
  fetch.plan({
    match: (request) =>
      request.url === `${issuer}/token` && request.method === "POST" && next !== undefined,
    respond: async (request) => {
      const body = new URLSearchParams(await request.text());
      if (
        next === undefined ||
        body.get("code") !== "upstream-code" ||
        body.get("client_secret") !== "idp-secret"
      ) {
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      const idToken = await new SignJWT({
        nonce: next.nonce,
        ...(next.authTime === undefined ? {} : { auth_time: next.authTime }),
        acr: "urn:mace:incommon:iap:silver",
      })
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(issuer)
        .setSubject("24400320")
        .setAudience("s6BhdRkqt3")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      return Response.json({ access_token: "idp-access", token_type: "Bearer", id_token: idToken });
    },
  });
  const connector: OidcConnector = {
    kind: "oidc",
    provider: "idp",
    name: "idp",
    label: "IdP",
    issuer,
    scopes: ["openid"],
    promptLogin: true,
    maxAge: false,
    clientId: Redacted.make("s6BhdRkqt3"),
    clientSecret: Redacted.make("idp-secret"),
  };
  return {
    connector,
    nextIdToken: (value: { nonce: string; authTime: number | undefined }) => {
      next = value;
    },
  };
}
