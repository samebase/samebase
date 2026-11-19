// RFC 136, property C (RFC 137): sign-in. Random stories of `/authorize` with a requested set, the
// page's Continue links (edited ones too), connector callbacks whose provider answer is held
// between `callbackStart` and `callbackFinish` (also on another connector's route), code
// redemptions, policy changes, the admin's connector grants and revokes, blocks, repository
// transfers, and clock steps, played through `fetchBroker` on the memory Store. The model knows
// each client's enrollment, each request's set, the hub's policy of the moment, and each grant with
// the owner it is bound to; it never reads what is allowed back from the rows.
//
// Ported from packages/identity-broker/src/client/signin.model.test.ts. The clients, a transfer's
// new client, the grants, the exemption and the blocks are written in Store steps: registration is
// builder B2's property A, and the moderation routes are out of scope. A transfer therefore always
// lands, and a grant from a stale view changes nothing, as the admin route's 409 does.
import fc from "fast-check";
import { Schema } from "effect";
import { decodeJwt } from "jose";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createBroker,
  fakeUpstream,
  pkce,
  stubFetch,
  testRegistration,
  txnCookie,
  type Broker,
  type StubFetch,
} from "./testing/harness.ts";
import { setBlock, setExemption, setGrant, setTenantOwner } from "./testing/seeds.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const REPOSITORIES = ["101", "102"] as const;
const OWNERS = ["201", "202"] as const;
const CONNECTORS = ["fake", "other"] as const;
/** The clients of every story, each with its enrollment. */
const CLIENTS = [
  { repository: "101", stage: "prod", connectors: ["fake"] },
  { repository: "101", stage: "pr-1", connectors: ["fake", "other"] },
  { repository: "102", stage: "pr-1", connectors: ["other"] },
] as const;
/** What an authorize request names in `connector`, by name. */
const REQUESTS = { none: [], fake: ["fake"], other: ["other"], both: ["fake", "other"] } as const;
/** What the hub's policy allows, by name. */
const POLICIES = {
  all: ["fake", "other"],
  fakeOnly: ["fake"],
  otherOnly: ["other"],
  none: [],
} as const;
/** Around the request's life of ten minutes. */
const TICKS = [1_000, 61_000, 601_000] as const;

type Repository = (typeof REPOSITORIES)[number];
type Owner = (typeof OWNERS)[number];
type ConnectorName = (typeof CONNECTORS)[number];
type RequestName = keyof typeof REQUESTS;
type PolicyName = keyof typeof POLICIES;
type Outcome = "identity" | "invalid_grant";

type Command =
  | { kind: "authorize"; client: number; requested: RequestName }
  | { kind: "continue"; request: number; connector: ConnectorName }
  /** `crossed`: the callback comes back on the other connector's route, with the same state. */
  | { kind: "callbackStart"; upstream: number; route: "own" | "crossed" }
  | { kind: "callbackFinish"; attempt: number; outcome: Outcome }
  | { kind: "redeem"; code: number }
  | { kind: "policy"; connectors: PolicyName; paused: boolean }
  /** The admin switches the sign-in page off or on for every app. */
  | { kind: "exemption"; skip: boolean }
  /**
   * The admin grants or revokes a connector for one repository, naming the owner the admin page
   * shows (`current`) or the other one, as a page that a transfer made stale (`stale`).
   */
  | {
      kind: "grant";
      repository: Repository;
      connector: ConnectorName;
      grant: boolean;
      view: "current" | "stale";
    }
  | { kind: "block"; action: "block" | "unblock"; scope: "repository"; githubId: Repository }
  | { kind: "block"; action: "block" | "unblock"; scope: "owner"; githubId: Owner }
  /** GitHub transfers the repository, and a run of its new owner registers a client. */
  | { kind: "transfer"; repository: Repository; owner: Owner }
  | { kind: "tick"; ms: number };

const repositoryHandle = (id: string) =>
  `R${REPOSITORIES.findIndex((repository) => repository === id) + 1}`;
const ownerHandle = (id: string) => `O${OWNERS.findIndex((owner) => owner === id) + 1}`;

const commandArbitrary: fc.Arbitrary<Command> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant("authorize" as const),
      client: fc.nat({ max: CLIENTS.length - 1 }),
      requested: fc.constantFrom<RequestName>("none", "fake", "other", "both"),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("continue" as const),
      request: fc.nat({ max: 7 }),
      connector: fc.constantFrom(...CONNECTORS),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("callbackStart" as const),
      upstream: fc.nat({ max: 7 }),
      route: fc.oneof(
        { weight: 5, arbitrary: fc.constant("own" as const) },
        { weight: 1, arbitrary: fc.constant("crossed" as const) },
      ),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("callbackFinish" as const),
      attempt: fc.nat({ max: 7 }),
      outcome: fc.constantFrom<Outcome>("identity", "invalid_grant"),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({ kind: fc.constant("redeem" as const), code: fc.nat({ max: 7 }) }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant("policy" as const),
      connectors: fc.constantFrom<PolicyName>("all", "fakeOnly", "otherOnly", "none"),
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
    arbitrary: fc.record({ kind: fc.constant("exemption" as const), skip: fc.boolean() }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant("grant" as const),
      repository: fc.constantFrom(...REPOSITORIES),
      connector: fc.constantFrom(...CONNECTORS),
      grant: fc.boolean(),
      view: fc.oneof(
        { weight: 4, arbitrary: fc.constant("current" as const) },
        { weight: 1, arbitrary: fc.constant("stale" as const) },
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
    arbitrary: fc.record({ kind: fc.constant("tick" as const), ms: fc.constantFrom(...TICKS) }),
  },
);

type Client = {
  handle: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  repository: string;
  /** The tenant's recorded owner at the hub: it moves with a transfer. */
  ownerId: string;
  /** The owner whose run registered the client: it never moves. */
  registeredOwner: string;
  connectors: readonly string[];
};

/** A sign-in page that a browser holds, with its Continue links by connector. */
type PageRequest = {
  handle: string;
  client: Client;
  requestId: string;
  cookie: { Cookie: string };
  verifier: string;
  /** The set of the request: what it named, else the client's enrollment. */
  requested: readonly string[];
  offered: string[];
};

/** A browser at the provider, with the callback it will come back on. */
type Upstream = {
  handle: string;
  client: Client;
  connector: string;
  requested: readonly string[];
  callback: URL;
  cookie: { Cookie: string };
  verifier: string;
};

/** The provider holds its token answer until `answer`. */
type Held = { answer: (outcome: Outcome) => void };

/** A callback whose provider exchange is held. */
type Attempt = {
  handle: string;
  upstream: Upstream;
  held: Held;
  response: Promise<Response>;
  open: boolean;
};

type Code = {
  handle: string;
  client: Client;
  connector: string;
  requested: readonly string[];
  code: string;
  verifier: string;
  redeemed: boolean;
};

/** The invariants broken in a story; `only` keeps one, for a regression of that invariant. */
type Checks = { only: string | null; broken: string[] };
type Story = { trace: string[] };

function check(checks: Checks, invariant: string, holds: boolean, message: string) {
  if (!holds && (checks.only === null || checks.only === invariant)) {
    checks.broken.push(`${invariant}: ${message}`);
  }
}

/** `noServerError`: no answer of the hub is a 500. */
function checkAnswer(checks: Checks, label: string, response: Response) {
  check(checks, "noServerError", response.status !== 500, `${label} answered 500`);
}

type PolicyState = { connectors: PolicyName; paused: boolean };

function createModel(clients: Client[], policy: PolicyState) {
  return {
    clients,
    policy,
    blocks: new Set<string>(),
    /** The admin's grants, by `grantKey`: rows of different owners coexist. */
    grants: new Set<string>(),
    pages: new Array<PageRequest>(),
    upstreams: new Array<Upstream>(),
    attempts: new Array<Attempt>(),
    codes: new Array<Code>(),
  };
}
type Model = ReturnType<typeof createModel>;

const grantKey = (repository: string, owner: string, connector: string) =>
  `${repository}:${owner}:${connector}`;

/**
 * Whether a grant opens `connector` to the client now: its repository has a row of the tenant's
 * recorded owner, and that owner registered the client.
 */
function grantedNow(model: Model, client: Client, connector: string) {
  return (
    client.ownerId === client.registeredOwner &&
    model.grants.has(grantKey(client.repository, client.ownerId, connector))
  );
}

/** The connectors the client may use now, inside the set of a request when one is given. */
function allowedNow(model: Model, client: Client, requested?: readonly string[]) {
  const policy: readonly string[] = POLICIES[model.policy.connectors];
  return client.connectors.filter(
    (name) =>
      (policy.includes(name) || grantedNow(model, client, name)) &&
      (requested === undefined || requested.includes(name)),
  );
}

/** Why the client may not sign anyone in now, or null. */
function stopReason(model: Model, client: Client) {
  if (model.blocks.has(`repository:${client.repository}`)) {
    return `repository ${repositoryHandle(client.repository)} is blocked`;
  }
  if (model.blocks.has(`owner:${client.ownerId}`)) {
    return `owner ${ownerHandle(client.ownerId)} is blocked`;
  }
  if (model.policy.paused) {
    return "the policy paused every client";
  }
  return null;
}

/** The connector of a redirect to the provider, from the callback it names; null for any other. */
function providerRedirect(h: Broker, response: Response) {
  if (response.status !== 302) {
    return null;
  }
  const location = new URL(response.headers.get("location") ?? "", h.issuer);
  if (location.origin + location.pathname !== "https://upstream.test/authorize") {
    return null;
  }
  const callback = new URL(location.searchParams.get("redirect_uri") ?? "", h.issuer);
  const connector = /^\/connectors\/([^/]+)\/callback$/.exec(callback.pathname)?.[1] ?? "";
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", location.searchParams.get("state") ?? "");
  return { connector, callback };
}

/** The connectors of the Continue links on a page. */
const offeredOn = (html: string) =>
  [...html.matchAll(/class="button" href="[^"]*connector=([^"&]+)"/g)].map(
    (match) => match.at(1) ?? "",
  );

/** `enrollmentHonored` and `noSignInWhenStopped` at a hop to the provider. */
function checkHop(
  checks: Checks,
  model: Model,
  label: string,
  client: Client,
  requested: readonly string[],
  connector: string,
) {
  const usable = allowedNow(model, client, requested);
  check(
    checks,
    "enrollmentHonored",
    usable.includes(connector),
    `${label} went to ${connector}, outside the usable set ${usable.join(", ") || "(none)"}`,
  );
  const stop = stopReason(model, client);
  check(
    checks,
    "noSignInWhenStopped",
    stop === null,
    `${label} went to the provider while ${stop}`,
  );
}

/**
 * The provider's token endpoint, which holds each answer until the story releases it. A token
 * request that no `expectSignIn` waits for is unexpected.
 */
function heldProvider(fetch: StubFetch) {
  let waiting: ((held: Held) => void) | undefined;
  const unexpected: string[] = [];
  fetch.plan({
    match: (request) => request.url === "https://upstream.test/token",
    respond: () =>
      new Promise<Response>((resolve) => {
        const held: Held = {
          answer: (outcome) =>
            resolve(
              outcome === "identity"
                ? Response.json({ access_token: "up-access", token_type: "bearer" })
                : Response.json({ error: "invalid_grant" }, { status: 400 }),
            ),
        };
        if (waiting === undefined) {
          unexpected.push("a token request that no callback expected");
          held.answer("invalid_grant");
          return;
        }
        const arrive = waiting;
        waiting = undefined;
        arrive(held);
      }),
  });
  return {
    unexpected,
    expectSignIn: () =>
      new Promise<Held>((resolve) => {
        waiting = resolve;
      }),
    cancelExpectSignIn: () => {
      waiting = undefined;
    },
  };
}

type World = { h: Broker; provider: ReturnType<typeof heldProvider> };

/** A client of the repository, registered by a run of `owner`. */
async function registerClient(
  world: World,
  model: { clients: Client[] },
  spec: { repository: string; stage: string; connectors: readonly string[]; owner: string },
) {
  const redirectUri = `https://app-a-${spec.stage}.r${spec.repository}.example/auth/hub/callback`;
  const created = await world.h.registerClient({
    appName: `app-a-${spec.repository}`,
    redirectUri,
    connectors: [...spec.connectors],
    deploymentType: spec.stage === "prod" ? "production" : "preview",
    repositoryId: spec.repository,
    ownerId: spec.owner,
  });
  const client: Client = {
    handle: `C${model.clients.length + 1}`,
    clientId: created.clientId,
    clientSecret: created.clientSecret,
    redirectUri,
    repository: spec.repository,
    ownerId: spec.owner,
    registeredOwner: spec.owner,
    connectors: spec.connectors,
  };
  model.clients.push(client);
  return client;
}

async function playAuthorize(
  world: World,
  model: Model,
  command: Extract<Command, { kind: "authorize" }>,
  checks: Checks,
  story: Story,
) {
  const { h } = world;
  const client = model.clients.at(command.client % model.clients.length);
  if (client === undefined) {
    return;
  }
  const named: readonly string[] = REQUESTS[command.requested];
  const { verifier, challenge } = await pkce();
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    scope: "openid email",
    state: "client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(named.length === 0 ? {} : { connector: named.join(" ") }),
  });
  const label = `authorize ${client.handle} (${command.requested})`;
  const response = await h.fetchBroker(`${h.issuer}/authorize?${params}`);
  checkAnswer(checks, label, response);
  const requested = named.length === 0 ? client.connectors : named;
  const usable = allowedNow(model, client, requested);
  const stop = stopReason(model, client);
  const hop = providerRedirect(h, response);
  if (hop !== null) {
    checkHop(checks, model, label, client, requested, hop.connector);
    const upstream: Upstream = {
      handle: `U${model.upstreams.length + 1}`,
      client,
      connector: hop.connector,
      requested,
      callback: hop.callback,
      cookie: txnCookie(response),
      verifier,
    };
    model.upstreams.push(upstream);
    story.trace.push(`${label}: straight to ${hop.connector}, ${upstream.handle}`);
    return;
  }
  if (response.status !== 200) {
    story.trace.push(`${label}: ${response.status}`);
    const outside = named.some((name) => !client.connectors.includes(name));
    check(
      checks,
      "enrollmentHonored",
      response.status !== 302 && (outside || usable.length === 0 || stop !== null),
      `${label} answered ${response.status} with ${usable.join(", ")} usable`,
    );
    return;
  }
  const cookie = txnCookie(response);
  const offered = offeredOn(await response.text());
  const page: PageRequest = {
    handle: `P${model.pages.length + 1}`,
    client,
    requestId: cookie.Cookie.split("=")[0]?.replace("__Host-broker_txn_", "") ?? "",
    cookie,
    verifier,
    requested,
    offered,
  };
  model.pages.push(page);
  story.trace.push(`${label}: page ${page.handle} offers ${offered.join(", ") || "nothing"}`);
  check(
    checks,
    "enrollmentHonored",
    [...offered].sort().join(" ") === [...usable].sort().join(" "),
    `${page.handle} offers ${offered.join(", ") || "nothing"}, the usable set is ${usable.join(", ") || "empty"}`,
  );
  check(
    checks,
    "noSignInWhenStopped",
    stop === null || offered.length === 0,
    `${page.handle} offers a sign-in while ${stop}`,
  );
}

async function playContinue(
  world: World,
  model: Model,
  command: Extract<Command, { kind: "continue" }>,
  checks: Checks,
  story: Story,
) {
  const { h } = world;
  const page = model.pages.at(command.request % Math.max(1, model.pages.length));
  if (page === undefined) {
    story.trace.push("continue: no page yet, skipped");
    return;
  }
  const link = `${h.issuer}/continue?request=${page.requestId}&connector=${command.connector}`;
  const edited = !page.offered.includes(command.connector);
  const label = `continue ${page.handle} (${page.client.handle}) with ${command.connector}${edited ? " (edited link)" : ""}`;
  const response = await h.fetchBroker(link, { headers: page.cookie });
  checkAnswer(checks, label, response);
  const hop = providerRedirect(h, response);
  if (hop === null) {
    story.trace.push(`${label}: ${response.status}`);
    return;
  }
  checkHop(checks, model, label, page.client, page.requested, hop.connector);
  const upstream: Upstream = {
    handle: `U${model.upstreams.length + 1}`,
    client: page.client,
    connector: hop.connector,
    requested: page.requested,
    callback: hop.callback,
    cookie: page.cookie,
    verifier: page.verifier,
  };
  model.upstreams.push(upstream);
  story.trace.push(`${label}: to ${hop.connector}, ${upstream.handle}`);
}

/** Sends the provider's callback and waits until the provider holds its code exchange, or the hub answered. */
async function playCallbackStart(
  world: World,
  model: Model,
  command: Extract<Command, { kind: "callbackStart" }>,
  checks: Checks,
  story: Story,
) {
  const { h, provider } = world;
  const upstream = model.upstreams.at(command.upstream % Math.max(1, model.upstreams.length));
  if (upstream === undefined) {
    story.trace.push("callback: no browser at the provider yet, skipped");
    return;
  }
  const { client } = upstream;
  const crossed = command.route === "crossed";
  const other = CONNECTORS.find((name) => name !== upstream.connector) ?? upstream.connector;
  const callback = new URL(upstream.callback);
  if (crossed) {
    callback.pathname = `/connectors/${other}/callback`;
  }
  const label = `callback ${upstream.handle} (${client.handle}, ${upstream.connector})${crossed ? ` on the route of ${other}` : ""}`;
  const arrival = provider.expectSignIn();
  const response = h.fetchBroker(callback, { headers: upstream.cookie });
  const first: { held: Held } | { done: Response } = await Promise.race([
    arrival.then((held) => ({ held })),
    response.then((done) => ({ done })),
  ]);
  if ("done" in first) {
    provider.cancelExpectSignIn();
    checkAnswer(checks, label, first.done);
    const location = new URL(first.done.headers.get("location") ?? "", h.issuer);
    story.trace.push(
      `${label}: ${first.done.status} ${location.searchParams.get("error") ?? ""}, the provider saw nothing`,
    );
    return;
  }
  const usable = allowedNow(model, client, upstream.requested);
  check(
    checks,
    "enrollmentHonored",
    !crossed && usable.includes(upstream.connector),
    crossed
      ? `${label} reached the provider through another connector's route`
      : `${label} reached the provider, outside the usable set ${usable.join(", ") || "(none)"}`,
  );
  const stop = stopReason(model, client);
  check(
    checks,
    "noSignInWhenStopped",
    stop === null,
    `${label} reached the provider while ${stop}`,
  );
  const attempt: Attempt = {
    handle: `A${model.attempts.length + 1}`,
    upstream,
    held: first.held,
    response,
    open: true,
  };
  model.attempts.push(attempt);
  story.trace.push(`${label}: ${attempt.handle} held at the provider`);
}

async function playCallbackFinish(
  world: World,
  model: Model,
  attempt: Attempt,
  outcome: Outcome,
  checks: Checks,
  story: Story,
) {
  const { upstream } = attempt;
  const { client } = upstream;
  attempt.open = false;
  attempt.held.answer(outcome);
  const response = await attempt.response;
  const label = `callback finish ${attempt.handle} (${client.handle}, ${upstream.connector}) with ${outcome}`;
  checkAnswer(checks, label, response);
  const location = new URL(response.headers.get("location") ?? "", world.h.issuer);
  const code = location.searchParams.get("code");
  if (code === null) {
    story.trace.push(`${label}: ${response.status} ${location.searchParams.get("error") ?? ""}`);
    return;
  }
  // A code is issued only under the restrictions of this moment.
  const usable = allowedNow(model, client, upstream.requested);
  check(
    checks,
    "enrollmentHonored",
    usable.includes(upstream.connector),
    `${label} issued a code through ${upstream.connector}, outside the usable set ${usable.join(", ") || "(none)"}`,
  );
  const stop = stopReason(model, client);
  check(checks, "noSignInWhenStopped", stop === null, `${label} issued a code while ${stop}`);
  const issued: Code = {
    handle: `K${model.codes.length + 1}`,
    client,
    connector: upstream.connector,
    requested: upstream.requested,
    code,
    verifier: upstream.verifier,
    redeemed: false,
  };
  model.codes.push(issued);
  story.trace.push(`${label}: ${issued.handle}`);
}

const TokenAnswer = Schema.Struct({
  id_token: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
});

async function playRedeem(world: World, model: Model, code: Code, checks: Checks, story: Story) {
  const { h } = world;
  const { client } = code;
  const label = `redeem ${code.handle} (${client.handle}, ${code.connector})`;
  const response = await h.fetchBroker(`${h.issuer}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code: code.code,
      code_verifier: code.verifier,
      redirect_uri: client.redirectUri,
    }).toString(),
  });
  checkAnswer(checks, label, response);
  const answer = Schema.decodeUnknownSync(TokenAnswer)(await response.json());
  story.trace.push(`${label}: ${response.status} ${answer.error ?? ""}`);
  check(
    checks,
    "codeSingleUse",
    !(response.status === 200 && code.redeemed),
    `${label} redeemed a code a second time`,
  );
  if (response.status !== 200) {
    return;
  }
  code.redeemed = true;
  const claim = decodeJwt(answer.id_token ?? "")["connector"];
  check(
    checks,
    "connectorClaimIsOne",
    claim === code.connector,
    `${label} issued an id_token whose connector claim is ${JSON.stringify(claim)}`,
  );
  const usable = allowedNow(model, client, code.requested);
  check(
    checks,
    "enrollmentHonored",
    usable.includes(code.connector),
    `${label} issued an id_token through ${code.connector}, outside the usable set ${usable.join(", ") || "(none)"}`,
  );
  const stop = stopReason(model, client);
  check(checks, "noSignInWhenStopped", stop === null, `${label} issued an id_token while ${stop}`);
}

/**
 * The admin grants or revokes a connector. A grant needs the recorded owner the admin saw (a stale
 * view changes nothing, as the admin route's 409); a revoke removes the row of the owner it names.
 */
function playGrant(
  world: World,
  model: Model,
  command: Extract<Command, { kind: "grant" }>,
  story: Story,
) {
  const tenantOwner =
    model.clients.find((client) => client.repository === command.repository)?.ownerId ?? "";
  const shown = command.grant
    ? tenantOwner
    : (OWNERS.find((owner) =>
        model.grants.has(grantKey(command.repository, owner, command.connector)),
      ) ?? tenantOwner);
  const named =
    command.view === "current" ? shown : (OWNERS.find((owner) => owner !== shown) ?? shown);
  const label = `${command.grant ? "grant" : "revoke"} ${command.connector} for ${repositoryHandle(command.repository)} as ${ownerHandle(named)}`;
  if (command.grant && named !== tenantOwner) {
    story.trace.push(`${label}: owner changed, nothing written`);
    return;
  }
  const key = grantKey(command.repository, named, command.connector);
  const changed = command.grant !== model.grants.has(key);
  setGrant(
    world.h.memory,
    { repositoryId: command.repository, ownerId: named, connector: command.connector },
    command.grant,
  );
  if (command.grant) {
    model.grants.add(key);
  } else {
    model.grants.delete(key);
  }
  story.trace.push(`${label}: ${changed ? "changed" : "unchanged"}`);
}

async function playCommand(
  world: World,
  model: Model,
  command: Command,
  checks: Checks,
  story: Story,
) {
  const { h } = world;
  switch (command.kind) {
    case "authorize":
      return await playAuthorize(world, model, command, checks, story);
    case "continue":
      return await playContinue(world, model, command, checks, story);
    case "callbackStart":
      return await playCallbackStart(world, model, command, checks, story);
    case "callbackFinish": {
      const open = model.attempts.filter((attempt) => attempt.open);
      const attempt = open.at(command.attempt % Math.max(1, open.length));
      if (attempt === undefined) {
        story.trace.push("callback finish: no held callback, skipped");
        return;
      }
      return await playCallbackFinish(world, model, attempt, command.outcome, checks, story);
    }
    case "redeem": {
      const code = model.codes.at(command.code % Math.max(1, model.codes.length));
      if (code === undefined) {
        story.trace.push("redeem: no code yet, skipped");
        return;
      }
      return await playRedeem(world, model, code, checks, story);
    }
    case "policy":
      model.policy.connectors = command.connectors;
      model.policy.paused = command.paused;
      story.trace.push(`policy: ${command.connectors}${command.paused ? ", paused" : ""}`);
      return;
    case "exemption":
      setExemption(h.memory, { scope: "every_app" }, command.skip);
      story.trace.push(`sign-in page ${command.skip ? "off" : "on"} for every app`);
      return;
    case "grant":
      return playGrant(world, model, command, story);
    case "block": {
      setBlock(
        h.memory,
        { kind: command.scope, githubId: command.githubId },
        command.action === "block",
      );
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
    case "transfer": {
      const from =
        model.clients.find((client) => client.repository === command.repository)?.ownerId ?? "";
      setTenantOwner(h.memory, command.repository, command.owner);
      for (const owned of model.clients) {
        if (owned.repository === command.repository) {
          owned.ownerId = command.owner;
        }
      }
      const client = await registerClient(world, model, {
        repository: command.repository,
        stage: "prod",
        connectors: ["fake"],
        owner: command.owner,
      });
      story.trace.push(
        `transfer ${repositoryHandle(command.repository)} from ${ownerHandle(from)} to ${ownerHandle(command.owner)}: ${client.handle} registered`,
      );
      return;
    }
    case "tick":
      h.clock.advance(command.ms);
      story.trace.push(`tick ${command.ms / 1_000}s`);
      return;
    default:
      return command satisfies never;
  }
}

/**
 * Plays one story on a fresh hub. At its end it releases every held callback with the provider's
 * refusal, so no request runs into the next story.
 */
async function play(commands: Command[], checks: Checks, story: Story) {
  // The hub logs each failed provider exchange by its class name, and each sign-in.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const policy: PolicyState = { connectors: "all", paused: false };
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch);
  const provider = heldProvider(fetch);
  const h = await createBroker({
    fetch,
    config: {
      connectors: [connector, { ...connector, name: "other", label: "Other" }],
      registration: testRegistration(() => ({
        connectors: [...POLICIES[policy.connectors]],
        resources: [],
        paused: policy.paused,
      })),
    },
  });
  const world: World = { h, provider };
  const owners: Record<string, string> = {
    [REPOSITORIES[0]]: OWNERS[0],
    [REPOSITORIES[1]]: OWNERS[1],
  };
  const setup = { clients: new Array<Client>() };
  for (const spec of CLIENTS) {
    await registerClient(world, setup, { ...spec, owner: owners[spec.repository] ?? "" });
  }
  const model = createModel(setup.clients, policy);
  try {
    for (const command of commands) {
      await playCommand(world, model, command, checks, story);
    }
  } finally {
    for (const attempt of model.attempts.filter((candidate) => candidate.open)) {
      attempt.open = false;
      attempt.held.answer("invalid_grant");
      await attempt.response.catch(() => undefined);
    }
  }
  const unexpected = [...h.fetch.unexpected, ...provider.unexpected];
  check(checks, "noUnexpectedRequest", unexpected.length === 0, unexpected.join("; "));
}

/** A regression: plays the story, fails on the one named invariant only, and answers the trace. */
async function replay(commands: Command[], invariant: string) {
  const story: Story = { trace: [] };
  const checks: Checks = { only: invariant, broken: [] };
  await play(commands, checks, story);
  expect(checks.broken).toEqual([]);
  return story.trace;
}

describe("RFC 136 property C: sign-in", () => {
  it("keeps every sign-in invariant in random stories", async () => {
    const result = await fc.check(
      fc.asyncProperty(
        fc.array(commandArbitrary, { minLength: 1, maxLength: 30, size: "max" }),
        async (commands) => {
          const checks: Checks = { only: null, broken: [] };
          const story: Story = { trace: [] };
          await play(commands, checks, story);
          if (checks.broken.length > 0) {
            throw new Error(`${checks.broken.join("\n")}\ntrace:\n${story.trace.join("\n")}`);
          }
        },
      ),
      { numRuns: 25, seed: 136 },
    );
    expect(
      result.failed ? `${result.counterexamplePath} ${String(result.errorInstance)}` : null,
    ).toBeNull();
  }, 600_000);
});

// Fixed stories of RFC 137's rules, each on the invariant it guards.
describe("RFC 136 property C regressions", () => {
  it("an edited Continue link does not reach a connector outside the request's set", async () => {
    const trace = await replay(
      [
        { kind: "authorize", client: 1, requested: "fake" },
        { kind: "continue", request: 0, connector: "other" },
        { kind: "continue", request: 0, connector: "fake" },
      ],
      "enrollmentHonored",
    );
    expect(trace).toEqual([
      "authorize C2 (fake): page P1 offers fake",
      "continue P1 (C2) with other (edited link): 404",
      "continue P1 (C2) with fake: to fake, U1",
    ]);
  });

  it("a callback on another connector's route reaches nothing, and the request still waits for its own", async () => {
    const trace = await replay(
      [
        { kind: "exemption", skip: true },
        { kind: "authorize", client: 1, requested: "fake" },
        { kind: "callbackStart", upstream: 0, route: "crossed" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
      ],
      "enrollmentHonored",
    );
    expect(trace).toContain(
      "callback U1 (C2, fake) on the route of other: 400 , the provider saw nothing",
    );
    expect(trace).toContain("callback U1 (C2, fake): A1 held at the provider");
    expect(trace).toContain("callback finish A1 (C2, fake) with identity: K1");
  });

  it("a connector withdrawn while the user is at the provider is not completed", async () => {
    const trace = await replay(
      [
        { kind: "exemption", skip: true },
        { kind: "authorize", client: 1, requested: "other" },
        { kind: "policy", connectors: "fakeOnly", paused: false },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "redeem", code: 0 },
      ],
      "enrollmentHonored",
    );
    expect(trace).toContain("authorize C2 (other): straight to other, U1");
    expect(trace).toContain("callback U1 (C2, other): 302 access_denied, the provider saw nothing");
  });

  it("a connector withdrawn while the provider answers completes no sign-in", async () => {
    const trace = await replay(
      [
        { kind: "exemption", skip: true },
        { kind: "authorize", client: 2, requested: "none" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "policy", connectors: "fakeOnly", paused: false },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "redeem", code: 0 },
      ],
      "enrollmentHonored",
    );
    expect(trace).toContain("callback U1 (C3, other): A1 held at the provider");
    expect(trace).toContain("callback finish A1 (C3, other) with identity: 302 access_denied");
    expect(trace).toContain("redeem: no code yet, skipped");
  });

  it("a grant bound to the new owner after a transfer does not open the old owner's client", async () => {
    const trace = await replay(
      [
        { kind: "policy", connectors: "fakeOnly", paused: false },
        { kind: "transfer", repository: "101", owner: "202" },
        { kind: "grant", repository: "101", connector: "other", grant: true, view: "current" },
        { kind: "authorize", client: 1, requested: "other" },
      ],
      "enrollmentHonored",
    );
    expect(trace).toContain("transfer R1 from O1 to O2: C4 registered");
    expect(trace).toContain("grant other for R1 as O2: changed");
    // C2 was registered by O1: the grant is O2's, so `other` is not C2's to use.
    expect(trace.at(-1)).toMatch(/^authorize C2 \(other\): (?!straight)/);
  });

  it("a grant revoked between the page and Continue sends no one to the provider", async () => {
    const trace = await replay(
      [
        { kind: "policy", connectors: "fakeOnly", paused: false },
        { kind: "grant", repository: "101", connector: "other", grant: true, view: "current" },
        { kind: "authorize", client: 1, requested: "both" },
        { kind: "grant", repository: "101", connector: "other", grant: false, view: "current" },
        { kind: "continue", request: 0, connector: "other" },
        { kind: "continue", request: 0, connector: "fake" },
      ],
      "enrollmentHonored",
    );
    expect(trace).toContain("authorize C2 (both): page P1 offers fake, other");
    expect(trace).toContain("revoke other for R1 as O1: changed");
    expect(trace.at(-2)).toMatch(/^continue P1 \(C2\) with other: \d+$/);
    expect(trace.at(-1)).toBe("continue P1 (C2) with fake: to fake, U1");
  });

  it("a grant revoked while the provider answers completes no sign-in", async () => {
    const trace = await replay(
      [
        { kind: "exemption", skip: true },
        { kind: "policy", connectors: "fakeOnly", paused: false },
        { kind: "grant", repository: "102", connector: "other", grant: true, view: "current" },
        { kind: "authorize", client: 2, requested: "none" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "grant", repository: "102", connector: "other", grant: false, view: "current" },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "redeem", code: 0 },
      ],
      "enrollmentHonored",
    );
    expect(trace).toContain("authorize C3 (none): straight to other, U1");
    expect(trace).toContain("callback U1 (C3, other): A1 held at the provider");
    expect(trace).toContain("callback finish A1 (C3, other) with identity: 302 access_denied");
    expect(trace).toContain("redeem: no code yet, skipped");
  });

  it("a block that lands while the provider answers completes no sign-in", async () => {
    const trace = await replay(
      [
        { kind: "exemption", skip: true },
        { kind: "authorize", client: 0, requested: "none" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "block", action: "block", scope: "owner", githubId: "201" },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
      ],
      "noSignInWhenStopped",
    );
    expect(trace).toContain("callback finish A1 (C1, fake) with identity: 302 access_denied");
  });

  it("a transfer while the provider answers completes the sign-in on the new owner's policy", async () => {
    const trace = await replay(
      [
        { kind: "exemption", skip: true },
        { kind: "authorize", client: 0, requested: "none" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "transfer", repository: "101", owner: "202" },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "redeem", code: 0 },
        { kind: "block", action: "block", scope: "owner", githubId: "202" },
        { kind: "authorize", client: 0, requested: "none" },
      ],
      "noSignInWhenStopped",
    );
    expect(trace).toContain("transfer R1 from O1 to O2: C4 registered");
    expect(trace).toContain("callback finish A1 (C1, fake) with identity: K1");
    expect(trace).toContain("redeem K1 (C1, fake): 200 ");
    // The clients of the repository belong to the new owner: its block stops them.
    expect(trace.at(-1)).toBe("authorize C1 (none): 403");
  });

  it("a pause that lands during the sign-in gives no id_token, and its end restores nothing issued", async () => {
    const trace = await replay(
      [
        { kind: "exemption", skip: true },
        { kind: "authorize", client: 0, requested: "none" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "policy", connectors: "all", paused: true },
        { kind: "redeem", code: 0 },
        { kind: "policy", connectors: "all", paused: false },
        { kind: "redeem", code: 0 },
        { kind: "redeem", code: 0 },
      ],
      "noSignInWhenStopped",
    );
    expect(trace).toContain("redeem K1 (C1, fake): 401 invalid_client");
    // The code is still good once the pause ends, and once only.
    expect(trace).toContain("redeem K1 (C1, fake): 200 ");
    expect(trace.filter((line) => line.startsWith("redeem K1"))).toHaveLength(3);
    expect(trace.at(-1)).toBe("redeem K1 (C1, fake): 400 invalid_grant");
  });
});
