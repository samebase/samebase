// The port of registration.model.test.ts of the Convex broker (RFC 136, property A: registration and
// ownership). Random stories of GitHub Actions runs, development clients, repository transfers,
// blocks, policy changes, renewals, and self-deletes, played through `fetchBroker` on the memory
// Store. The model knows each repository's owner in the fake GitHub, the newest accepted proof of
// each repository, and the hub's policy; it never reads expected ownership or enrollment back from
// the rows. The runner of model.test.helper.ts is inlined here: the sign-in and refresh worlds of
// that helper are not part of registration.
import fc from "fast-check";
import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  createHub,
  jsonResponse,
  LOOPBACK_CALLBACK,
  postHubClient,
  setBlock,
  signToken,
  stubProviders,
  type Hub,
} from "./testing/hub.ts";

/** The start of every story. */
const EPOCH = Date.UTC(2026, 10, 6, 12, 0, 0);

const REPOSITORIES = ["101", "102"] as const;
const OWNERS = ["201", "202", "203"] as const;
const APPS = ["app-a", "app-b"] as const;
const STAGES = ["prod", "pr-1", "pr-2"] as const;
/** The enrollments a registration asks for, by name. */
const ENROLLMENTS = { fake: ["fake"], both: ["fake", "other"], other: ["other"] } as const;
/** What the hub's policy allows, by name: every connector, one, or none. */
const POLICIES = { all: ["fake", "other"], fakeOnly: ["fake"], none: [] } as const;
/**
 * Mostly short steps, so a retained proof (300 s) is still valid when it is replayed, and a few
 * around its lifetime and around the one-hour windows.
 */
const tickArbitrary = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(1_000, 30_000, 61_000) },
  { weight: 1, arbitrary: fc.constantFrom(299_000, 301_000) },
  { weight: 1, arbitrary: fc.constantFrom(3_599_000, 3_600_000, 3_601_000) },
);

type Repository = (typeof REPOSITORIES)[number];
type Owner = (typeof OWNERS)[number];
type App = (typeof APPS)[number];
type Stage = (typeof STAGES)[number];
type Enrollment = keyof typeof ENROLLMENTS;
type PolicyName = keyof typeof POLICIES;
/** What a host serves at `/samebase-verification.json`. */
type HostOutcome = "present" | "missing" | "wrongId";
/** `blockedWhileFetched`: the file is present, and an admin blocks the repository while it is read. */
type RunHost = HostOutcome | "blockedWhileFetched";

type Command =
  | {
      kind: "run";
      repository: Repository;
      app: App;
      stage: Stage;
      enrollment: Enrollment;
      host: RunHost;
      /** `new`: a token issued now. A number: a retained older token of the repository, by index. */
      proof: "new" | number;
    }
  | {
      kind: "development";
      token: number;
      app: "own" | "other";
      enrollment: Enrollment;
      redirect: "loopback" | HostOutcome;
    }
  | { kind: "transfer"; repository: Repository; owner: Owner }
  | { kind: "block"; action: "block" | "unblock"; scope: "repository"; githubId: Repository }
  | { kind: "block"; action: "block" | "unblock"; scope: "owner"; githubId: Owner }
  /** The hub's policy changes: what it allows, and whether every app but R1's production pauses. */
  | { kind: "policy"; connectors: PolicyName; paused: boolean }
  | { kind: "renew"; client: number }
  | { kind: "deleteOwn"; client: number }
  | { kind: "tick"; ms: number };

const repositoryHandle = (id: string) =>
  `R${REPOSITORIES.findIndex((repository) => repository === id) + 1}`;
const ownerHandle = (id: string) => `O${OWNERS.findIndex((owner) => owner === id) + 1}`;
/** Seconds since the epoch of the run, so a trace shows the order of the `iat` claims. */
const since = (iat: number) => `+${iat - EPOCH / 1_000}s`;

const hostArbitrary = fc.oneof(
  { weight: 4, arbitrary: fc.constant("present" as const) },
  { weight: 1, arbitrary: fc.constant("missing" as const) },
  { weight: 1, arbitrary: fc.constant("wrongId" as const) },
);

const enrollmentArbitrary = fc.constantFrom<Enrollment>("fake", "both", "other");

const commandArbitrary: fc.Arbitrary<Command> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant("run" as const),
      repository: fc.constantFrom(...REPOSITORIES),
      app: fc.constantFrom(...APPS),
      stage: fc.constantFrom(...STAGES),
      enrollment: enrollmentArbitrary,
      host: fc.oneof(
        { weight: 12, arbitrary: hostArbitrary },
        { weight: 1, arbitrary: fc.constant("blockedWhileFetched" as const) },
      ),
      proof: fc.oneof(
        { weight: 2, arbitrary: fc.constant("new" as const) },
        { weight: 1, arbitrary: fc.nat({ max: 7 }) },
      ),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant("development" as const),
      token: fc.nat({ max: 7 }),
      app: fc.oneof(
        { weight: 3, arbitrary: fc.constant("own" as const) },
        { weight: 1, arbitrary: fc.constant("other" as const) },
      ),
      enrollment: enrollmentArbitrary,
      redirect: fc.oneof(
        { weight: 3, arbitrary: fc.constant("loopback" as const) },
        { weight: 1, arbitrary: hostArbitrary },
      ),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("transfer" as const),
      repository: fc.constantFrom(...REPOSITORIES),
      owner: fc.constantFrom(...OWNERS),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("policy" as const),
      connectors: fc.constantFrom<PolicyName>("all", "fakeOnly", "none"),
      paused: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.oneof(
      fc.record({
        kind: fc.constant("block" as const),
        action: fc.constantFrom("block" as const, "unblock" as const),
        scope: fc.constant("repository" as const),
        githubId: fc.constantFrom(...REPOSITORIES),
      }),
      fc.record({
        kind: fc.constant("block" as const),
        action: fc.constantFrom("block" as const, "unblock" as const),
        scope: fc.constant("owner" as const),
        githubId: fc.constantFrom(...OWNERS),
      }),
    ),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("renew" as const), client: fc.nat({ max: 15 }) }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("deleteOwn" as const), client: fc.nat({ max: 15 }) }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant("tick" as const), ms: tickArbitrary }),
  },
);

// The runner: invariants, one story, the property.

/** A broken invariant, by its name in the model. The runner reports it with the trace. */
class Violation extends Error {
  constructor(
    readonly invariant: string,
    message: string,
  ) {
    super(`${invariant}: ${message}`);
  }
}

/** `only` makes one invariant the only one that fails the run; the others are still computed. */
type Checks = { only: string | null };

function check(checks: Checks, invariant: string, holds: boolean, message: string) {
  if (!holds && (checks.only === null || checks.only === invariant)) {
    throw new Violation(invariant, message);
  }
}

/** One played story: the trace of what each command did, with logical handles only. */
type Story = { trace: string[]; commands: number };

/** No answer of the hub is a 500. */
function checkAnswer(checks: Checks, what: string, response: Response) {
  check(checks, "noServerError", response.status !== 500, `${what} answered 500`);
}

/**
 * Plays one command and turns anything that it throws, other than a broken invariant, into the
 * invariant "no command throws".
 */
async function step(checks: Checks, story: Story, run: () => Promise<void>) {
  story.commands += 1;
  try {
    await run();
  } catch (error) {
    if (error instanceof Violation) {
      throw error;
    }
    check(checks, "noCommandThrows", false, error instanceof Error ? error.message : String(error));
  }
}

/** What a registration or a management request answered, as far as the model reads it. */
const Answer = Schema.Struct({
  error: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
  client_id: Schema.optionalKey(Schema.String),
  registration_access_token: Schema.optionalKey(Schema.String),
  registration_client_uri: Schema.optionalKey(Schema.String),
  connectors: Schema.optionalKey(Schema.Array(Schema.String)),
  initial_access_token: Schema.optionalKey(Schema.String),
});
const readAnswer = async (response: Response) =>
  Schema.decodeUnknownSync(Answer)(await response.json());

/** The repository's display name, as GitHub's `repository` claim writes it. */
const repositoryName = (repositoryId: string, ownerId: string) =>
  `owner-${ownerId}/repo-${repositoryId}`;

/** The claims of a run of `stage`: `prod` is a push to main, `pr-<n>` a pull request. */
function stageClaims(stage: string) {
  const pullRequest = /^pr-([1-9][0-9]*)$/.exec(stage)?.[1];
  return pullRequest === undefined
    ? { event_name: "push", ref: "refs/heads/main" }
    : { event_name: "pull_request", ref: `refs/pull/${pullRequest}/merge` };
}

/** A promise that the test settles from outside. */
function deferred<T>() {
  const box: { settle: (value: T) => void } = { settle: () => undefined };
  const promise = new Promise<T>((resolve) => {
    box.settle = resolve;
  });
  return { promise, settle: (value: T) => box.settle(value) };
}

/** The outside parties of one story: GitHub's owners and keys, and the hosts' files. */
async function createWorld(h: Hub, repositories: Record<string, string>) {
  const owners = new Map(Object.entries(repositories));
  let host: { outcome: HostOutcome; repositoryId: string } = {
    outcome: "present",
    repositoryId: "",
  };
  let hostHold: { reached: () => void; release: Promise<void> } | null = null;

  await stubProviders(h, async () => {
    const hold = hostHold;
    hostHold = null;
    if (hold !== null) {
      hold.reached();
      await hold.release;
    }
    switch (host.outcome) {
      case "present":
        return jsonResponse({ repository: host.repositoryId });
      case "missing":
        return new Response("Not Found", { status: 404 });
      case "wrongId":
        return jsonResponse({ repository: "999" });
      default:
        return host.outcome satisfies never;
    }
  });

  return {
    github: {
      ownerOf: (repositoryId: string) => owners.get(repositoryId) ?? "",
      transfer: (repositoryId: string, ownerId: string) => {
        owners.set(repositoryId, ownerId);
      },
      /** A new OIDC token of a run of the repository under its current owner, issued now. */
      async prove(repositoryId: string, stage: string) {
        const ownerId = owners.get(repositoryId) ?? "";
        const iat = Math.floor(h.clock.now() / 1_000);
        const token = await signToken(h, {
          ...stageClaims(stage),
          repository_id: repositoryId,
          repository_owner_id: ownerId,
          repository: repositoryName(repositoryId, ownerId),
          repository_owner: `owner-${ownerId}`,
        });
        return { token, ownerId, iat };
      },
    },
    hosts: {
      /** What every host serves until the next call. */
      serve(answer: { outcome: HostOutcome; repositoryId: string }) {
        host = answer;
      },
      /** The next file request waits until `release`. `reached` settles when it arrives. */
      holdNext() {
        const reached = deferred<true>();
        const release = deferred<undefined>();
        hostHold = { reached: () => reached.settle(true), release: release.promise };
        return {
          reached: reached.promise,
          release: () => {
            hostHold = null;
            release.settle(undefined);
          },
        };
      },
    },
  };
}
type World = Awaited<ReturnType<typeof createWorld>>;

type Proof = {
  handle: string;
  token: string;
  repository: string;
  ownerId: string;
  stage: string;
  iat: number;
};

type Token = {
  handle: string;
  value: string;
  repository: string;
  ownerId: string;
  app: string;
  /** The model's order of accepted registrations. */
  issued: number;
};

type Client = {
  handle: string;
  clientId: string;
  registrationAccessToken: string;
  registrationClientUri: string;
  repository: string;
  production: boolean;
  /** The enrollment the registration asked for, sorted and unique: the row's, for good. */
  connectors: readonly string[];
  deleted: boolean;
};

/** The hub's policy of the moment, which the hub's policy function reads at each request. */
type PolicyState = { connectors: PolicyName; paused: boolean };

function createModel(policy: PolicyState) {
  return {
    /** The order of accepted registrations. */
    order: 0,
    proofs: new Array<Proof>(),
    /** The newest accepted proof of each repository, by `iat`. */
    newest: new Map<string, { iat: number; ownerId: string; proof: string }>(),
    acceptedRuns: new Array<{ repository: string; ownerId: string; order: number }>(),
    blocks: new Set<string>(),
    policy,
    clients: new Array<Client>(),
    tokens: new Array<Token>(),
    /** The owners with an accepted registration: they are never new again. */
    everRegistered: new Set<string>(),
    apps: new Map<string, { tenantId: string }>(),
  };
}
type Model = ReturnType<typeof createModel>;
type Rows = ReturnType<Hub["rows"]>;

const isBlocked = (model: Model, repository: string, ownerId: string) =>
  model.blocks.has(`repository:${repository}`) || model.blocks.has(`owner:${ownerId}`);

/** The pause of the hub's policy: every app but the production of R1. */
const isPaused = (model: Model, repository: string, stage: string) =>
  model.policy.paused && !(repository === REPOSITORIES[0] && stage === "prod");

/** Whether the policy of the moment lets a registration enroll in `enrollment`. */
const enrollmentAllowed = (model: Model, enrollment: Enrollment) => {
  const allowed: readonly string[] = POLICIES[model.policy.connectors];
  return ENROLLMENTS[enrollment].every((name) => allowed.includes(name));
};

/**
 * `policyAtRegistration`: a registration that the policy of the moment pauses or does not allow is
 * refused with the reason of the policy, and one that it allows is never refused for the policy.
 */
function checkPolicy(
  checks: Checks,
  label: string,
  response: Response,
  answer: { reason?: string },
  model: Model,
  args: { repository: string; stage: string; enrollment: Enrollment },
) {
  const paused = isPaused(model, args.repository, args.stage);
  const allowed = enrollmentAllowed(model, args.enrollment);
  check(
    checks,
    "policyAtRegistration",
    !(response.status === 201 && (paused || !allowed)),
    `${label} registered ${paused ? "while paused" : "outside the policy"}`,
  );
  check(
    checks,
    "policyAtRegistration",
    !(answer.reason === "paused" && !paused) &&
      !(answer.reason === "invalid_connectors" && allowed),
    `${label} was refused for the policy, which allows it`,
  );
}

/**
 * A development token works while no later production run of its app and owner replaced it, no
 * accepted run of its repository named another owner since, and its owner is the owner of the
 * newest accepted proof.
 */
function tokenValid(model: Model, token: Token) {
  const replaced = model.tokens.some(
    (other) =>
      other.issued > token.issued &&
      other.repository === token.repository &&
      other.app === token.app &&
      other.ownerId === token.ownerId,
  );
  const transferred = model.acceptedRuns.some(
    (run) =>
      run.order > token.issued &&
      run.repository === token.repository &&
      run.ownerId !== token.ownerId,
  );
  return !replaced && !transferred && model.newest.get(token.repository)?.ownerId === token.ownerId;
}

const sameRows = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A refused registration leaves these tables exactly as they were. */
function checkRefusedRows(checks: Checks, before: Rows, after: Rows) {
  for (const table of ["tenants", "initialAccessTokens", "apps", "clients", "events"] as const) {
    check(
      checks,
      "refusedRegistrationRows",
      sameRows(before[table], after[table]),
      `a refused registration changed ${table}: ${before[table].length} rows before, ${after[table].length} after`,
    );
  }
}

/** A rate limit row's key: its scope and its id. */
const windowKey = (row: { scope: string; githubId: string }) => `${row.scope}:${row.githubId}`;

/**
 * A refused registration changes in `rateLimits` only the request counts of its repository and its
 * owner, never the `new_owners` row.
 */
function checkRefusedRateLimits(
  checks: Checks,
  before: Rows,
  after: Rows,
  repository: string,
  ownerId: string,
) {
  for (const row of after.rateLimits) {
    const old = before.rateLimits.find((candidate) => windowKey(candidate) === windowKey(row));
    const counted =
      (row.scope === "repository" && row.githubId === repository) ||
      (row.scope === "owner" && row.githubId === ownerId);
    const name =
      row.scope === "new_owners"
        ? "the new_owners row"
        : `the ${row.scope} row of ${row.scope === "owner" ? ownerHandle(row.githubId) : repositoryHandle(row.githubId)}`;
    if (!counted) {
      check(
        checks,
        "refusedRegistrationRateLimits",
        old !== undefined && sameRows(old, row),
        `a refused registration ${old === undefined ? "created" : "changed"} ${name}` +
          (row.scope === "new_owners" ? ` (count ${old?.count ?? 0} to ${row.count})` : ""),
      );
    }
  }
  for (const old of before.rateLimits) {
    check(
      checks,
      "refusedRegistrationRateLimits",
      after.rateLimits.some((row) => windowKey(row) === windowKey(old)),
      `a refused registration deleted a ${old.scope} row`,
    );
  }
}

/** How much the new-owners count of the running window grew. A new window starts from zero. */
function newOwnersGrowth(before: Rows, after: Rows) {
  const old = before.rateLimits.find((row) => row.scope === "new_owners");
  const now = after.rateLimits.find((row) => row.scope === "new_owners");
  if (now === undefined) {
    return 0;
  }
  return old === undefined || old.startedAt !== now.startedAt ? now.count : now.count - old.count;
}

/** F3's invariant: the count grows only for a new owner whose registration succeeded. */
function checkNewOwners(checks: Checks, before: Rows, after: Rows, newOwnerRegistered: boolean) {
  const growth = newOwnersGrowth(before, after);
  check(
    checks,
    "newOwnersOnlyForSuccess",
    growth === (newOwnerRegistered ? 1 : 0),
    `the new-owners count grew by ${growth} for a request that ${newOwnerRegistered ? "registered one new owner" : "registered no new owner"}`,
  );
}

/** The checks of the whole state after every command. */
function checkState(h: Hub, model: Model, checks: Checks) {
  const rows = h.rows();
  for (const app of rows.apps) {
    const seen = model.apps.get(app.appId);
    if (seen === undefined) {
      model.apps.set(app.appId, { tenantId: app.tenantId });
    } else {
      check(checks, "appStable", seen.tenantId === app.tenantId, "an app changed its tenant");
    }
  }
  for (const client of model.clients.filter((candidate) => !candidate.deleted)) {
    const row = rows.clients.find((candidate) => candidate.clientId === client.clientId);
    check(
      checks,
      "enrollmentImmutable",
      row === undefined || sameRows(row.connectors, client.connectors),
      `${client.handle} enrolled in ${client.connectors.join(", ")} and now holds ${row?.connectors.join(", ") ?? ""}`,
    );
  }
  check(
    checks,
    "appStable",
    [...model.apps.keys()].every((appId) => rows.apps.some((app) => app.appId === appId)),
    "an app row disappeared",
  );
  const perApp = new Map<string, number>();
  for (const client of rows.clients) {
    perApp.set(client.appId, (perApp.get(client.appId) ?? 0) + 1);
  }
  check(
    checks,
    "caps",
    [...perApp.values()].every((count) => count <= 30),
    "an app has more than 30 clients",
  );
  const perTenant = new Map<string, number>();
  for (const app of rows.apps) {
    perTenant.set(app.tenantId, (perTenant.get(app.tenantId) ?? 0) + 1);
  }
  check(
    checks,
    "caps",
    [...perTenant.values()].every((count) => count <= 10),
    "a tenant has more than 10 apps",
  );

  for (const client of model.clients.filter((candidate) => !candidate.deleted)) {
    const row = rows.clients.some((candidate) => candidate.clientId === client.clientId);
    // The cap evicts the oldest client of a full app, which the next deploy replaces.
    if (!row) {
      client.deleted = true;
      check(
        checks,
        "clientsMatchModel",
        [...perApp.values()].some((count) => count >= 30),
        `${client.handle} disappeared without a delete or an eviction`,
      );
    }
  }
  check(
    checks,
    "clientsMatchModel",
    rows.clients.every((row) =>
      model.clients.some((client) => client.clientId === row.clientId && !client.deleted),
    ),
    "a client row exists that the model does not know",
  );

  for (const [repository, newest] of model.newest) {
    const tenant = rows.tenants.find((row) => row.tenantId === `gh-${repository}`);
    check(
      checks,
      "ownerFollowsNewestProof",
      tenant?.ownerId === newest.ownerId,
      `the tenant of ${repositoryHandle(repository)} names ${tenant?.ownerId === undefined ? "no owner" : ownerHandle(tenant.ownerId)}, ` +
        `but the newest accepted proof ${newest.proof} (iat ${since(newest.iat)}) names ${ownerHandle(newest.ownerId)}`,
    );
  }
}

async function playRun(
  h: Hub,
  world: World,
  model: Model,
  command: Extract<Command, { kind: "run" }>,
  checks: Checks,
  story: Story,
) {
  const retained = model.proofs.filter((candidate) => candidate.repository === command.repository);
  // A retained proof of a repository that has none yet is a new one.
  const chosen =
    command.proof === "new" ? undefined : retained[command.proof % Math.max(1, retained.length)];
  let proof: Proof;
  let origin: string;
  if (chosen === undefined) {
    const issued = await world.github.prove(command.repository, command.stage);
    proof = {
      handle: `P${model.proofs.length + 1}`,
      token: issued.token,
      repository: command.repository,
      ownerId: issued.ownerId,
      stage: command.stage,
      iat: issued.iat,
    };
    model.proofs.push(proof);
    origin = "new";
  } else {
    proof = chosen;
    origin = "retained";
  }
  const blockedBefore = isBlocked(model, proof.repository, proof.ownerId);
  world.hosts.serve({
    outcome: command.host === "blockedWhileFetched" ? "present" : command.host,
    repositoryId: proof.repository,
  });
  const body = {
    software_id: command.app,
    redirect_uris: [
      `https://${command.app}-${proof.stage}.r${proof.repository}.example/auth/hub/callback`,
    ],
    software_version: "abc123",
    connectors: [...ENROLLMENTS[command.enrollment]],
  };
  const before = h.rows();
  let blockedWhileFetched = false;
  let response: Response;
  if (command.host === "blockedWhileFetched") {
    const hold = world.hosts.holdNext();
    const pending = postHubClient(h, proof.token, body);
    const reached = await Promise.race([hold.reached, pending.then(() => false)]);
    if (reached) {
      setBlock(h, { action: "block", kind: "repository", githubId: proof.repository });
      model.blocks.add(`repository:${proof.repository}`);
      blockedWhileFetched = true;
    }
    hold.release();
    response = await pending;
  } else {
    response = await postHubClient(h, proof.token, body);
  }
  const after = h.rows();
  const accepted = response.status === 201;
  const label =
    `run of ${repositoryHandle(proof.repository)} ${command.app} ${proof.stage} (${command.enrollment}) with ${origin} ${proof.handle} ` +
    `(owner ${ownerHandle(proof.ownerId)}, iat ${since(proof.iat)}), host ${command.host}`;
  checkAnswer(checks, label, response);
  const answer = await readAnswer(response);
  check(
    checks,
    "blockedGetsNothing",
    !(accepted && (blockedBefore || blockedWhileFetched)),
    `${label} registered while blocked`,
  );
  checkPolicy(checks, label, response, answer, model, {
    repository: proof.repository,
    stage: proof.stage,
    enrollment: command.enrollment,
  });
  if (!accepted) {
    story.trace.push(
      `${label}: ${response.status}${answer.reason === undefined ? "" : ` ${answer.reason}`}${answer.error === undefined ? "" : ` ${answer.error}`}`,
    );
    checkRefusedRows(checks, before, after);
    checkRefusedRateLimits(checks, before, after, proof.repository, proof.ownerId);
    checkNewOwners(checks, before, after, false);
    return;
  }
  check(
    checks,
    "enrollmentImmutable",
    sameRows(answer.connectors, [...new Set(ENROLLMENTS[command.enrollment])].sort()),
    `${label} answered the enrollment ${answer.connectors?.join(", ") ?? "none"}`,
  );
  checkNewOwners(checks, before, after, !model.everRegistered.has(proof.ownerId));
  model.order += 1;
  model.everRegistered.add(proof.ownerId);
  model.acceptedRuns.push({
    repository: proof.repository,
    ownerId: proof.ownerId,
    order: model.order,
  });
  const newest = model.newest.get(proof.repository);
  // Another owner needs a strictly newer proof, so an accepted tie can only be the same owner.
  if (newest === undefined || proof.iat > newest.iat) {
    model.newest.set(proof.repository, {
      iat: proof.iat,
      ownerId: proof.ownerId,
      proof: proof.handle,
    });
  }
  const client: Client = {
    handle: `C${model.clients.length + 1}`,
    clientId: answer.client_id ?? "",
    registrationAccessToken: answer.registration_access_token ?? "",
    registrationClientUri: answer.registration_client_uri ?? "",
    repository: proof.repository,
    production: proof.stage === "prod",
    connectors: answer.connectors ?? [],
    deleted: false,
  };
  model.clients.push(client);
  let issued = "";
  if (answer.initial_access_token !== undefined) {
    const token: Token = {
      handle: `T${model.tokens.length + 1}`,
      value: answer.initial_access_token,
      repository: proof.repository,
      ownerId: proof.ownerId,
      app: command.app,
      issued: model.order,
    };
    model.tokens.push(token);
    issued = ` and ${token.handle}`;
  }
  story.trace.push(`${label}: 201, ${client.handle}${issued}`);
}

async function playDevelopment(
  h: Hub,
  world: World,
  model: Model,
  command: Extract<Command, { kind: "development" }>,
  checks: Checks,
  story: Story,
) {
  const token = model.tokens.at(command.token % Math.max(1, model.tokens.length));
  if (token === undefined) {
    story.trace.push("development: no initial access token yet, skipped");
    return;
  }
  const app =
    command.app === "own" ? token.app : (APPS.find((name) => name !== token.app) ?? token.app);
  if (command.redirect !== "loopback") {
    world.hosts.serve({ outcome: command.redirect, repositoryId: token.repository });
  }
  const redirectUri =
    command.redirect === "loopback"
      ? LOOPBACK_CALLBACK
      : `https://${app}-dev.r${token.repository}.example/auth/hub/callback`;
  const valid = tokenValid(model, token);
  const blocked = isBlocked(model, token.repository, token.ownerId);
  const before = h.rows();
  const response = await postHubClient(h, token.value, {
    software_id: app,
    redirect_uris: [redirectUri],
    software_version: "dev-1",
    connectors: [...ENROLLMENTS[command.enrollment]],
  });
  const after = h.rows();
  const accepted = response.status === 201;
  const label =
    `development with ${token.handle} (${repositoryHandle(token.repository)} ${token.app}, owner ${ownerHandle(token.ownerId)}${valid ? "" : ", stopped in the model"}) ` +
    `for ${app} (${command.enrollment}) on ${command.redirect}`;
  checkAnswer(checks, label, response);
  const answer = await readAnswer(response);
  story.trace.push(
    `${label}: ${response.status}${answer.reason === undefined ? "" : ` ${answer.reason}`}${answer.error === undefined ? "" : ` ${answer.error}`}`,
  );
  // A token whose row names another app or owner is refused before the policy runs; the policy
  // sees the token's row, so a development client is never R1's production.
  if (valid && app === token.app) {
    checkPolicy(checks, label, response, answer, model, {
      repository: token.repository,
      stage: "development",
      enrollment: command.enrollment,
    });
  }
  check(
    checks,
    "developmentTokenScope",
    !(accepted && !valid),
    `${label} registered with a token that must have stopped`,
  );
  check(
    checks,
    "developmentTokenScope",
    !(accepted && app !== token.app),
    `${label} registered another app`,
  );
  check(checks, "blockedGetsNothing", !(accepted && blocked), `${label} registered while blocked`);
  if (!accepted) {
    checkRefusedRows(checks, before, after);
    checkRefusedRateLimits(checks, before, after, token.repository, token.ownerId);
    checkNewOwners(checks, before, after, false);
    return;
  }
  checkNewOwners(checks, before, after, !model.everRegistered.has(token.ownerId));
  const row = after.clients.find((candidate) => candidate.clientId === answer.client_id);
  check(
    checks,
    "developmentTokenScope",
    row !== undefined &&
      row.app === token.app &&
      row.appId.startsWith(`gh-${token.repository}-`) &&
      row.deploymentType === "development",
    `${label} made a client outside its app and repository`,
  );
  model.order += 1;
  model.everRegistered.add(token.ownerId);
  model.clients.push({
    handle: `C${model.clients.length + 1}`,
    clientId: answer.client_id ?? "",
    registrationAccessToken: answer.registration_access_token ?? "",
    registrationClientUri: answer.registration_client_uri ?? "",
    repository: token.repository,
    production: false,
    connectors: answer.connectors ?? [],
    deleted: false,
  });
}

async function playClient(
  h: Hub,
  model: Model,
  command: Extract<Command, { kind: "renew" | "deleteOwn" }>,
  checks: Checks,
  story: Story,
) {
  const client = model.clients.at(command.client % Math.max(1, model.clients.length));
  if (client === undefined) {
    story.trace.push(`${command.kind}: no client yet, skipped`);
    return;
  }
  const response = await h.fetchBroker(client.registrationClientUri, {
    method: command.kind === "renew" ? "GET" : "DELETE",
    headers: { Authorization: `Bearer ${client.registrationAccessToken}` },
  });
  const label = `${command.kind} ${client.handle}${client.deleted ? " (deleted)" : ""}`;
  story.trace.push(`${label}: ${response.status}`);
  checkAnswer(checks, label, response);
  check(
    checks,
    "deletedClientDenied",
    !client.deleted || response.status === 401,
    `${label} answered ${response.status}`,
  );
  if (command.kind === "renew") {
    const owner = h
      .rows()
      .tenants.find((row) => row.tenantId === `gh-${client.repository}`)?.ownerId;
    check(
      checks,
      "blockedGetsNothing",
      !(response.status === 200 && isBlocked(model, client.repository, owner ?? "")),
      `${label} renewed while blocked`,
    );
    return;
  }
  if (!client.deleted) {
    const expected = client.production ? 403 : 204;
    check(
      checks,
      "selfDelete",
      response.status === expected,
      `${label} answered ${response.status}, not ${expected}`,
    );
    client.deleted = response.status === 204;
  }
}

async function playCommand(
  h: Hub,
  world: World,
  model: Model,
  command: Command,
  checks: Checks,
  story: Story,
) {
  switch (command.kind) {
    case "run":
      return await playRun(h, world, model, command, checks, story);
    case "development":
      return await playDevelopment(h, world, model, command, checks, story);
    case "transfer": {
      const from = world.github.ownerOf(command.repository);
      world.github.transfer(command.repository, command.owner);
      story.trace.push(
        `transfer ${repositoryHandle(command.repository)} from ${ownerHandle(from)} to ${ownerHandle(command.owner)}`,
      );
      return;
    }
    case "block": {
      setBlock(h, { action: command.action, kind: command.scope, githubId: command.githubId });
      const target =
        command.scope === "owner"
          ? ownerHandle(command.githubId)
          : repositoryHandle(command.githubId);
      story.trace.push(`${command.action} ${command.scope} ${target}`);
      if (command.action === "block") {
        model.blocks.add(`${command.scope}:${command.githubId}`);
      } else {
        model.blocks.delete(`${command.scope}:${command.githubId}`);
      }
      return;
    }
    case "policy":
      model.policy.connectors = command.connectors;
      model.policy.paused = command.paused;
      story.trace.push(
        `policy: ${command.connectors}${command.paused ? ", paused but R1 prod" : ""}`,
      );
      return;
    case "renew":
    case "deleteOwn":
      return await playClient(h, model, command, checks, story);
    case "tick":
      h.clock.advance(command.ms);
      story.trace.push(`tick ${command.ms / 1_000}s`);
      return;
    default:
      return command satisfies never;
  }
}

/** Plays one story on a fresh hub, from the epoch, and checks the invariants after each command. */
async function play(commands: Command[], checks: Checks, story: Story) {
  const policy: PolicyState = { connectors: "all", paused: false };
  // The shape of our hub's policy: every connector, and a pause that spares R1's production.
  const h = await createHub({
    policy: (registration) => ({
      connectors: [...POLICIES[policy.connectors]],
      resources: [],
      paused:
        policy.paused &&
        !(
          registration.repositoryId === REPOSITORIES[0] &&
          registration.deploymentType === "production"
        ),
    }),
  });
  h.clock.set(EPOCH);
  const world = await createWorld(h, {
    [REPOSITORIES[0]]: OWNERS[0],
    [REPOSITORIES[1]]: OWNERS[1],
  });
  const model = createModel(policy);
  for (const command of commands) {
    await step(checks, story, async () => {
      await playCommand(h, world, model, command, checks, story);
      checkState(h, model, checks);
    });
  }
  check(
    checks,
    "noUnexpectedRequest",
    h.fetch.unexpected.length === 0,
    h.fetch.unexpected.join("; "),
  );
}

/**
 * Runs `play` on generated command lists with fast-check, from a fixed seed (136, as the source).
 * A failure answers the seed, the shrink path and the minimized trace, as it replayed once more.
 */
async function checkModel(options: { numRuns: number; seed: number }) {
  const checks: Checks = { only: null };
  const result = await fc.check(
    fc.asyncProperty(
      // `size: "max"`: lengths up to the whole budget, not fast-check's small default of ten.
      fc.array(commandArbitrary, { minLength: 1, maxLength: 30, size: "max" }),
      async (commands) => {
        await play(commands, checks, { trace: [], commands: 0 });
      },
    ),
    { numRuns: options.numRuns, seed: options.seed },
  );
  if (!result.failed || result.counterexample === null) {
    return null;
  }
  const [commands] = result.counterexample;
  const story: Story = { trace: [], commands: 0 };
  let failure = "the replay did not fail again";
  try {
    await play(commands, checks, story);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  return [
    "property A failed",
    `seed: ${result.seed}`,
    `path: ${result.counterexamplePath}`,
    `clock: starts at ${new Date(EPOCH).toISOString()}`,
    `failure: ${failure}`,
    "minimized trace:",
    ...story.trace.map((line, index) => `  ${index + 1}. ${line}`),
  ].join("\n");
}

/** A regression: plays the minimized story and fails on the one named invariant only. */
async function replay(commands: Command[], invariant: string) {
  await play(commands, { only: invariant }, { trace: [], commands: 0 });
}

describe("RFC 136 property A: registration and ownership", () => {
  it("keeps every registration invariant in random stories", async () => {
    expect(await checkModel({ numRuns: 25, seed: 136 })).toBeNull();
  }, 600_000);

  it("keeps every registration invariant from another seed", async () => {
    expect(await checkModel({ numRuns: 25, seed: 7_136 })).toBeNull();
  }, 600_000);
});

const run = (
  repository: Repository,
  proof: "new" | number,
  host: RunHost = "present",
): Command => ({
  kind: "run",
  enrollment: "fake",
  repository,
  app: "app-a",
  stage: "prod",
  host,
  proof,
});

// The counterexamples that property A found in the Convex broker 0.21.0, kept as fixed stories.
describe("RFC 136 property A regressions", () => {
  // F3: `admit` counted a new owner before the host check, so a refused request used the allowance.
  it("F3: a refused registration does not count a new owner", async () => {
    await replay([run("102", "new", "missing")], "newOwnersOnlyForSuccess");
  });

  // F5: a retained older GitHub token moved the tenant's owner back after a transfer.
  it("F5: an older proof never moves the owner back", async () => {
    await replay(
      [
        run("101", "new"),
        { kind: "tick", ms: 1_000 },
        { kind: "transfer", repository: "101", owner: "202" },
        run("101", "new"),
        run("101", 0),
      ],
      "ownerFollowsNewestProof",
    );
  });

  // F5 with a tie: the new owner's token of the same second was accepted, so the old owner's token
  // of that second could take the repository back.
  it("F5: a proof of another owner from the same second does not move the owner", async () => {
    await replay(
      [
        run("101", "new"),
        { kind: "transfer", repository: "101", owner: "202" },
        run("101", "new"),
        run("101", 0),
      ],
      "ownerFollowsNewestProof",
    );
  });

  // F5, seen from development: the replayed older proof deleted the new owner's token and gave the
  // old owner a fresh one, which then registered a development client.
  it("F5: the old owner's development server gets no client after a transfer", async () => {
    await replay(
      [
        run("101", "new"),
        { kind: "tick", ms: 1_000 },
        { kind: "transfer", repository: "101", owner: "202" },
        run("101", "new"),
        run("101", 0),
        { kind: "development", token: 2, app: "own", enrollment: "fake", redirect: "loopback" },
      ],
      "developmentTokenScope",
    );
  });

  // Writes before refusals: the creating command deleted the old owner's initial access token
  // before it read the blocks again, so a run refused by a block set during its host check still
  // deleted it.
  it("a refused registration deletes no initial access token", async () => {
    await replay(
      [
        run("102", "new"),
        { kind: "transfer", repository: "102", owner: "201" },
        run("102", "new", "blockedWhileFetched"),
      ],
      "refusedRegistrationRows",
    );
  });

  // Writes before refusals (F3's write): `admit` marked a new owner as counted before the host check.
  it("a refused registration changes only the repository and owner counts", async () => {
    await replay([run("102", "new", "missing")], "refusedRegistrationRateLimits");
  });
});
