/// <reference types="vite-plus/client" />
import fc from "fast-check";
import { decodeJwt } from "jose";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ISSUER, pkce, txnCookie, type Harness } from "./harness.test.helper.js";
import { postHubClient, setBlock, type NewClient } from "./hub.test.helper.js";
import {
  advanceClock,
  check,
  checkAnswer,
  checkModel,
  createModelHub,
  createWorld,
  startClock,
  step,
  type Checks,
  type HeldSignIn,
  type SignInOutcome,
  type Story,
  type World,
} from "./model.test.helper.js";

// RFC 136, property C (RFC 137): sign-in. Random stories of `/authorize` with a requested set, the
// page's Continue links (edited ones too), connector callbacks whose provider answer is held
// between `callbackStart` and `callbackFinish`, code redemptions, policy changes, blocks, and clock
// steps, played through `fetchBroker` against the real component. The model knows each client's
// enrollment and the hub's policy of the moment; it never reads what is allowed back from the rows.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

type Command =
  | { kind: "authorize"; client: number; requested: RequestName }
  | { kind: "continue"; request: number; connector: ConnectorName }
  | { kind: "callbackStart"; upstream: number }
  | { kind: "callbackFinish"; attempt: number; outcome: SignInOutcome }
  | { kind: "redeem"; code: number }
  | { kind: "policy"; connectors: PolicyName; consent: boolean; paused: boolean }
  | { kind: "block"; action: "block" | "unblock"; scope: "repository"; githubId: Repository }
  | { kind: "block"; action: "block" | "unblock"; scope: "owner"; githubId: Owner }
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
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("callbackFinish" as const),
      attempt: fc.nat({ max: 7 }),
      outcome: fc.constantFrom("identity" as const, "invalid_grant" as const),
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
      consent: fc.boolean(),
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
    arbitrary: fc.record({ kind: fc.constant("tick" as const), ms: fc.constantFrom(...TICKS) }),
  },
);

type Client = {
  handle: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  repository: string;
  ownerId: string;
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
  callback: URL;
  cookie: { Cookie: string };
  verifier: string;
};

/** A callback whose provider exchange is held. */
type Attempt = {
  handle: string;
  upstream: Upstream;
  held: HeldSignIn;
  response: Promise<Response>;
  open: boolean;
};

type Code = {
  handle: string;
  client: Client;
  connector: string;
  code: string;
  verifier: string;
  redeemed: boolean;
};

/** The hub's policy of the moment, which `createModelHub`'s policy function reads at each request. */
type PolicyState = { connectors: PolicyName; consent: boolean; paused: boolean };

function createModel(clients: Client[], policy: PolicyState) {
  return {
    clients,
    policy,
    blocks: new Set<string>(),
    pages: new Array<PageRequest>(),
    upstreams: new Array<Upstream>(),
    attempts: new Array<Attempt>(),
    codes: new Array<Code>(),
  };
}

type Model = ReturnType<typeof createModel>;

/** The connectors the client may use now: its enrollment and the policy of the moment. */
function allowedNow(model: Model, client: Client) {
  const policy: readonly string[] = POLICIES[model.policy.connectors];
  return client.connectors.filter((name) => policy.includes(name));
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
function providerRedirect(response: Response) {
  if (response.status !== 302) {
    return null;
  }
  const location = new URL(response.headers.get("location") ?? "", ISSUER);
  if (location.origin + location.pathname !== "https://upstream.test/authorize") {
    return null;
  }
  const callback = new URL(location.searchParams.get("redirect_uri") ?? "", ISSUER);
  const connector = /^\/connectors\/([^/]+)\/callback$/.exec(callback.pathname)?.[1] ?? "";
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", location.searchParams.get("state") ?? "");
  return { connector, callback };
}

/** The connectors of the Continue links on a page. */
function offeredOn(html: string) {
  return [...html.matchAll(/class="button" href="[^"]*connector=([^"&]+)"/g)].map(
    (match) => match[1] ?? "",
  );
}

/**
 * `enrollmentHonored` and `noSignInWhenStopped` at a hop to the provider: the connector is in the
 * request's set, the client's enrollment, and the policy of the moment, and nothing stops the client.
 */
function checkHop(
  checks: Checks,
  model: Model,
  label: string,
  client: Client,
  requested: readonly string[],
  connector: string,
) {
  const usable = allowedNow(model, client).filter((name) => requested.includes(name));
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

/** The three clients of a story, registered at `POST /hub-clients` by runs of their repository. */
async function registerClients(h: Harness, world: World) {
  const clients: Client[] = [];
  for (const [index, spec] of CLIENTS.entries()) {
    const proof = await world.github.prove(spec.repository, spec.stage);
    world.hosts.serve({ outcome: "present", repositoryId: spec.repository });
    const redirectUri = `https://app-a-${spec.stage}.r${spec.repository}.example/auth/hub/callback`;
    const response = await postHubClient(h, proof.token, {
      app: "app-a",
      redirectUri,
      softwareVersion: "abc123",
      connectors: [...spec.connectors],
    });
    if (response.status !== 201) {
      throw new Error(`The setup registration of C${index + 1} answered ${response.status}`);
    }
    const answer: NewClient = await response.json();
    clients.push({
      handle: `C${index + 1}`,
      clientId: answer.client_id,
      clientSecret: answer.client_secret,
      redirectUri,
      repository: spec.repository,
      ownerId: proof.ownerId,
      connectors: spec.connectors,
    });
  }
  return clients;
}

async function playAuthorize(
  h: Harness,
  model: Model,
  command: Extract<Command, { kind: "authorize" }>,
  checks: Checks,
  story: Story,
) {
  const client = model.clients[command.client % model.clients.length];
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
  const response = await h.fetchBroker(`${ISSUER}/authorize?${params}`);
  checkAnswer(checks, label, response);
  const requested = named.length === 0 ? client.connectors : named;
  const usable = allowedNow(model, client).filter((name) => requested.includes(name));
  const stop = stopReason(model, client);
  const hop = providerRedirect(response);
  if (hop !== null) {
    checkHop(checks, model, label, client, requested, hop.connector);
    const upstream: Upstream = {
      handle: `U${model.upstreams.length + 1}`,
      client,
      connector: hop.connector,
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
    // A name outside the enrollment is a request error; an empty usable set is a stopped sign-in.
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
  h: Harness,
  model: Model,
  command: Extract<Command, { kind: "continue" }>,
  checks: Checks,
  story: Story,
) {
  const page = model.pages[command.request % Math.max(1, model.pages.length)];
  if (page === undefined) {
    story.trace.push("continue: no page yet, skipped");
    return;
  }
  // The link as the page holds it, or an edited one for a connector the page did not offer.
  const link = `${ISSUER}/continue?request=${page.requestId}&connector=${command.connector}`;
  const edited = !page.offered.includes(command.connector);
  const label = `continue ${page.handle} (${page.client.handle}) with ${command.connector}${edited ? " (edited link)" : ""}`;
  const response = await h.fetchBroker(link, { headers: page.cookie });
  checkAnswer(checks, label, response);
  const hop = providerRedirect(response);
  if (hop === null) {
    story.trace.push(`${label}: ${response.status}`);
    return;
  }
  checkHop(checks, model, label, page.client, page.requested, hop.connector);
  const upstream: Upstream = {
    handle: `U${model.upstreams.length + 1}`,
    client: page.client,
    connector: hop.connector,
    callback: hop.callback,
    cookie: page.cookie,
    verifier: page.verifier,
  };
  model.upstreams.push(upstream);
  story.trace.push(`${label}: to ${hop.connector}, ${upstream.handle}`);
}

/** Sends the provider's callback and waits until the provider holds its code exchange, or the hub answered. */
async function playCallbackStart(
  h: Harness,
  world: World,
  model: Model,
  command: Extract<Command, { kind: "callbackStart" }>,
  checks: Checks,
  story: Story,
) {
  const upstream = model.upstreams[command.upstream % Math.max(1, model.upstreams.length)];
  if (upstream === undefined) {
    story.trace.push("callback: no browser at the provider yet, skipped");
    return;
  }
  const { client } = upstream;
  const label = `callback ${upstream.handle} (${client.handle}, ${upstream.connector})`;
  const arrival = world.provider.expectSignIn();
  const response = h.fetchBroker(upstream.callback, { headers: upstream.cookie });
  const first: { held: HeldSignIn } | { done: Response } = await Promise.race([
    arrival.then((held) => ({ held })),
    response.then((done) => ({ done })),
  ]);
  if ("done" in first) {
    world.provider.cancelExpectSignIn();
    checkAnswer(checks, label, first.done);
    const location = new URL(first.done.headers.get("location") ?? "", ISSUER);
    story.trace.push(
      `${label}: ${first.done.status} ${location.searchParams.get("error") ?? ""}, the provider saw nothing`,
    );
    return;
  }
  // The provider is asked only for a connector the client may use now, and never while stopped.
  const usable = allowedNow(model, client);
  check(
    checks,
    "enrollmentHonored",
    usable.includes(upstream.connector),
    `${label} reached the provider, outside the usable set ${usable.join(", ") || "(none)"}`,
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
  model: Model,
  attempt: Attempt,
  outcome: SignInOutcome,
  checks: Checks,
  story: Story,
) {
  const { upstream } = attempt;
  attempt.open = false;
  attempt.held.answer(outcome);
  const response = await attempt.response;
  const label = `callback finish ${attempt.handle} (${upstream.client.handle}, ${upstream.connector}) with ${outcome}`;
  checkAnswer(checks, label, response);
  const location = new URL(response.headers.get("location") ?? "", ISSUER);
  const code = location.searchParams.get("code");
  if (code === null) {
    story.trace.push(`${label}: ${response.status} ${location.searchParams.get("error") ?? ""}`);
    return;
  }
  const issued: Code = {
    handle: `K${model.codes.length + 1}`,
    client: upstream.client,
    connector: upstream.connector,
    code,
    verifier: upstream.verifier,
    redeemed: false,
  };
  model.codes.push(issued);
  story.trace.push(`${label}: ${issued.handle}`);
}

async function playRedeem(h: Harness, model: Model, code: Code, checks: Checks, story: Story) {
  const { client } = code;
  const label = `redeem ${code.handle} (${client.handle}, ${code.connector})`;
  const response = await h.fetchBroker(`${ISSUER}/token`, {
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
  const answer: { id_token?: string; error?: string } = await response.json();
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
  const usable = allowedNow(model, client);
  check(
    checks,
    "enrollmentHonored",
    usable.includes(code.connector),
    `${label} issued an id_token through ${code.connector}, outside the usable set ${usable.join(", ") || "(none)"}`,
  );
  const stop = stopReason(model, client);
  check(checks, "noSignInWhenStopped", stop === null, `${label} issued an id_token while ${stop}`);
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
    case "authorize":
      return await playAuthorize(h, model, command, checks, story);
    case "continue":
      return await playContinue(h, model, command, checks, story);
    case "callbackStart":
      return await playCallbackStart(h, world, model, command, checks, story);
    case "callbackFinish": {
      const open = model.attempts.filter((attempt) => attempt.open);
      const attempt = open[command.attempt % Math.max(1, open.length)];
      if (attempt === undefined) {
        story.trace.push("callback finish: no held callback, skipped");
        return;
      }
      return await playCallbackFinish(model, attempt, command.outcome, checks, story);
    }
    case "redeem": {
      const code = model.codes[command.code % Math.max(1, model.codes.length)];
      if (code === undefined) {
        story.trace.push("redeem: no code yet, skipped");
        return;
      }
      return await playRedeem(h, model, code, checks, story);
    }
    case "policy":
      model.policy.connectors = command.connectors;
      model.policy.consent = command.consent;
      model.policy.paused = command.paused;
      story.trace.push(
        `policy: ${command.connectors}${command.consent ? ", consent" : ""}${command.paused ? ", paused" : ""}`,
      );
      return;
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
    case "tick":
      advanceClock(command.ms);
      story.trace.push(`tick ${command.ms / 1_000}s`);
      return;
    default:
      return command satisfies never;
  }
}

/**
 * Plays one story on a fresh hub, from the epoch. At its end it releases every held callback with
 * the provider's refusal, so no action runs into the next story.
 */
async function play(commands: Command[], checks: Checks, story: Story) {
  // The hub logs each failed provider exchange by its class name; a story makes some on purpose.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  startClock();
  const policy: PolicyState = { connectors: "all", consent: true, paused: false };
  const h = await createModelHub({
    resources: [],
    policy: () => ({
      connectors: [...POLICIES[policy.connectors]],
      resources: [],
      consent: policy.consent,
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
    for (const attempt of model.attempts.filter((candidate) => candidate.open)) {
      attempt.open = false;
      attempt.held.answer("invalid_grant");
      await attempt.response.catch(() => undefined);
    }
  }
  check(checks, "noUnexpectedRequest", world.unexpected.length === 0, world.unexpected.join("; "));
}

/**
 * A regression: plays the minimized story, fails on the one named invariant only, and answers the
 * trace, so a test can also say what each step answered.
 */
async function replay(commands: Command[], invariant: string) {
  const story: Story = { trace: [], commands: 0 };
  await play(commands, { only: invariant }, story);
  return story.trace;
}

describe("RFC 136 property C: sign-in", () => {
  it("keeps every sign-in invariant in random stories", async () => {
    const { report } = await checkModel({
      name: "property C",
      // `size: "max"`: lengths up to the whole budget, not fast-check's small default of ten.
      commands: fc.array(commandArbitrary, { minLength: 1, maxLength: 30, size: "max" }),
      play,
      numRuns: 25,
    });
    expect(report).toBeNull();
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

  it("a connector withdrawn while the user is at the provider is not completed", async () => {
    const trace = await replay(
      [
        { kind: "policy", connectors: "all", consent: false, paused: false },
        { kind: "authorize", client: 1, requested: "other" },
        { kind: "policy", connectors: "fakeOnly", consent: false, paused: false },
        { kind: "callbackStart", upstream: 0 },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "redeem", code: 0 },
      ],
      "enrollmentHonored",
    );
    expect(trace).toContain("authorize C2 (other): straight to other, U1");
    expect(trace).toContain("callback U1 (C2, other): 302 access_denied, the provider saw nothing");
  });

  it("a connector withdrawn while the provider answers gives no id_token", async () => {
    const trace = await replay(
      [
        { kind: "policy", connectors: "all", consent: false, paused: false },
        { kind: "authorize", client: 2, requested: "none" },
        { kind: "callbackStart", upstream: 0 },
        { kind: "policy", connectors: "fakeOnly", consent: false, paused: false },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "redeem", code: 0 },
      ],
      "enrollmentHonored",
    );
    expect(trace).toContain("callback U1 (C3, other): A1 held at the provider");
    expect(trace).toContain("callback finish A1 (C3, other) with identity: K1");
    expect(trace).toContain("redeem K1 (C3, other): 400 invalid_grant");
  });

  it("a pause that lands during the sign-in gives no id_token, and its end restores nothing issued", async () => {
    const trace = await replay(
      [
        { kind: "policy", connectors: "all", consent: false, paused: false },
        { kind: "authorize", client: 0, requested: "none" },
        { kind: "callbackStart", upstream: 0 },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "policy", connectors: "all", consent: false, paused: true },
        { kind: "redeem", code: 0 },
        { kind: "policy", connectors: "all", consent: false, paused: false },
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
