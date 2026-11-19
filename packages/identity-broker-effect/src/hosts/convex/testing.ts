// Test support for the Convex host, shared by the adapter tests (convex-test) and the test on a
// real Convex backend: random step lists, the loop that plays them on one adapter, the memory
// adapter as a player, and a short sign-in as a list of commands.
import { Effect, Schema } from "effect";
import fc from "fast-check";
import { MemoryDb } from "../../store/memory.ts";
import { decodeResult, type Args, type CommandName } from "../../store/Store.ts";
import { makeMemoryStore } from "../memory.ts";
import { declarations, type Doc, type IndexField } from "../../store/tables.ts";
import {
  indexNames,
  playStep,
  readStep,
  type Op,
  type Ref,
  type StepInput,
  type StepOutput,
} from "../../store/testing.ts";
import { Tx } from "../../store/Tx.ts";

const strings = fc.oneof(
  fc.constantFrom("", "a", "b", "ab", "é", "\u{1F600}", "�", "", "￿", "\u{10000}", "a\u0000"),
  fc.string({ unit: "binary", maxLength: 3 }),
);
/** `-0` is left out: SQLite stores it as `0`, and Convex orders it before `0` (`negativeZero`). */
const numbers = fc.oneof(
  fc.constantFrom(-1, 0, 1, 2.5, 10, 1e12),
  fc.integer({ min: -3, max: 3 }),
  fc
    .double({ noNaN: true, noDefaultInfinity: true })
    .map((value) => (Object.is(value, -0) ? 0 : value)),
);
const maybe = <A>(arbitrary: fc.Arbitrary<A>) => fc.option(arbitrary, { nil: undefined, freq: 3 });

const clientOf = (fields: {
  readonly clientId: string;
  readonly appId: string;
  readonly deploymentType: Doc<"clients">["deploymentType"];
  readonly createdAt: number;
  readonly lastSignInAt: number | undefined;
  readonly removeAt: number | undefined;
}): Doc<"clients"> => ({
  clientId: fields.clientId,
  appId: fields.appId,
  secretHash: "h",
  tokenEndpointAuthMethod: "client_secret_basic",
  redirectUris: ["https://a.example/cb"],
  deploymentType: fields.deploymentType,
  clientName: "prod",
  softwareVersion: "1",
  createdAt: fields.createdAt,
  ...(fields.lastSignInAt === undefined ? {} : { lastSignInAt: fields.lastSignInAt }),
  registrationTokenHash: "r",
  ...(fields.removeAt === undefined ? {} : { removeAt: fields.removeAt }),
  renewedAt: 0,
  app: "a",
  registeredBy: {
    kind: "initial_access_token",
    githubRepository: "o/r",
    githubOwnerId: "1",
    issuedAt: 0,
  },
  connectors: ["github"],
});

const signIn = fc.record({ appId: strings, at: numbers }).map(({ appId, at }): Doc<"signIns"> => ({
  appId,
  clientId: "c",
  connector: "github",
  sub: "s",
  at,
}));
const exemption = fc
  .oneof(
    fc.constant({ scope: "every_app" as const }),
    fc.record({ scope: fc.constant("repository" as const), tenantId: strings, ownerId: strings }),
  )
  .map((target): Doc<"signInPageExemptions"> => ({ target, reason: "r" }));
const client = fc
  .record({
    clientId: strings,
    appId: strings,
    deploymentType: fc.constantFrom(
      "production" as const,
      "preview" as const,
      "development" as const,
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

const fieldsOf = (table: keyof typeof declarations, index: string) =>
  declarations[table].indexes[index] ?? [];

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
  return async (input) =>
    db.step((tx) => Effect.runSync(playStep(input).pipe(Effect.provideService(Tx, tx))));
};

const signInOf = (clientId: string): Doc<"signIns"> => ({
  appId: "a",
  clientId,
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
        index: "by_app_id_and_at",
        eq: ["a", 1],
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

const insertSignIn = (appId: string, at: number): Op => ({
  kind: "insert",
  written: { table: "signIns", doc: { appId, clientId: "c", connector: "c", sub: "s", at } },
});

const signInsBy = (
  index: "by_app_id_and_at" | "by_at",
  eq: ReadonlyArray<string | number | null>,
  bounds: Pick<Extract<Op, { readonly kind: "query" }>, "lower" | "upper"> = {
    lower: null,
    upper: null,
  },
  order: "asc" | "desc" = "asc",
): Op => ({ kind: "query", table: "signIns", index, eq, ...bounds, order, limit: 20 });

const activity = (
  eq: ReadonlyArray<string | number | null>,
  bounds: Pick<Extract<Op, { readonly kind: "query" }>, "lower" | "upper">,
  order: "asc" | "desc" = "asc",
): Op => ({
  kind: "query",
  table: "clients",
  index: "by_deployment_type_and_activity",
  eq,
  ...bounds,
  order,
  limit: 20,
});

/**
 * Index order and bounds at their edges: strings by code point, an absent field before every
 * value, each bound with an absent value, and `eq` on an absent field.
 */
export const edgeStep: StepInput = {
  ops: [
    ...["b", "a", "", "ab", "A", "é", "\u{1F600}", "�", "", "￿", "\u{10000}", "a\u0000"].map(
      (appId) => insertSignIn(appId, 1),
    ),
    signInsBy("by_app_id_and_at", []),
    signInsBy("by_app_id_and_at", [], undefined, "desc"),
    ...[
      { createdAt: 1, lastSignInAt: undefined },
      { createdAt: 2, lastSignInAt: 10 },
      { createdAt: 3, lastSignInAt: 5 },
      { createdAt: 4, lastSignInAt: undefined },
    ].map((fields): Op => ({
      kind: "insert",
      written: {
        table: "clients",
        doc: clientOf({
          clientId: `c${fields.createdAt}`,
          appId: "app",
          deploymentType: "production",
          removeAt: undefined,
          ...fields,
        }),
      },
    })),
    activity(["production"], { lower: { op: "gt", value: null }, upper: null }),
    activity(["production"], { lower: { op: "gte", value: null }, upper: null }),
    activity(["production"], { lower: null, upper: { op: "lt", value: null } }),
    activity(["production"], { lower: null, upper: { op: "lte", value: null } }),
    activity(["production"], { lower: null, upper: { op: "lte", value: null } }, "desc"),
    activity(["production"], { lower: null, upper: { op: "lt", value: 10 } }),
    activity(["production"], { lower: { op: "gt", value: null }, upper: { op: "lt", value: 10 } }),
    activity(["production", null], { lower: null, upper: null }),
    activity(["production", null], { lower: { op: "gt", value: 1 }, upper: null }),
    activity(["production", 5], { lower: null, upper: null }),
  ],
  dieAt: null,
  refs: [],
};

/**
 * `-0` and `0` as stored values and as query values, and the rows (by `appId`) that each query
 * finds. Under the contract they are one value (`found`). Convex differs (`foundOnConvex`): in its
 * indexes `-0` is a value of its own, ordered before `0`. A stored `-0` itself does not survive
 * every adapter (SQLite's JSON text has no `-0`), so only the rows found are compared.
 */
export const negativeZero: {
  readonly step: StepInput;
  readonly found: ReadonlyArray<ReadonlyArray<string>>;
  readonly foundOnConvex: ReadonlyArray<ReadonlyArray<string>>;
} = {
  step: {
    ops: [
      insertSignIn("plus zero", 0),
      insertSignIn("minus zero", -0),
      insertSignIn("minus one", -1),
      insertSignIn("one", 1),
      signInsBy("by_at", []),
      signInsBy("by_at", [0]),
      signInsBy("by_at", [-0]),
      signInsBy("by_at", [], { lower: { op: "gte", value: 0 }, upper: null }),
      signInsBy("by_at", [], { lower: null, upper: { op: "lt", value: 0 } }),
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
  foundOnConvex: [
    ["minus one", "minus zero", "plus zero", "one"],
    ["plus zero"],
    ["minus zero"],
    ["plus zero", "one"],
    ["minus one", "minus zero"],
  ],
};

const decodeFound = Schema.decodeUnknownSync(
  Schema.Array(Schema.Array(Schema.Struct({ appId: Schema.String }))),
);

/** The `appId`s that the queries of `negativeZero.step` found. */
export const foundOf = (output: StepOutput): ReadonlyArray<ReadonlyArray<string>> =>
  decodeFound(output.log.slice(4)).map((rows) => rows.map((row) => row.appId));

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
  ops: [insertSignIn("a", 1), insertSignIn("b", 2), insertSignIn("c", 3), signInsBy("by_at", [])],
  dieAt: 3,
  refs: [],
};

const T = 1_700_000_000_000;
const DAY = 86_400_000;
const policy = { ownerId: "65", paused: false, connectors: ["g"], configured: ["g"] };

type Command = {
  readonly [N in CommandName]: { readonly name: N; readonly args: Args<N> };
}[CommandName];

/**
 * A production registration, a sign-in through the upstream connector to the code exchange, a
 * renewal, and the cleanup 40 days later.
 */
const signInCommands: ReadonlyArray<Command> = [
  {
    name: "hubClients.createClient",
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
      policyConnectors: ["g"],
      configuredConnectors: ["g"],
      app: "web",
      appId: "gh-1-web",
      redirectUris: ["https://app.test/cb"],
      softwareVersion: "1",
      tokenEndpointAuthMethod: "client_secret_basic",
    },
  },
  { name: "clients.forAuthorize", args: { clientId: "client-1" } },
  {
    name: "authRequests.create",
    args: {
      tenantId: "gh-1",
      requestId: "r1",
      appId: "gh-1-web",
      clientId: "client-1",
      redirectUri: "https://app.test/cb",
      scope: "openid",
      state: "s",
      codeChallenge: "challenge",
      connectors: ["g"],
      policy,
      freshLogin: false,
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
      policy,
      now: T,
    },
  },
  {
    name: "authRequests.claimUpstream",
    args: { upstreamStateHash: "sh", connector: "g", txnCookieHashes: ["cookie"], policy, now: T },
  },
  {
    name: "authRequests.complete",
    args: {
      requestId: "r1",
      identity: { connector: "g", upstreamId: "1" },
      authTime: T,
      codeHash: "ch",
      codeExpiresAt: T + 60_000,
      policy,
      now: T,
    },
  },
  {
    name: "authRequests.exchangeCode",
    args: {
      clientId: "client-1",
      clientSecretHash: "s",
      tokenEndpointAuthMethod: "client_secret_basic",
      redirectUri: "https://app.test/cb",
      codeHash: "ch",
      codeChallengeOfVerifier: "challenge",
      policy,
      now: T,
    },
  },
  {
    name: "signIns.record",
    args: { appId: "gh-1-web", clientId: "client-1", connector: "g", sub: "g:1", at: T },
  },
  {
    name: "registration.renew",
    args: { clientId: "client-1", registrationTokenHash: "r", now: T },
  },
  { name: "lifecycle.cleanup", args: { now: T + 40 * DAY, signInRetentionMs: DAY } },
];

/** What the cleanup at the end of `signInCommands` deletes: the used code and the old sign-in. */
export const signInCleanup = {
  authRequests: 0,
  authorizationCodes: 1,
  previewClients: 0,
  expiredClients: 0,
  signIns: 1,
  more: false,
};

const parseJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

/**
 * Runs `signInCommands` through a host's `run` mutation (name, arguments as JSON, step clock `T`;
 * the result as JSON) and returns the decoded results.
 */
export const playSignIn = async (
  run: (name: CommandName, args: string, now: number) => Promise<string>,
): Promise<ReadonlyArray<unknown>> => {
  const results: Array<unknown> = [];
  for (const command of signInCommands) {
    const encoded = await run(command.name, JSON.stringify(command.args), T);
    results.push(decodeResult(command.name, parseJson(encoded)));
  }
  return results;
};

/** `signInCommands` on a fresh memory host. */
export const memorySignIn = (): ReadonlyArray<unknown> => {
  const host = makeMemoryStore({ now: T });
  return signInCommands.map((command) => host.run(command.name, command.args));
};
