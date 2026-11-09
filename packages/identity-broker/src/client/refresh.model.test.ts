/// <reference types="vite-plus/client" />
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ISSUER, pkce, txnCookie, type Harness } from "./harness.test.helper.js";
import { moderationRequest, postHubClient, setBlock, type NewClient } from "./hub.test.helper.js";
import {
  advanceClock,
  check,
  checkAnswer,
  checkModel,
  createModelHub,
  createWorld,
  readGrant,
  readRows,
  RESOURCE,
  startClock,
  step,
  type Checks,
  type HeldRefresh,
  type RefreshOutcome,
  type Story,
  type World,
} from "./model.test.helper.js";

// RFC 136, property B: resource refresh. Random stories of API resource authorizations, refreshes
// whose provider answer is held between `refreshStart` and `refreshFinish`, blocks, policy changes
// (the resource withdrawn, or the pause), client deletes, revocations, and clock steps, played
// through `fetchBroker` against the real component. The hub's policy gives every client the one
// resource until a story withdraws it.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const REPOSITORIES = ["101", "102"] as const;
const OWNERS = ["201", "202"] as const;
/** The clients of every story: a production client and a preview of R1, and a preview of R2. */
const CLIENTS = [
  { repository: "101", stage: "prod" },
  { repository: "101", stage: "pr-1" },
  { repository: "102", stage: "pr-1" },
] as const;
/** Around the refresh claim's lease of 60 seconds. */
const TICKS = [1_000, 30_000, 61_000] as const;

type Repository = (typeof REPOSITORIES)[number];
type Owner = (typeof OWNERS)[number];

type Command =
  | { kind: "authorize"; client: number }
  | { kind: "refreshStart"; grant: number }
  | { kind: "refreshFinish"; attempt: number; outcome: RefreshOutcome }
  | { kind: "block"; action: "block" | "unblock"; scope: "repository"; githubId: Repository }
  | { kind: "block"; action: "block" | "unblock"; scope: "owner"; githubId: Owner }
  /** The hub's policy changes: whether it gives the resource, and whether it pauses every client. */
  | { kind: "policy"; resources: boolean; paused: boolean }
  | { kind: "deleteOwn"; client: number }
  | { kind: "adminDelete"; client: number }
  | { kind: "revoke"; grant: number }
  | { kind: "tick"; ms: number }
  | { kind: "drain" };

const repositoryHandle = (id: string) =>
  `R${REPOSITORIES.findIndex((repository) => repository === id) + 1}`;
const ownerHandle = (id: string) => `O${OWNERS.findIndex((owner) => owner === id) + 1}`;

const clientIndex = fc.nat({ max: CLIENTS.length - 1 });

const commandArbitrary: fc.Arbitrary<Command> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record({ kind: fc.constant("authorize" as const), client: clientIndex }),
  },
  {
    weight: 4,
    arbitrary: fc.record({ kind: fc.constant("refreshStart" as const), grant: fc.nat({ max: 7 }) }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("refreshFinish" as const),
      attempt: fc.nat({ max: 7 }),
      outcome: fc.constantFrom("tokens" as const, "invalid_grant" as const, "transient" as const),
    }),
  },
  {
    weight: 2,
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
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant("policy" as const),
      resources: fc.boolean(),
      paused: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("deleteOwn" as const), client: clientIndex }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("adminDelete" as const), client: clientIndex }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("revoke" as const), grant: fc.nat({ max: 7 }) }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant("tick" as const), ms: fc.constantFrom(...TICKS) }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("drain" as const) }) },
);

type Client = {
  handle: string;
  clientId: string;
  clientSecret: string;
  registrationAccessToken: string;
  registrationClientUri: string;
  redirectUri: string;
  repository: string;
  ownerId: string;
  production: boolean;
  deleted: "self" | "admin" | null;
};

type Grant = {
  handle: string;
  client: Client;
  /** The broker's refresh token, which stays the same for the grant's life. */
  refreshToken: string;
  ended: "revoked" | "rejected" | null;
  /** The attempts that claimed the grant, oldest first. Only the last one is current. */
  claims: string[];
};

type Attempt = {
  handle: string;
  grant: Grant;
  held: HeldRefresh;
  response: Promise<Response>;
  open: boolean;
};

/** The hub's policy of the moment, which `createModelHub`'s policy function reads at each request. */
type PolicyState = { resources: boolean; paused: boolean };

function createModel(clients: Client[], policy: PolicyState) {
  return {
    clients,
    blocks: new Set<string>(),
    policy,
    grants: new Array<Grant>(),
    attempts: new Array<Attempt>(),
  };
}

type Model = ReturnType<typeof createModel>;

/** Why the client may get no provider token now, or null. */
function stopReason(model: Model, client: Client) {
  if (client.deleted !== null) {
    return `${client.handle} was deleted (${client.deleted === "self" ? "by itself" : "by an admin"})`;
  }
  if (model.blocks.has(`repository:${client.repository}`)) {
    return `repository ${repositoryHandle(client.repository)} was blocked`;
  }
  if (model.blocks.has(`owner:${client.ownerId}`)) {
    return `owner ${ownerHandle(client.ownerId)} was blocked`;
  }
  if (model.policy.paused) {
    return "the policy paused every client";
  }
  if (!model.policy.resources) {
    return "the policy withdrew the resource";
  }
  return null;
}

/** The three clients of a story, registered at `POST /hub-clients` by runs of their repository. */
async function registerClients(h: Harness, world: World) {
  const clients: Client[] = [];
  for (const [index, spec] of CLIENTS.entries()) {
    const proof = await world.github.prove(spec.repository, spec.stage);
    world.hosts.serve({ outcome: "present", repositoryId: spec.repository });
    const redirectUri = `https://app-a-${spec.stage}.r${spec.repository}.example/auth/hub/callback`;
    const response = await postHubClient(h, proof.token, {
      app: "app-a",
      redirectUris: [redirectUri],
      softwareVersion: "abc123",
      connectors: ["fake"],
    });
    if (response.status !== 201) {
      throw new Error(`The setup registration of C${index + 1} answered ${response.status}`);
    }
    const answer: NewClient = await response.json();
    clients.push({
      handle: `C${index + 1}`,
      clientId: answer.client_id,
      clientSecret: answer.client_secret,
      registrationAccessToken: answer.registration_access_token,
      registrationClientUri: answer.registration_client_uri,
      redirectUri,
      repository: spec.repository,
      ownerId: proof.ownerId,
      production: spec.stage === "prod",
      deleted: null,
    });
  }
  return clients;
}

/** `/authorize` with the resource, the provider's callback, and the code's redemption. */
async function playAuthorize(
  h: Harness,
  model: Model,
  client: Client,
  checks: Checks,
  story: Story,
) {
  const proof = await pkce();
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    resource: RESOURCE.resource,
    state: "client-state",
    code_challenge: proof.challenge,
    code_challenge_method: "S256",
  });
  const label = `authorize ${client.handle}`;
  const start = await h.fetchBroker(`${ISSUER}/authorize?${params}`);
  checkAnswer(checks, label, start);
  const upstream = new URL(start.headers.get("location") ?? "", ISSUER);
  if (
    start.status !== 302 ||
    upstream.href.split("?")[0] !== RESOURCE.server.authorization_endpoint
  ) {
    story.trace.push(`${label}: ${start.status}, no provider redirect`);
    return;
  }
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  const back = await h.fetchBroker(callback, { headers: txnCookie(start) });
  checkAnswer(checks, `${label} callback`, back);
  const code = new URL(back.headers.get("location") ?? "", ISSUER).searchParams.get("code");
  if (code === null) {
    story.trace.push(`${label}: callback ${back.status}, no code`);
    return;
  }
  const redeemed = await h.fetchBroker(`${ISSUER}/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      code_verifier: proof.verifier,
      redirect_uri: client.redirectUri,
    }),
  });
  checkAnswer(checks, `${label} redemption`, redeemed);
  const stop = stopReason(model, client);
  check(
    checks,
    "noTokenAfterStop",
    !(redeemed.status === 200 && stop !== null),
    `${label} answered a provider access token after ${stop ?? ""}`,
  );
  const answer: { refresh_token?: string; error?: string } = await redeemed.json();
  if (redeemed.status !== 200 || answer.refresh_token === undefined) {
    story.trace.push(`${label}: code redeemed with ${redeemed.status} ${answer.error ?? ""}`);
    return;
  }
  const grant: Grant = {
    handle: `G${model.grants.length + 1}`,
    client,
    refreshToken: answer.refresh_token,
    ended: null,
    claims: [],
  };
  model.grants.push(grant);
  story.trace.push(`${label}: 200, ${grant.handle}`);
}

/** Sends a refresh and waits until the provider holds it, or until the hub answered without it. */
async function playRefreshStart(
  h: Harness,
  world: World,
  model: Model,
  grant: Grant,
  checks: Checks,
  story: Story,
) {
  const { client } = grant;
  const arrival = world.provider.expectRefresh();
  const response = h.fetchBroker(`${ISSUER}/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: grant.refreshToken,
    }),
  });
  const first: { held: HeldRefresh } | { done: Response } = await Promise.race([
    arrival.then((held) => ({ held })),
    response.then((done) => ({ done })),
  ]);
  const label = `refresh start ${grant.handle} (${client.handle})`;
  if ("done" in first) {
    world.provider.cancelExpect();
    checkAnswer(checks, label, first.done);
    const answer: { error?: string } = await first.done.json();
    story.trace.push(
      `${label}: ${first.done.status} ${answer.error ?? ""}, the provider saw nothing`,
    );
    return;
  }
  // A stopped refresh is refused at the admission, before anything reaches the provider.
  const stop = stopReason(model, client);
  check(
    checks,
    "noRefreshWhenStopped",
    stop === null,
    `${label} reached the provider while ${stop}`,
  );
  const attempt: Attempt = {
    handle: `A${model.attempts.length + 1}`,
    grant,
    held: first.held,
    response,
    open: true,
  };
  const previous = grant.claims.at(-1);
  grant.claims.push(attempt.handle);
  model.attempts.push(attempt);
  story.trace.push(
    `${label}: ${attempt.handle} held at the provider${previous === undefined ? "" : `, claimed after ${previous}`}`,
  );
}

/** Releases the provider's answer of a held attempt and reads the hub's answer. */
async function playRefreshFinish(
  h: Harness,
  model: Model,
  attempt: Attempt,
  outcome: RefreshOutcome,
  checks: Checks,
  story: Story,
) {
  const { grant } = attempt;
  const stale = grant.claims.at(-1) !== attempt.handle;
  const before = await readGrant(h, grant.refreshToken);
  attempt.open = false;
  attempt.held.answer(outcome);
  const response = await attempt.response;
  const after = await readGrant(h, grant.refreshToken);
  const label =
    `refresh finish ${attempt.handle} (${grant.handle}, ${grant.client.handle}${stale ? `, stale after ${grant.claims.at(-1) ?? ""}` : ""}) ` +
    `with ${outcome}`;
  const answer: { error?: string } = await response.json();
  story.trace.push(`${label}: ${response.status} ${answer.error ?? ""}`);
  checkAnswer(checks, label, response);
  const stop =
    stopReason(model, grant.client) ??
    (grant.ended === null ? null : `${grant.handle} was ${grant.ended}`);
  check(
    checks,
    "noTokenAfterStop",
    !(response.status === 200 && stop !== null),
    `${label} answered a provider access token after ${stop ?? ""}`,
  );
  if (stale) {
    const deleted = before !== null && after === null;
    const overwritten =
      before !== null &&
      after !== null &&
      before.upstreamRefreshToken !== after.upstreamRefreshToken;
    check(
      checks,
      "staleAttemptChangesNothing",
      !deleted && !overwritten,
      `${label} ${deleted ? "deleted" : "overwrote the provider refresh token of"} ${grant.handle}`,
    );
  } else if (outcome === "invalid_grant" && grant.ended === null) {
    grant.ended = "rejected";
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
    case "authorize": {
      const client = model.clients[command.client % model.clients.length];
      return client === undefined
        ? undefined
        : await playAuthorize(h, model, client, checks, story);
    }
    case "refreshStart": {
      const grant = model.grants[command.grant % Math.max(1, model.grants.length)];
      if (grant === undefined) {
        story.trace.push("refresh start: no grant yet, skipped");
        return;
      }
      return await playRefreshStart(h, world, model, grant, checks, story);
    }
    case "refreshFinish": {
      const open = model.attempts.filter((attempt) => attempt.open);
      const attempt = open[command.attempt % Math.max(1, open.length)];
      if (attempt === undefined) {
        story.trace.push("refresh finish: no held attempt, skipped");
        return;
      }
      return await playRefreshFinish(h, model, attempt, command.outcome, checks, story);
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
    case "policy":
      model.policy.resources = command.resources;
      model.policy.paused = command.paused;
      story.trace.push(
        `policy: ${command.resources ? "the resource" : "no resource"}${command.paused ? ", paused" : ""}`,
      );
      return;
    case "deleteOwn": {
      const client = model.clients[command.client % model.clients.length];
      if (client === undefined) {
        return;
      }
      const response = await h.fetchBroker(client.registrationClientUri, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${client.registrationAccessToken}` },
      });
      const label = `self-delete ${client.handle}${client.production ? " (production)" : ""}`;
      story.trace.push(`${label}: ${response.status}`);
      checkAnswer(checks, label, response);
      const expected = client.deleted !== null ? 401 : client.production ? 403 : 204;
      check(
        checks,
        "selfDelete",
        response.status === expected,
        `${label} answered ${response.status}, not ${expected}`,
      );
      if (response.status === 204) {
        client.deleted = "self";
      }
      return;
    }
    case "adminDelete": {
      const client = model.clients[command.client % model.clients.length];
      if (client === undefined) {
        return;
      }
      const response = await moderationRequest(h, `/moderation/clients/${client.clientId}`, {
        method: "DELETE",
      });
      const answer: { changed?: boolean } = await response.json();
      story.trace.push(`admin delete ${client.handle}: ${response.status}`);
      checkAnswer(checks, `admin delete ${client.handle}`, response);
      check(
        checks,
        "adminDelete",
        response.status === 200 && answer.changed === (client.deleted === null),
        `admin delete ${client.handle} answered ${response.status}, changed ${String(answer.changed)}`,
      );
      client.deleted = client.deleted ?? "admin";
      return;
    }
    case "revoke": {
      const grant = model.grants[command.grant % Math.max(1, model.grants.length)];
      if (grant === undefined) {
        story.trace.push("revoke: no grant yet, skipped");
        return;
      }
      const response = await h.fetchBroker(`${ISSUER}/revoke`, {
        method: "POST",
        body: new URLSearchParams({
          client_id: grant.client.clientId,
          client_secret: grant.client.clientSecret,
          token: grant.refreshToken,
          token_type_hint: "refresh_token",
        }),
      });
      const label = `revoke ${grant.handle} (${grant.client.handle})`;
      story.trace.push(`${label}: ${response.status}`);
      checkAnswer(checks, label, response);
      // A blocked client still revokes its own token; a deleted one cannot authenticate.
      const expected = grant.client.deleted === null ? 200 : 401;
      check(
        checks,
        "revoke",
        response.status === expected,
        `${label} answered ${response.status}, not ${expected}`,
      );
      if (response.status === 200) {
        grant.ended = grant.ended ?? "revoked";
      }
      return;
    }
    case "tick":
      advanceClock(command.ms);
      story.trace.push(`tick ${command.ms / 1_000}s`);
      return;
    case "drain":
      return await playDrain(h, model, checks, story);
    default:
      return command satisfies never;
  }
}

/** Runs every scheduled function, then no deleted client has a refresh grant. */
async function playDrain(h: Harness, model: Model, checks: Checks, story: Story) {
  await h.t.finishAllScheduledFunctions(() => undefined);
  const rows = await readRows(h);
  story.trace.push("drain scheduled functions");
  for (const client of model.clients.filter((candidate) => candidate.deleted !== null)) {
    const grants = rows.refreshGrants.filter((grant) => grant.clientId === client.clientId).length;
    check(
      checks,
      "deletedClientHasNoGrants",
      grants === 0,
      `${client.handle}, deleted ${client.deleted === "self" ? "by itself" : "by an admin"}, still has ${grants} refresh grant(s)`,
    );
  }
}

/**
 * Plays one story on a fresh hub, from the epoch. At its end it releases every held attempt with a
 * transient error and drains the scheduled functions, with the same checks.
 */
async function play(commands: Command[], checks: Checks, story: Story) {
  // The hub logs each failed provider refresh by its error name; a story makes many on purpose.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  startClock();
  const policy: PolicyState = { resources: true, paused: false };
  const h = await createModelHub({
    resources: [RESOURCE],
    policy: () => ({
      connectors: ["fake", "other"],
      resources: policy.resources ? [RESOURCE.name] : [],
      paused: policy.paused,
    }),
  });
  const world = await createWorld({ [REPOSITORIES[0]]: OWNERS[0], [REPOSITORIES[1]]: OWNERS[1] });
  const model = createModel(await registerClients(h, world), policy);
  try {
    for (const command of commands) {
      await step(checks, story, () => playCommand(h, world, model, command, checks, story));
    }
  } finally {
    // A held answer that is never released would leave its action running into the next run.
    for (const attempt of model.attempts.filter((candidate) => candidate.open)) {
      attempt.open = false;
      attempt.held.answer("transient");
      await attempt.response.catch(() => undefined);
    }
  }
  await step(checks, story, () => playDrain(h, model, checks, story));
  check(checks, "noUnexpectedRequest", world.unexpected.length === 0, world.unexpected.join("; "));
}

/** A regression: plays the minimized story and fails on the one named invariant only. */
async function replay(commands: Command[], invariant: string) {
  await play(commands, { only: invariant }, { trace: [], commands: 0 });
}

describe("RFC 136 property B: resource refresh", () => {
  it("keeps every refresh invariant in random stories", async () => {
    const { report } = await checkModel({
      name: "property B",
      // `size: "max"`: lengths up to the whole budget, not fast-check's small default of ten.
      commands: fc.array(commandArbitrary, { minLength: 1, maxLength: 30, size: "max" }),
      play,
      numRuns: 25,
    });
    expect(report).toBeNull();
  }, 600_000);
});

// The counterexamples that property B found in 0.21.0, kept as fixed stories.
describe("RFC 136 property B regressions", () => {
  // F4, block: `finishRefresh` saved the provider's answer and the hub returned it, with no second
  // read of the blocks after the provider answered.
  it("F4: no provider token after a block that committed during the refresh", async () => {
    await replay(
      [
        { kind: "authorize", client: 0 },
        { kind: "refreshStart", grant: 0 },
        { kind: "block", action: "block", scope: "owner", githubId: "201" },
        { kind: "refreshFinish", attempt: 0, outcome: "tokens" },
      ],
      "noTokenAfterStop",
    );
  });

  // F4, self-delete: the grant outlived its client, so a refresh that was held while the client
  // deleted itself still saved and returned the provider's answer.
  it("F4: no provider token after the client deleted itself during the refresh", async () => {
    await replay(
      [
        { kind: "authorize", client: 1 },
        { kind: "refreshStart", grant: 0 },
        { kind: "deleteOwn", client: 1 },
        { kind: "refreshFinish", attempt: 0, outcome: "tokens" },
      ],
      "noTokenAfterStop",
    );
  });

  // F4, self-delete: `registration.remove` deleted the client row and none of its refresh grants.
  it("F4: a client that deleted itself has no refresh grants", async () => {
    await replay(
      [{ kind: "authorize", client: 2 }, { kind: "deleteOwn", client: 2 }, { kind: "drain" }],
      "deletedClientHasNoGrants",
    );
  });

  // Stale attempt: `finishRefresh` and `failRefresh` took the grant id only, so an attempt whose
  // lease ran out wrote over the attempt that claimed the grant after it.
  it("a stale refresh attempt does not overwrite the provider refresh token", async () => {
    await replay(
      [
        { kind: "authorize", client: 0 },
        { kind: "refreshStart", grant: 0 },
        { kind: "tick", ms: 61_000 },
        { kind: "refreshStart", grant: 0 },
        { kind: "refreshFinish", attempt: 0, outcome: "tokens" },
      ],
      "staleAttemptChangesNothing",
    );
  });

  it("a stale refresh attempt does not delete the grant", async () => {
    await replay(
      [
        { kind: "authorize", client: 0 },
        { kind: "refreshStart", grant: 0 },
        { kind: "tick", ms: 61_000 },
        { kind: "refreshStart", grant: 0 },
        { kind: "refreshFinish", attempt: 0, outcome: "invalid_grant" },
      ],
      "staleAttemptChangesNothing",
    );
  });
});
