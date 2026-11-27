// The storage contract that every host passes, as data and players: random step lists, steps at
// the edges, the loop that plays them on one adapter, the memory adapter as a player, and a short
// sign-in and connection as lists of commands. `checkStore` of src/core/testing/harness.ts runs
// them against a host; the test on a real Convex backend plays them itself.
import { Effect, Schema } from "effect";
import fc from "fast-check";
import { makeMemoryStore } from "../hosts/memory.ts";
import { decodeResult, encodeArgs, type Args, type CommandName } from "./commands.ts";
import { MemoryDb } from "./memory.ts";
import { tables, type Doc } from "./tables.ts";
import {
  indexNames,
  playStep,
  readStep,
  type Op,
  type Ref,
  type StepInput,
  type StepOutput,
} from "./testing.ts";
import type { IndexField } from "./Tx.ts";

const strings = fc.oneof(
  fc.constantFrom("", "a", "b", "ab", "é", "\u{1F600}", "�", "", "￿", "\u{10000}", "a\u0000"),
  fc.string({ unit: "binary", maxLength: 3 }),
);
/** `-0` is left out: the SQLite and Convex adapters store it as `0`, and memory keeps it. */
const numbers = fc.oneof(
  fc.constantFrom(-1, 0, 1, 2.5, 10, 1e12),
  fc.integer({ min: -3, max: 3 }),
  fc
    .double({ noNaN: true, noDefaultInfinity: true })
    .map((value) => (Object.is(value, -0) ? 0 : value)),
);
const maybe = <A>(arbitrary: fc.Arbitrary<A>) => fc.option(arbitrary, { nil: undefined, freq: 3 });

type DeploymentType = NonNullable<Doc<"clients">["github"]>["deploymentType"];

/** A card; with `app`, a card of the GitHub layer, whose fields hold the nested index paths. */
const clientOf = (fields: {
  readonly clientId: string;
  readonly ref: string;
  readonly app: { readonly appId: string; readonly deploymentType: DeploymentType } | undefined;
  readonly createdAt: number;
  readonly lastSignInAt: number | undefined;
  readonly removeAt: number | undefined;
}): Doc<"clients"> => ({
  clientId: fields.clientId,
  redirectUris: ["https://a.example/cb"],
  tokenEndpointAuthMethod: "client_secret_basic",
  secretHash: "h",
  connectors: ["github"],
  connections: [],
  gates: ["github:repository:1"],
  confirm: true,
  budget: fields.ref,
  ref: fields.ref,
  ...(fields.removeAt === undefined ? {} : { removeAt: fields.removeAt }),
  createdAt: fields.createdAt,
  ...(fields.lastSignInAt === undefined ? {} : { lastSignInAt: fields.lastSignInAt }),
  ...(fields.app === undefined
    ? {}
    : {
        github: {
          appId: fields.app.appId,
          app: "a",
          deploymentType: fields.app.deploymentType,
          clientName: "prod",
          softwareVersion: "1",
          registrationTokenHash: "r",
          renewedAt: 0,
          registeredBy: {
            kind: "initial_access_token",
            githubRepository: "o/r",
            githubOwnerId: "1",
            issuedAt: 0,
          },
          enrollment: ["github"],
        },
      }),
});

const signIn = fc.record({ ref: strings, at: numbers }).map(({ ref, at }): Doc<"signIns"> => ({
  clientId: "c",
  ref,
  connector: "github",
  sub: "s",
  at,
}));
const exemption = fc
  .record({ tenantId: strings, ownerId: strings })
  .map(({ tenantId, ownerId }): Doc<"signInPageExemptions"> => ({
    tenantId,
    ownerId,
    reason: "r",
  }));
const client = fc
  .record({
    clientId: strings,
    ref: strings,
    app: maybe(
      fc.record({
        appId: strings,
        deploymentType: fc.constantFrom<DeploymentType>("production", "preview", "development"),
      }),
    ),
    createdAt: numbers,
    lastSignInAt: maybe(numbers),
    removeAt: maybe(numbers),
  })
  .map(clientOf);

const written = fc.oneof(
  signIn.map((doc) => ({ table: "signIns" as const, doc })),
  exemption.map((doc) => ({ table: "signInPageExemptions" as const, doc })),
  client.map((doc) => ({ table: "clients" as const, doc })),
);

/** An index value; `null` is an absent field. */
const slotFor = (field: IndexField | undefined): fc.Arbitrary<string | number | null> => {
  const present: fc.Arbitrary<string | number> = field?.type === "string" ? strings : numbers;
  return fc.option(present, { nil: null, freq: 3 });
};

/** A prefix of the index's fields, then at most one lower and one upper bound on the next one. */
const rangeOf = (fields: ReadonlyArray<IndexField>) =>
  fc.integer({ min: 0, max: fields.length }).chain((prefix) => {
    const next = fields.at(prefix);
    const bound = <O extends string>(ops: ReadonlyArray<O>) =>
      next === undefined
        ? fc.constant(null)
        : fc.option(fc.record({ op: fc.constantFrom(...ops), value: slotFor(next) }), {
            nil: null,
          });
    return fc.record({
      eq: fc.tuple(...fields.slice(0, prefix).map(slotFor)),
      lower: bound(["gt", "gte"] as const),
      upper: bound(["lt", "lte"] as const),
      order: fc.constantFrom("asc" as const, "desc" as const),
      limit: fc.integer({ min: 0, max: 6 }),
    });
  });

const fieldsOf = (table: "signIns" | "signInPageExemptions" | "clients", index: string) =>
  Object.entries<ReadonlyArray<IndexField>>(tables[table].indexes).find(
    ([name]) => name === index,
  )?.[1] ?? [];

const query: fc.Arbitrary<Op> = fc.oneof(
  fc.constantFrom(...indexNames.signIns).chain((index) =>
    rangeOf(fieldsOf("signIns", index)).map((range): Op => ({
      kind: "query",
      table: "signIns",
      index,
      ...range,
    })),
  ),
  fc.constantFrom(...indexNames.signInPageExemptions).chain((index) =>
    rangeOf(fieldsOf("signInPageExemptions", index)).map((range): Op => ({
      kind: "query",
      table: "signInPageExemptions",
      index,
      ...range,
    })),
  ),
  fc.constantFrom(...indexNames.clients).chain((index) =>
    rangeOf(fieldsOf("clients", index)).map((range): Op => ({
      kind: "query",
      table: "clients",
      index,
      ...range,
    })),
  ),
);

const op: fc.Arbitrary<Op> = fc.oneof(
  { weight: 4, arbitrary: written.map((doc): Op => ({ kind: "insert", written: doc })) },
  {
    weight: 2,
    arbitrary: fc
      .record({ ref: fc.nat(), written })
      .map(({ ref, written: doc }): Op => ({ kind: "replace", ref, written: doc })),
  },
  { weight: 1, arbitrary: fc.nat().map((ref): Op => ({ kind: "delete", ref })) },
  { weight: 1, arbitrary: fc.nat().map((ref): Op => ({ kind: "get", ref })) },
  { weight: 4, arbitrary: query },
);

interface RandomStep {
  readonly ops: ReadonlyArray<Op>;
  readonly dieAt: number | null;
}

export const stepLists: fc.Arbitrary<ReadonlyArray<RandomStep>> = fc.array(
  fc.record({
    ops: fc.array(op, { maxLength: 8 }),
    dieAt: fc.option(fc.nat({ max: 8 }), { nil: null, freq: 3 }),
  }),
  { minLength: 1, maxLength: 8 },
);

/** Plays one step as one transaction of an adapter. Rejects when the step dies. */
export type Player = (input: StepInput) => Promise<StepOutput>;

/**
 * Plays `steps` and returns what each step gave, then the final state. After a step that dies,
 * `same` receives the state from before the step and the state read after it.
 */
export const play = async (
  steps: ReadonlyArray<RandomStep>,
  player: Player,
  same: (after: unknown, before: unknown) => void,
): Promise<ReadonlyArray<unknown>> => {
  const refs: Array<Ref> = [];
  const log: Array<unknown> = [];
  let state = (await player(readStep)).after;
  for (const { ops, dieAt } of steps) {
    let output: StepOutput | undefined;
    try {
      output = await player({ ops, dieAt, refs: [...refs] });
    } catch {
      log.push("rolled back");
      same((await player(readStep)).after, state);
      continue;
    }
    refs.push(...output.added);
    log.push(output.log);
    state = output.after;
  }
  log.push(state);
  return log;
};

export const memoryPlayer = (): Player => {
  const db = new MemoryDb();
  return async (input) => db.step((tx) => Effect.runSync(playStep(tx, input)));
};

const signInOf = (clientId: string): Doc<"signIns"> => ({
  clientId,
  ref: "a",
  connector: "c",
  sub: "s",
  at: 1,
});

/** Two sign-ins with one key, the first replaced, then the key read both ways; and its log. */
export const sameKey: { readonly step: StepInput; readonly log: ReadonlyArray<unknown> } = {
  step: {
    ops: [
      { kind: "insert", written: { table: "signIns", doc: signInOf("1") } },
      { kind: "insert", written: { table: "signIns", doc: signInOf("2") } },
      { kind: "replace", ref: 0, written: { table: "signIns", doc: signInOf("1b") } },
      ...(["asc", "desc"] as const).map((order): Op => ({
        kind: "query",
        table: "signIns",
        index: "by_at",
        eq: [1],
        lower: null,
        upper: null,
        order,
        limit: 5,
      })),
    ],
    dieAt: null,
    refs: [],
  },
  log: [
    "inserted",
    "inserted",
    "replaced",
    [signInOf("1b"), signInOf("2")],
    [signInOf("2"), signInOf("1b")],
  ],
};

const insertSignIn = (ref: string, at: number): Op => ({
  kind: "insert",
  written: { table: "signIns", doc: { clientId: "c", ref, connector: "c", sub: "s", at } },
});

const signInsAt = (
  eq: ReadonlyArray<string | number | null>,
  bounds: Pick<Extract<Op, { readonly kind: "query" }>, "lower" | "upper"> = {
    lower: null,
    upper: null,
  },
): Op => ({
  kind: "query",
  table: "signIns",
  index: "by_at",
  eq,
  ...bounds,
  order: "asc",
  limit: 20,
});

const clients = (
  index: (typeof indexNames.clients)[number],
  eq: ReadonlyArray<string | number | null>,
  bounds: Pick<Extract<Op, { readonly kind: "query" }>, "lower" | "upper"> = {
    lower: null,
    upper: null,
  },
  order: "asc" | "desc" = "asc",
): Op => ({ kind: "query", table: "clients", index, eq, ...bounds, order, limit: 20 });

const insertClient = (fields: Parameters<typeof clientOf>[0]): Op => ({
  kind: "insert",
  written: { table: "clients", doc: clientOf(fields) },
});

/**
 * Index order and bounds at their edges: strings by code point, an absent field before every
 * value, each bound with an absent value, and `eq` on an absent nested field.
 */
export const edgeStep: StepInput = {
  ops: [
    ...["b", "a", "", "ab", "A", "é", "\u{1F600}", "�", "", "￿", "\u{10000}", "a\u0000"].map(
      (ref, at) =>
        insertClient({
          clientId: `s${at}`,
          ref,
          app: undefined,
          createdAt: at,
          lastSignInAt: undefined,
          removeAt: undefined,
        }),
    ),
    clients("by_ref", []),
    clients("by_ref", [], undefined, "desc"),
    ...[
      { createdAt: 1, removeAt: undefined },
      { createdAt: 2, removeAt: 10 },
      { createdAt: 3, removeAt: 5 },
      { createdAt: 4, removeAt: undefined },
    ].map((fields) =>
      insertClient({
        clientId: `c${fields.createdAt}`,
        ref: "edge",
        app: fields.createdAt === 4 ? undefined : { appId: "app", deploymentType: "production" },
        lastSignInAt: undefined,
        ...fields,
      }),
    ),
    clients("by_remove_at", [], { lower: { op: "gt", value: null }, upper: null }),
    clients("by_remove_at", [], { lower: { op: "gte", value: null }, upper: null }),
    clients("by_remove_at", [], { lower: null, upper: { op: "lt", value: null } }),
    clients("by_remove_at", [], { lower: null, upper: { op: "lte", value: null } }),
    clients("by_remove_at", [], { lower: null, upper: { op: "lte", value: null } }, "desc"),
    clients("by_remove_at", [], { lower: null, upper: { op: "lt", value: 10 } }),
    clients("by_remove_at", [], {
      lower: { op: "gt", value: null },
      upper: { op: "lt", value: 10 },
    }),
    clients("by_remove_at", [null]),
    clients("by_remove_at", [5]),
    clients("by_github_app_id_and_deployment_type", [null]),
    clients("by_github_app_id_and_deployment_type", ["app", "production"]),
    clients("by_github_app_id_and_deployment_type", ["app"], {
      lower: null,
      upper: { op: "lt", value: "production" },
    }),
  ],
  dieAt: null,
  refs: [],
};

/**
 * `-0` and `0` as stored values and as query values, and the rows (by `ref`) that each query finds.
 * Under the contract they are one value. A Convex index keeps `-0` as a value of its own, before
 * `0`, so the Convex `Tx` stores and asks for `0`. A stored `-0` itself does not survive every
 * adapter (JSON text has no `-0`), so only the rows found are compared.
 */
export const negativeZero: {
  readonly step: StepInput;
  readonly found: ReadonlyArray<ReadonlyArray<string>>;
} = {
  step: {
    ops: [
      insertSignIn("plus zero", 0),
      insertSignIn("minus zero", -0),
      insertSignIn("minus one", -1),
      insertSignIn("one", 1),
      signInsAt([]),
      signInsAt([0]),
      signInsAt([-0]),
      signInsAt([], { lower: { op: "gte", value: 0 }, upper: null }),
      signInsAt([], { lower: null, upper: { op: "lt", value: 0 } }),
    ],
    dieAt: null,
    refs: [],
  },
  found: [
    ["minus one", "plus zero", "minus zero", "one"],
    ["plus zero", "minus zero"],
    ["plus zero", "minus zero"],
    ["plus zero", "minus zero", "one"],
    ["minus one"],
  ],
};

const decodeFound = Schema.decodeUnknownSync(
  Schema.Array(Schema.Array(Schema.Struct({ ref: Schema.String }))),
);

/** The `ref`s that the queries of `negativeZero.step` found. */
export const foundOf = (output: StepOutput): ReadonlyArray<ReadonlyArray<string>> =>
  decodeFound(output.log.slice(4)).map((rows) => rows.map((row) => row.ref));

/**
 * A step that runs far more than 2048 Effect operations (the budget after which a fiber yields)
 * with no storage call between them: as the first step, its `get`s find no row and do not reach
 * the `Tx`. A fiber that awaits a storage call starts a new budget when it resumes.
 */
export const longStep: StepInput = {
  ops: [
    ...Array.from({ length: 2_000 }, (): Op => ({ kind: "get", ref: 0 })),
    insertSignIn("long", 1),
  ],
  dieAt: null,
  refs: [],
};

/** Three inserts, then the step dies. */
export const dyingStep: StepInput = {
  ops: [insertSignIn("a", 1), insertSignIn("b", 2), insertSignIn("c", 3), signInsAt([])],
  dieAt: 3,
  refs: [],
};

const T = 1_700_000_000_000;
const DAY = 86_400_000;
const settings = { allowList: [{ repositoryId: "1", ownerId: "65" }], configured: ["g"] };

type Command = {
  readonly [N in CommandName]: { readonly name: N; readonly args: Args<N> };
}[CommandName];

/**
 * A production registration that writes the card, a sign-in through the upstream connector to the
 * code exchange, a renewal, and the cleanup 40 days later.
 */
const signInCommands: ReadonlyArray<Command> = [
  {
    name: "github.createClient",
    args: {
      clientId: "client-1",
      secretHash: "s",
      registrationTokenHash: "r",
      githubRepositoryDatabaseId: "1",
      githubOwnerId: "65",
      githubRepository: "owner-65/repo",
      githubActorId: "9",
      githubActorLogin: "actor",
      commitSha: "sha",
      proofIssuedAt: 100,
      deployment: { type: "production", initialAccessTokenHash: "token-65" },
      connectors: ["g"],
      app: "web",
      appId: "gh-1-web",
      redirectUris: ["https://app.test/cb"],
      softwareVersion: "1",
      tokenEndpointAuthMethod: "client_secret_basic",
      ...settings,
    },
  },
  { name: "clients.get", args: { clientId: "client-1" } },
  {
    name: "authRequests.create",
    args: {
      requestId: "r1",
      clientId: "client-1",
      redirectUri: "https://app.test/cb",
      scope: "openid",
      state: "s",
      codeChallenge: "challenge",
      requested: [],
      configured: settings.configured,
      liveGates: [],
      freshLogin: false,
      maxAge: 300,
      txnCookieHash: "cookie",
      createdAt: T,
      expiresAt: T + 600_000,
    },
  },
  {
    name: "authRequests.startUpstream",
    args: {
      requestId: "r1",
      connector: "g",
      upstreamStateHash: "sh",
      upstreamCodeVerifier: "v",
      configured: settings.configured,
      liveGates: [],
      now: T,
    },
  },
  {
    name: "authRequests.claimUpstream",
    args: {
      upstreamStateHash: "sh",
      connector: "g",
      txnCookieHashes: ["cookie"],
      configured: settings.configured,
      liveGates: [],
      now: T,
    },
  },
  {
    name: "authRequests.complete",
    args: {
      requestId: "r1",
      identity: { connector: "g", upstreamId: "1" },
      authTime: T,
      codeHash: "ch",
      codeExpiresAt: T + 60_000,
      configured: settings.configured,
      liveGates: [],
      now: T,
    },
  },
  {
    name: "authRequests.exchangeCode",
    args: {
      clientId: "client-1",
      authentication: { method: "client_secret_basic", secretHash: "s" },
      redirectUri: "https://app.test/cb",
      codeHash: "ch",
      codeChallengeOfVerifier: "challenge",
      configured: settings.configured,
      liveGates: [],
      now: T,
    },
  },
  { name: "github.renew", args: { clientId: "client-1", registrationTokenHash: "r", ...settings } },
  { name: "lifecycle.cleanup", args: { now: T + 40 * DAY } },
];

/** What the cleanup at the end of `signInCommands` deletes: the used code. */
export const signInCleanup = {
  authRequests: 0,
  authorizationCodes: 1,
  clients: 0,
  signIns: 0,
  more: false,
};

/** The one integration of `connectionCommands`, and the broker's state of the moment. */
const provider = { name: "cloudflare", resource: "https://api.cloudflare.com/client/v4/" };
const brokerNow = { providers: [provider], liveGates: [] };
const clientAuth = {
  clientId: "client-2",
  clientSecretHash: "s",
  tokenEndpointAuthMethod: "client_secret_post",
} as const;

/** A request of `connectionCommands`, `c1` or `c2`. */
const createRequest = (requestId: string): Command => ({
  name: "connections.create",
  args: {
    requestId,
    clientId: "client-2",
    redirectUri: "https://app.test/cb",
    resource: provider.resource,
    state: "s",
    codeChallenge: "challenge",
    txnCookieHash: "cookie",
    upstreamStateHash: `sh-${requestId}`,
    upstreamCodeVerifier: "v",
    ...brokerNow,
    now: T,
    expiresAt: T + 600_000,
  },
});

const exchange: Command = {
  name: "connections.exchangeCode",
  args: {
    ...clientAuth,
    codeHash: "ch",
    redirectUri: "https://app.test/cb",
    codeChallengeOfVerifier: "challenge",
    ...brokerNow,
    now: T,
  },
};

/**
 * A temporary card of the stack layer that may use Cloudflare, a connection through the provider
 * to the code exchange and its replay, the admission of a refresh, the authentication of a
 * revocation, a second request that is never finished, the card's self-delete, and the cleanup a
 * day later.
 */
const connectionCommands: ReadonlyArray<Command> = [
  {
    name: "stack.createClient",
    args: {
      clientId: "client-2",
      secretHash: "s",
      tokenEndpointAuthMethod: "client_secret_post",
      redirectUris: ["https://app.test/cb"],
      permanent: false,
      client: {
        key: "preview",
        name: "pr-1",
        softwareId: "app",
        softwareVersion: "1",
        registrationTokenHash: "r",
        enrollment: ["g"],
      },
      configured: ["g"],
      connections: ["cloudflare"],
    },
  },
  createRequest("c1"),
  {
    name: "connections.claim",
    args: {
      upstreamStateHash: "sh-c1",
      resource: provider.resource,
      txnCookieHashes: ["cookie"],
      ...brokerNow,
      now: T,
    },
  },
  {
    name: "connections.complete",
    args: {
      requestId: "c1",
      tokens: { accessToken: "a", scope: "x", expiresAt: T + 3_600_000, refreshToken: "u1" },
      codeHash: "ch",
      codeExpiresAt: T + 60_000,
      ...brokerNow,
      now: T,
    },
  },
  exchange,
  exchange,
  {
    name: "connections.admitRefresh",
    args: { ...clientAuth, resource: provider.resource, ...brokerNow, now: T },
  },
  { name: "connections.authenticate", args: clientAuth },
  createRequest("c2"),
  { name: "stack.remove", args: { clientId: "client-2", registrationTokenHash: "r" } },
  { name: "connections.cleanup", args: { now: T + DAY } },
];

/** What the cleanup at the end of `connectionCommands` deletes: the request never finished. */
export const connectionCleanup = { connectionRequests: 1, connectionCodes: 0, more: false };

/** How a host runs one command: its name, encoded arguments and step clock; the encoded result. */
type RunCommand = (name: CommandName, args: unknown, now: number) => Promise<unknown>;

/** Runs `commands` through a host at the step clock `T` and returns the decoded results. */
const playCommands = async (
  commands: ReadonlyArray<Command>,
  run: RunCommand,
): Promise<ReadonlyArray<unknown>> => {
  const results: Array<unknown> = [];
  for (const command of commands) {
    const encoded = await run(command.name, encodeArgs(command.name, command.args), T);
    results.push(decodeResult(command.name, encoded));
  }
  return results;
};

/** `commands` on a fresh memory host. */
const memoryCommands = (commands: ReadonlyArray<Command>): ReadonlyArray<unknown> => {
  const host = makeMemoryStore({ now: T });
  return commands.map((command) => host.run(command.name, command.args));
};

/** `signInCommands` through a host. */
export const playSignIn = (run: RunCommand) => playCommands(signInCommands, run);

/** `signInCommands` on a fresh memory host. */
export const memorySignIn = () => memoryCommands(signInCommands);

/** `connectionCommands` through a host. */
export const playConnection = (run: RunCommand) => playCommands(connectionCommands, run);

/** `connectionCommands` on a fresh memory host. */
export const memoryConnection = () => memoryCommands(connectionCommands);
