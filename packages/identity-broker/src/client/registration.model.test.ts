/// <reference types="vite-plus/client" />
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Harness } from "./harness.test.helper.js";
import { LOOPBACK_CALLBACK, postHubClient, setBlock, type NewClient } from "./hub.test.helper.js";
import {
  advanceClock,
  check,
  checkAnswer,
  checkModel,
  createModelHub,
  createWorld,
  EPOCH,
  readRows,
  startClock,
  step,
  type Checks,
  type HostOutcome,
  type Rows,
  type Story,
  type World,
} from "./model.test.helper.js";

// RFC 136, property A: registration and ownership. Random stories of GitHub Actions runs, laptops,
// repository transfers, blocks, renewals, and self-deletes, played through `fetchBroker` against the
// real component. The model knows each repository's owner in the fake GitHub and the newest
// accepted proof of each repository; it never reads expected ownership back from the rows.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const REPOSITORIES = ["101", "102"] as const;
const OWNERS = ["201", "202", "203"] as const;
const APPS = ["app-a", "app-b"] as const;
const STAGES = ["prod", "pr-1", "pr-2"] as const;
/**
 * Mostly short steps, so a retained proof (300 s) is still valid when it is replayed, and a few
 * around its lifetime and around the one-hour windows.
 */
const tickArbitrary = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(1_000, 30_000, 61_000) },
  { weight: 1, arbitrary: fc.constantFrom(299_000, 301_000) },
  { weight: 1, arbitrary: fc.constantFrom(3_599_000, 3_600_000, 3_601_000) },
);
/** The first repository's apps are the hub's own, so both kinds of trust are in every story. */
const OWN_REPOSITORY = "101";

type Repository = (typeof REPOSITORIES)[number];
type Owner = (typeof OWNERS)[number];
type App = (typeof APPS)[number];
type Stage = (typeof STAGES)[number];
/** `blockedWhileFetched`: the file is present, and an admin blocks the repository while it is read. */
type RunHost = HostOutcome | "blockedWhileFetched";

type Command =
  | {
      kind: "run";
      repository: Repository;
      app: App;
      stage: Stage;
      host: RunHost;
      /** `new`: a token issued now. A number: a retained older token of the repository, by index. */
      proof: "new" | number;
    }
  | { kind: "laptop"; token: number; app: "own" | "other"; redirect: "loopback" | HostOutcome }
  | { kind: "transfer"; repository: Repository; owner: Owner }
  | { kind: "block"; action: "block" | "unblock"; scope: "repository"; githubId: Repository }
  | { kind: "block"; action: "block" | "unblock"; scope: "owner"; githubId: Owner }
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

const commandArbitrary: fc.Arbitrary<Command> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant("run" as const),
      repository: fc.constantFrom(...REPOSITORIES),
      app: fc.constantFrom(...APPS),
      stage: fc.constantFrom(...STAGES),
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
      kind: fc.constant("laptop" as const),
      token: fc.nat({ max: 7 }),
      app: fc.oneof(
        { weight: 3, arbitrary: fc.constant("own" as const) },
        { weight: 1, arbitrary: fc.constant("other" as const) },
      ),
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
  deleted: boolean;
};

function createModel() {
  return {
    /** The order of accepted registrations. */
    order: 0,
    proofs: new Array<Proof>(),
    /** The newest accepted proof of each repository, by `iat`; a later acceptance wins a tie. */
    newest: new Map<string, { iat: number; ownerId: string; proof: string }>(),
    acceptedRuns: new Array<{ repository: string; ownerId: string; order: number }>(),
    blocks: new Set<string>(),
    clients: new Array<Client>(),
    tokens: new Array<Token>(),
    /** The owners with an accepted registration: they are never new again. */
    everRegistered: new Set<string>(),
    apps: new Map<string, { tenantId: string; firstParty: boolean; connector: string | null }>(),
  };
}

type Model = ReturnType<typeof createModel>;

const isBlocked = (model: Model, repository: string, ownerId: string) =>
  model.blocks.has(`repository:${repository}`) || model.blocks.has(`owner:${ownerId}`);

/**
 * A laptop token works while no later production run of its app and owner replaced it, no accepted
 * run of its repository named another owner since, and its owner is the owner of the newest
 * accepted proof.
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

/** Which rows a table gained, lost, or changed, by id. Rows hold hashes only, and none is shown. */
function rowChanges(before: { _id: string }[], after: { _id: string }[]) {
  const added = after.filter((row) => !before.some((old) => old._id === row._id)).length;
  const removed = before.filter((row) => !after.some((now) => now._id === row._id)).length;
  const changed = after.filter((row) => {
    const old = before.find((candidate) => candidate._id === row._id);
    return old !== undefined && !sameRows(old, row);
  }).length;
  return `${added} added, ${removed} deleted, ${changed} changed`;
}

/**
 * A refused registration leaves these tables exactly as they were. The `block_change` event of a
 * block that lands while the request runs is that block's own row, not the registration's.
 */
function checkRefusedRows(checks: Checks, before: Rows, after: Rows) {
  const registrationEvents = (rows: Rows) =>
    rows.events.filter((event) => event.kind === "registration");
  for (const table of ["tenants", "initialAccessTokens", "apps", "clients"] as const) {
    check(
      checks,
      "refusedRegistrationRows",
      sameRows(before[table], after[table]),
      `a refused registration changed ${table}: ${rowChanges(before[table], after[table])}`,
    );
  }
  check(
    checks,
    "refusedRegistrationRows",
    sameRows(registrationEvents(before), registrationEvents(after)),
    `a refused registration changed events: ${rowChanges(registrationEvents(before), registrationEvents(after))}`,
  );
}

/**
 * A refused registration changes in `rateLimits` only the request counts of its repository and its
 * owner: never the `new_owners` row, and never an owner row's `newOwnersWindowStartedAt`.
 */
function checkRefusedRateLimits(
  checks: Checks,
  before: Rows,
  after: Rows,
  repository: string,
  ownerId: string,
) {
  for (const row of after.rateLimits) {
    const old = before.rateLimits.find((candidate) => candidate._id === row._id);
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
    } else if (row.scope === "owner") {
      check(
        checks,
        "refusedRegistrationRateLimits",
        row.newOwnersWindowStartedAt === (old?.newOwnersWindowStartedAt ?? null),
        `a refused registration set newOwnersWindowStartedAt on ${name}`,
      );
    }
  }
  for (const old of before.rateLimits) {
    check(
      checks,
      "refusedRegistrationRateLimits",
      after.rateLimits.some((row) => row._id === old._id),
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
    growth <= (newOwnerRegistered ? 1 : 0),
    `the new-owners count grew by ${growth} for a request that ${newOwnerRegistered ? "registered one new owner" : "registered no new owner"}`,
  );
}

/** The checks of the whole state after every command. */
async function checkState(h: Harness, model: Model, checks: Checks) {
  const rows = await readRows(h);
  for (const app of rows.apps) {
    const trust = {
      tenantId: app.tenantId,
      firstParty: app.firstParty,
      connector: app.connector ?? null,
    };
    const seen = model.apps.get(app.appId);
    if (seen === undefined) {
      model.apps.set(app.appId, trust);
    } else {
      check(checks, "appStable", sameRows(seen, trust), "an app changed its tenant or trust");
    }
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
  h: Harness,
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
    app: command.app,
    redirectUri: `https://${command.app}-${proof.stage}.r${proof.repository}.example/auth/hub/callback`,
    softwareVersion: "abc123",
  };
  const before = await readRows(h);
  let blockedWhileFetched = false;
  let response: Response;
  if (command.host === "blockedWhileFetched") {
    const hold = world.hosts.holdNext();
    const pending = postHubClient(h, proof.token, body);
    const reached = await Promise.race([hold.reached, pending.then(() => false)]);
    if (reached) {
      const blocked = await setBlock(h, {
        action: "block",
        kind: "repository",
        githubId: proof.repository,
      });
      checkAnswer(checks, "POST /moderation/blocks", blocked);
      model.blocks.add(`repository:${proof.repository}`);
      blockedWhileFetched = true;
    }
    hold.release();
    response = await pending;
  } else {
    response = await postHubClient(h, proof.token, body);
  }
  const after = await readRows(h);
  const accepted = response.status === 201;
  const answer: Partial<NewClient> & { reason?: string } = await response.json();
  const label =
    `run of ${repositoryHandle(proof.repository)} ${command.app} ${proof.stage} with ${origin} ${proof.handle} ` +
    `(owner ${ownerHandle(proof.ownerId)}, iat ${since(proof.iat)}), host ${command.host}`;
  checkAnswer(checks, label, response);
  check(
    checks,
    "blockedGetsNothing",
    !(accepted && (blockedBefore || blockedWhileFetched)),
    `${label} registered while blocked`,
  );
  if (!accepted) {
    story.trace.push(
      `${label}: ${response.status}${answer.reason === undefined ? "" : ` ${answer.reason}`}`,
    );
    checkRefusedRows(checks, before, after);
    checkRefusedRateLimits(checks, before, after, proof.repository, proof.ownerId);
    checkNewOwners(checks, before, after, false);
    return;
  }
  checkNewOwners(checks, before, after, !model.everRegistered.has(proof.ownerId));
  model.order += 1;
  model.everRegistered.add(proof.ownerId);
  model.acceptedRuns.push({
    repository: proof.repository,
    ownerId: proof.ownerId,
    order: model.order,
  });
  const newest = model.newest.get(proof.repository);
  if (newest === undefined || proof.iat >= newest.iat) {
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

async function playLaptop(
  h: Harness,
  world: World,
  model: Model,
  command: Extract<Command, { kind: "laptop" }>,
  checks: Checks,
  story: Story,
) {
  const token = model.tokens[command.token % Math.max(1, model.tokens.length)];
  if (token === undefined) {
    story.trace.push("laptop: no initial access token yet, skipped");
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
  const before = await readRows(h);
  const response = await postHubClient(h, token.value, {
    app,
    redirectUri,
    softwareVersion: "dev-1",
  });
  const after = await readRows(h);
  const accepted = response.status === 201;
  const answer: Partial<NewClient> & { reason?: string } = await response.json();
  const label =
    `laptop with ${token.handle} (${repositoryHandle(token.repository)} ${token.app}, owner ${ownerHandle(token.ownerId)}${valid ? "" : ", stopped in the model"}) ` +
    `for ${app} on ${command.redirect}`;
  story.trace.push(
    `${label}: ${response.status}${answer.reason === undefined ? "" : ` ${answer.reason}`}`,
  );
  checkAnswer(checks, label, response);
  check(
    checks,
    "laptopTokenScope",
    !(accepted && !valid),
    `${label} registered with a token that must have stopped`,
  );
  check(
    checks,
    "laptopTokenScope",
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
    "laptopTokenScope",
    row !== undefined &&
      row.app === token.app &&
      row.appId.startsWith(`gh-${token.repository}-`) &&
      row.appId.endsWith("-preview") &&
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
    deleted: false,
  });
}

async function playClient(
  h: Harness,
  model: Model,
  command: Extract<Command, { kind: "renew" | "deleteOwn" }>,
  checks: Checks,
  story: Story,
) {
  const client = model.clients[command.client % Math.max(1, model.clients.length)];
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
    const rows = await readRows(h);
    const owner = rows.tenants.find((row) => row.tenantId === `gh-${client.repository}`)?.ownerId;
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
  h: Harness,
  world: World,
  model: Model,
  command: Command,
  checks: Checks,
  story: Story,
) {
  switch (command.kind) {
    case "run":
      return await playRun(h, world, model, command, checks, story);
    case "laptop":
      return await playLaptop(h, world, model, command, checks, story);
    case "transfer": {
      const from = world.github.ownerOf(command.repository);
      world.github.transfer(command.repository, command.owner);
      story.trace.push(
        `transfer ${repositoryHandle(command.repository)} from ${ownerHandle(from)} to ${ownerHandle(command.owner)}`,
      );
      return;
    }
    case "block": {
      const response = await setBlock(h, {
        action: command.action,
        kind: command.scope,
        githubId: command.githubId,
      });
      const target =
        command.scope === "owner"
          ? ownerHandle(command.githubId)
          : repositoryHandle(command.githubId);
      story.trace.push(`${command.action} ${command.scope} ${target}: ${response.status}`);
      checkAnswer(checks, `${command.action} ${target}`, response);
      if (command.action === "block") {
        model.blocks.add(`${command.scope}:${command.githubId}`);
      } else {
        model.blocks.delete(`${command.scope}:${command.githubId}`);
      }
      return;
    }
    case "renew":
    case "deleteOwn":
      return await playClient(h, model, command, checks, story);
    case "tick":
      advanceClock(command.ms);
      story.trace.push(`tick ${command.ms / 1_000}s`);
      return;
    default:
      return command satisfies never;
  }
}

/** Plays one story on a fresh hub, from the epoch, and checks the invariants after each command. */
async function play(commands: Command[], checks: Checks, story: Story) {
  startClock();
  vi.stubEnv("OWN_REPOSITORY_IDS", OWN_REPOSITORY);
  const h = await createModelHub({ resources: [] });
  const world = await createWorld({ [REPOSITORIES[0]]: OWNERS[0], [REPOSITORIES[1]]: OWNERS[1] });
  const model = createModel();
  for (const command of commands) {
    await step(checks, story, async () => {
      await playCommand(h, world, model, command, checks, story);
      await checkState(h, model, checks);
    });
  }
  check(checks, "noUnexpectedRequest", world.unexpected.length === 0, world.unexpected.join("; "));
}

/** A regression: plays the minimized story and fails on the one named invariant only. */
async function replay(commands: Command[], invariant: string) {
  await play(commands, { only: invariant }, { trace: [], commands: 0 });
}

describe("RFC 136 property A: registration and ownership", () => {
  // Fails on today's code (F3 first, see the regressions below), so the property is marked to fail.
  // Remove `.fails` when F3, F5, and the refused writes are fixed.
  it.fails("keeps every registration invariant in random stories", async () => {
    const { report } = await checkModel({
      name: "property A",
      // `size: "max"`: lengths up to the whole budget, not fast-check's small default of ten.
      commands: fc.array(commandArbitrary, { minLength: 1, maxLength: 30, size: "max" }),
      play,
      numRuns: 25,
    });
    expect(report).toBeNull();
  }, 600_000);
});

describe("RFC 136 property A regressions, failing on today's code", () => {
  // F3: `admit` counts a new owner before the host check, so a refused request uses the allowance.
  it.fails("F3: a refused registration does not count a new owner", async () => {
    await replay(
      [
        {
          kind: "run",
          repository: "102",
          app: "app-a",
          stage: "prod",
          host: "missing",
          proof: "new",
        },
      ],
      "newOwnersOnlyForSuccess",
    );
  });

  // F5: a retained older GitHub token moves the tenant's owner back after a transfer.
  it.fails("F5: an older proof never moves the owner back", async () => {
    await replay(
      [
        {
          kind: "run",
          repository: "101",
          app: "app-a",
          stage: "prod",
          host: "present",
          proof: "new",
        },
        { kind: "tick", ms: 1_000 },
        { kind: "transfer", repository: "101", owner: "202" },
        {
          kind: "run",
          repository: "101",
          app: "app-a",
          stage: "prod",
          host: "present",
          proof: "new",
        },
        { kind: "run", repository: "101", app: "app-a", stage: "prod", host: "present", proof: 0 },
      ],
      "ownerFollowsNewestProof",
    );
  });

  // F5, seen from the laptop: the replayed older proof deletes the new owner's token and gives the
  // old owner a fresh one (T3), which then registers a development client.
  it.fails("F5: the old owner's laptop gets no client after a transfer", async () => {
    await replay(
      [
        {
          kind: "run",
          repository: "101",
          app: "app-a",
          stage: "prod",
          host: "present",
          proof: "new",
        },
        { kind: "tick", ms: 1_000 },
        { kind: "transfer", repository: "101", owner: "202" },
        {
          kind: "run",
          repository: "101",
          app: "app-a",
          stage: "prod",
          host: "present",
          proof: "new",
        },
        { kind: "run", repository: "101", app: "app-a", stage: "prod", host: "present", proof: 0 },
        { kind: "laptop", token: 2, app: "own", redirect: "loopback" },
      ],
      "laptopTokenScope",
    );
  });

  // Writes before refusals: `createClient` deletes the old owner's initial access token before it
  // reads the blocks again, so a run refused by a block set during its host check still deletes it.
  it.fails("a refused registration deletes no initial access token", async () => {
    await replay(
      [
        {
          kind: "run",
          repository: "102",
          app: "app-a",
          stage: "prod",
          host: "present",
          proof: "new",
        },
        { kind: "transfer", repository: "102", owner: "201" },
        {
          kind: "run",
          repository: "102",
          app: "app-a",
          stage: "prod",
          host: "blockedWhileFetched",
          proof: "new",
        },
      ],
      "refusedRegistrationRows",
    );
  });

  // Writes before refusals (F3's write): `admit` marks a new owner as counted before the host check.
  it.fails("a refused registration changes only the repository and owner counts", async () => {
    await replay(
      [
        {
          kind: "run",
          repository: "102",
          app: "app-a",
          stage: "prod",
          host: "missing",
          proof: "new",
        },
      ],
      "refusedRegistrationRateLimits",
    );
  });
});
