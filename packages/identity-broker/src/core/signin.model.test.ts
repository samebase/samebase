// RFC 136, property C (RFC 137): sign-in on client cards. Random stories of `/authorize` with a
// requested set, the page's Continue links (edited ones too), connector callbacks whose provider
// answer is held between `callbackStart` and `callbackFinish` (also on another connector's route),
// code redemptions, and clock steps, played through `fetchBroker` on the memory Store, while a
// layer rewrites cards (their connectors, `confirm`, return address, and the owner key among their
// gates) and stops on gate keys commit and go. The model knows each card as the layer last wrote
// it, each request's stored set, and the stops; it never reads what is allowed back from the rows.
//
// Ported from src/client/signin.model.test.ts of @samebase/identity-broker 0.34.0. The cards and the stops
// are written in Store steps, as a layer's command and an operator write them.
import fc from "fast-check";
import { Schema } from "effect";
import { decodeJwt } from "jose";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createBroker,
  fakeOidcUpstream,
  fakeUpstream,
  pkce,
  stubFetch,
  txnCookie,
  type Broker,
  type StubFetch,
} from "./testing/harness.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const REPOSITORIES = ["101", "102"] as const;
const OWNERS = ["201", "202"] as const;
const CONNECTORS = ["fake", "other"] as const;
/** The cards of every story, each with its connectors and whether it shows the page. */
const CLIENTS = [
  { repository: "101", stage: "prod", connectors: ["fake"], confirm: false },
  { repository: "101", stage: "pr-1", connectors: ["fake", "other"], confirm: true },
  { repository: "102", stage: "pr-1", connectors: ["other"], confirm: false },
] as const;
/** What an authorize request names in `connector`, and what a layer writes on a card, by name. */
const SETS = { none: [], fake: ["fake"], other: ["other"], both: ["fake", "other"] } as const;
/** Around the request's life of ten minutes. */
const TICKS = [1_000, 61_000, 601_000] as const;

type Repository = (typeof REPOSITORIES)[number];
type Owner = (typeof OWNERS)[number];
type ConnectorName = (typeof CONNECTORS)[number];
type SetName = keyof typeof SETS;
type Outcome = "identity" | "invalid_grant";

const repositoryKey = (repository: string) => `repository:${repository}`;
const ownerKey = (owner: string) => `owner:${owner}`;
const STOP_KEYS = [...REPOSITORIES.map(repositoryKey), ...OWNERS.map(ownerKey)];

type Command =
  | { kind: "authorize"; client: number; requested: SetName }
  | { kind: "continue"; request: number; connector: ConnectorName }
  /** `crossed`: the callback comes back on the other connector's route, with the same state. */
  | { kind: "callbackStart"; upstream: number; route: "own" | "crossed" }
  | { kind: "callbackFinish"; attempt: number; outcome: Outcome }
  | { kind: "redeem"; code: number }
  /** The layer writes a card's connectors. */
  | { kind: "connectors"; client: number; set: SetName }
  /** The layer writes a card's `confirm`. */
  | { kind: "confirm"; client: number; on: boolean }
  /** The layer takes a card's return address off, or puts it back. */
  | { kind: "redirect"; client: number; on: boolean }
  /** A stop on a key commits, or goes. */
  | { kind: "stop"; key: string; on: boolean }
  /** A transfer as the core sees it: the repository's cards get the new owner's key. */
  | { kind: "regate"; repository: Repository; owner: Owner }
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
      requested: fc.constantFrom<SetName>("none", "fake", "other", "both"),
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
      kind: fc.constant("connectors" as const),
      client: fc.nat({ max: CLIENTS.length - 1 }),
      set: fc.constantFrom<SetName>("none", "fake", "other", "both"),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("confirm" as const),
      client: fc.nat({ max: CLIENTS.length - 1 }),
      on: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("redirect" as const),
      client: fc.nat({ max: CLIENTS.length - 1 }),
      on: fc.boolean(),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant("stop" as const),
      key: fc.constantFrom(...STOP_KEYS),
      on: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("regate" as const),
      repository: fc.constantFrom(...REPOSITORIES),
      owner: fc.constantFrom(...OWNERS),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("tick" as const), ms: fc.constantFrom(...TICKS) }),
  },
);

/** A card as the model knows it: what the layer last wrote on it. */
type Client = {
  handle: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  repository: string;
  /** The owner whose key is among the card's gates. */
  ownerId: string;
  connectors: readonly string[];
  confirm: boolean;
  /** The card holds `redirectUri`. */
  redirect: boolean;
};

/** A sign-in page that a browser holds, with its Continue links by connector. */
type PageRequest = {
  handle: string;
  client: Client;
  requestId: string;
  cookie: { Cookie: string };
  verifier: string;
  /** The set that the request stored. */
  stored: readonly string[];
  offered: string[];
};

/** A browser at the provider, with the callback it will come back on. */
type Upstream = {
  handle: string;
  client: Client;
  connector: string;
  stored: readonly string[];
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
  stored: readonly string[];
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

/**
 * `noServerError`: no answer of the broker is a 500. `returnOnCard`: the broker sends the browser to the
 * card's return address only while the card holds it.
 */
function checkAnswer(checks: Checks, label: string, response: Response, client: Client) {
  check(checks, "noServerError", response.status !== 500, `${label} answered 500`);
  const location = response.status === 302 ? response.headers.get("location") : null;
  if (location === null) {
    return;
  }
  const target = new URL(location);
  check(
    checks,
    "returnOnCard",
    client.redirect || target.origin + target.pathname !== client.redirectUri,
    `${label} sent the browser to ${client.handle}'s return address, which is off the card`,
  );
}

function createModel(clients: Client[]) {
  return {
    clients,
    stops: new Set<string>(),
    pages: new Array<PageRequest>(),
    upstreams: new Array<Upstream>(),
    attempts: new Array<Attempt>(),
    codes: new Array<Code>(),
  };
}
type Model = ReturnType<typeof createModel>;

/** The connectors that the card offers now, inside a request's stored set when one is given. */
function allowedNow(client: Client, stored?: readonly string[]) {
  return client.connectors.filter(
    (name) =>
      CONNECTORS.some((configured) => configured === name) &&
      (stored === undefined || stored.includes(name)),
  );
}

/** Why the card may not sign anyone in now, or null. */
function stopReason(model: Model, client: Client) {
  if (model.stops.has(repositoryKey(client.repository))) {
    return `repository ${repositoryHandle(client.repository)} is stopped`;
  }
  if (model.stops.has(ownerKey(client.ownerId))) {
    return `owner ${ownerHandle(client.ownerId)} is stopped`;
  }
  if (!client.redirect) {
    return "its return address left the card";
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

/** `cardHonored` and `noSignInWhenStopped` at a hop to the provider. */
function checkHop(
  checks: Checks,
  model: Model,
  label: string,
  client: Client,
  stored: readonly string[],
  connector: string,
) {
  const usable = allowedNow(client, stored);
  check(
    checks,
    "cardHonored",
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

/** The card of a repository's client, as its layer writes it with the owner's key. */
async function registerClient(
  world: World,
  model: { clients: Client[] },
  spec: {
    repository: string;
    stage: string;
    connectors: readonly string[];
    confirm: boolean;
    owner: string;
  },
) {
  const redirectUri = `https://app-a-${spec.stage}.r${spec.repository}.example/auth/broker/callback`;
  const created = await world.h.registerClient({
    appName: `app-a-${spec.repository}`,
    redirectUri,
    otherRedirectUris: ["https://elsewhere.example/auth/broker/callback"],
    connectors: [...spec.connectors],
    confirm: spec.confirm,
    gates: [repositoryKey(spec.repository), ownerKey(spec.owner)],
  });
  const client: Client = {
    handle: `C${model.clients.length + 1}`,
    clientId: created.clientId,
    clientSecret: created.clientSecret,
    redirectUri,
    repository: spec.repository,
    ownerId: spec.owner,
    connectors: spec.connectors,
    confirm: spec.confirm,
    redirect: true,
  };
  model.clients.push(client);
  return client;
}

/** Writes the model's view of `client` onto its card, as the layer's rewrite does. */
const writeCard = (world: World, client: Client) =>
  world.h.editCard(client.clientId, (card) => ({
    ...card,
    connectors: [...client.connectors],
    confirm: client.confirm,
    redirectUris: client.redirect
      ? [client.redirectUri, "https://elsewhere.example/auth/broker/callback"]
      : ["https://elsewhere.example/auth/broker/callback"],
    gates: [repositoryKey(client.repository), ownerKey(client.ownerId)],
  }));

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
  const named: readonly string[] = SETS[command.requested];
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
  const response = await h.fetchBroker(`${h.issuer}/authorize?${params.toString()}`);
  checkAnswer(checks, label, response, client);
  // The set that `create` stores: what the request named, else the card's, of the card's.
  const stored = allowedNow(client, named.length === 0 ? undefined : named);
  const stop = stopReason(model, client);
  const hop = providerRedirect(h, response);
  if (hop !== null) {
    checkHop(checks, model, label, client, stored, hop.connector);
    check(
      checks,
      "confirmHonored",
      !client.confirm && stored.length === 1,
      `${label} went straight to the provider with confirm ${client.confirm} and ${stored.length} connectors`,
    );
    const upstream: Upstream = {
      handle: `U${model.upstreams.length + 1}`,
      client,
      connector: hop.connector,
      stored,
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
      "cardHonored",
      response.status !== 302 && (outside || stored.length === 0 || stop !== null),
      `${label} answered ${response.status} with ${stored.join(", ")} usable`,
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
    stored,
    offered,
  };
  model.pages.push(page);
  story.trace.push(`${label}: page ${page.handle} offers ${offered.join(", ") || "nothing"}`);
  check(
    checks,
    "cardHonored",
    [...offered].sort().join(" ") === [...stored].sort().join(" "),
    `${page.handle} offers ${offered.join(", ") || "nothing"}, the usable set is ${stored.join(", ") || "empty"}`,
  );
  check(
    checks,
    "confirmHonored",
    client.confirm || stored.length > 1,
    `${page.handle} is a page for a card without confirm and one connector`,
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
  checkAnswer(checks, label, response, page.client);
  const hop = providerRedirect(h, response);
  if (hop === null) {
    story.trace.push(`${label}: ${response.status}`);
    return;
  }
  checkHop(checks, model, label, page.client, page.stored, hop.connector);
  const upstream: Upstream = {
    handle: `U${model.upstreams.length + 1}`,
    client: page.client,
    connector: hop.connector,
    stored: page.stored,
    callback: hop.callback,
    cookie: page.cookie,
    verifier: page.verifier,
  };
  model.upstreams.push(upstream);
  story.trace.push(`${label}: to ${hop.connector}, ${upstream.handle}`);
}

/** Sends the provider's callback and waits until the provider holds its code exchange, or the broker answered. */
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
    checkAnswer(checks, label, first.done, client);
    const location = new URL(first.done.headers.get("location") ?? "", h.issuer);
    story.trace.push(
      `${label}: ${first.done.status} ${location.searchParams.get("error") ?? ""}, the provider saw nothing`,
    );
    return;
  }
  const usable = allowedNow(client, upstream.stored);
  check(
    checks,
    "cardHonored",
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
  checkAnswer(checks, label, response, client);
  const location = new URL(response.headers.get("location") ?? "", world.h.issuer);
  const code = location.searchParams.get("code");
  if (code === null) {
    story.trace.push(`${label}: ${response.status} ${location.searchParams.get("error") ?? ""}`);
    return;
  }
  // A code is issued only for the card of this moment.
  const usable = allowedNow(client, upstream.stored);
  check(
    checks,
    "cardHonored",
    usable.includes(upstream.connector),
    `${label} issued a code through ${upstream.connector}, outside the usable set ${usable.join(", ") || "(none)"}`,
  );
  const stop = stopReason(model, client);
  check(checks, "noSignInWhenStopped", stop === null, `${label} issued a code while ${stop}`);
  const issued: Code = {
    handle: `K${model.codes.length + 1}`,
    client,
    connector: upstream.connector,
    stored: upstream.stored,
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
  checkAnswer(checks, label, response, client);
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
  const usable = allowedNow(client, code.stored);
  check(
    checks,
    "cardHonored",
    usable.includes(code.connector),
    `${label} issued an id_token through ${code.connector}, outside the usable set ${usable.join(", ") || "(none)"}`,
  );
  const stop = stopReason(model, client);
  check(checks, "noSignInWhenStopped", stop === null, `${label} issued an id_token while ${stop}`);
}

async function playCommand(
  world: World,
  model: Model,
  command: Command,
  checks: Checks,
  story: Story,
) {
  const { h } = world;
  const clientAt = (index: number) => model.clients.at(index % model.clients.length);
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
    case "connectors": {
      const client = clientAt(command.client);
      if (client === undefined) return;
      client.connectors = SETS[command.set];
      await writeCard(world, client);
      story.trace.push(`card ${client.handle}: connectors ${command.set}`);
      return;
    }
    case "confirm": {
      const client = clientAt(command.client);
      if (client === undefined) return;
      client.confirm = command.on;
      await writeCard(world, client);
      story.trace.push(`card ${client.handle}: confirm ${command.on}`);
      return;
    }
    case "redirect": {
      const client = clientAt(command.client);
      if (client === undefined) return;
      client.redirect = command.on;
      await writeCard(world, client);
      story.trace.push(`card ${client.handle}: return address ${command.on ? "on" : "off"}`);
      return;
    }
    case "stop":
      await h.setStop(command.key, command.on);
      if (command.on) {
        model.stops.add(command.key);
      } else {
        model.stops.delete(command.key);
      }
      story.trace.push(`stop ${command.key} ${command.on ? "on" : "off"}`);
      return;
    case "regate": {
      for (const client of model.clients) {
        if (client.repository === command.repository) {
          client.ownerId = command.owner;
          await writeCard(world, client);
        }
      }
      story.trace.push(
        `regate ${repositoryHandle(command.repository)} to ${ownerHandle(command.owner)}`,
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
 * Plays one story on a fresh broker. At its end it releases every held callback with the provider's
 * refusal, so no request runs into the next story.
 */
async function play(commands: Command[], checks: Checks, story: Story) {
  // The broker logs each failed provider exchange by its class name, and each sign-in.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch);
  const provider = heldProvider(fetch);
  const h = await createBroker({
    fetch,
    config: { connectors: [connector, { ...connector, name: "other", label: "Other" }] },
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
  const model = createModel(setup.clients);
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

// Fixed stories, each on the invariant it guards: at every step of a sign-in a card change or a
// stop that commits before the step is the one the step reads.
describe("RFC 136 property C regressions", () => {
  it("an edited Continue link does not reach a connector outside the request's set", async () => {
    const trace = await replay(
      [
        { kind: "authorize", client: 1, requested: "fake" },
        { kind: "continue", request: 0, connector: "other" },
        { kind: "continue", request: 0, connector: "fake" },
      ],
      "cardHonored",
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
        { kind: "authorize", client: 0, requested: "fake" },
        { kind: "callbackStart", upstream: 0, route: "crossed" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
      ],
      "cardHonored",
    );
    expect(trace).toContain(
      "callback U1 (C1, fake) on the route of other: 400 , the provider saw nothing",
    );
    expect(trace).toContain("callback U1 (C1, fake): A1 held at the provider");
    expect(trace).toContain("callback finish A1 (C1, fake) with identity: K1");
  });

  it("a connector taken off the card while the user is at the provider is not completed", async () => {
    const trace = await replay(
      [
        { kind: "authorize", client: 2, requested: "other" },
        { kind: "connectors", client: 2, set: "fake" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "redeem", code: 0 },
      ],
      "cardHonored",
    );
    expect(trace).toContain("authorize C3 (other): straight to other, U1");
    expect(trace).toContain("callback U1 (C3, other): 302 access_denied, the provider saw nothing");
  });

  it("a connector taken off the card while the provider answers completes no sign-in", async () => {
    const trace = await replay(
      [
        { kind: "authorize", client: 2, requested: "none" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "connectors", client: 2, set: "fake" },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "redeem", code: 0 },
      ],
      "cardHonored",
    );
    expect(trace).toContain("callback U1 (C3, other): A1 held at the provider");
    expect(trace).toContain("callback finish A1 (C3, other) with identity: 302 access_denied");
    expect(trace).toContain("redeem: no code yet, skipped");
  });

  it("a connector taken off the card between the page and Continue sends no one to the provider", async () => {
    const trace = await replay(
      [
        { kind: "authorize", client: 1, requested: "both" },
        { kind: "connectors", client: 1, set: "fake" },
        { kind: "continue", request: 0, connector: "other" },
        { kind: "continue", request: 0, connector: "fake" },
      ],
      "cardHonored",
    );
    expect(trace).toContain("authorize C2 (both): page P1 offers fake, other");
    expect(trace.at(-2)).toMatch(/^continue P1 \(C2\) with other: \d+$/);
    expect(trace.at(-1)).toBe("continue P1 (C2) with fake: to fake, U1");
  });

  it("a connector added to the card after the page is not one the request stored", async () => {
    const trace = await replay(
      [
        { kind: "connectors", client: 1, set: "fake" },
        { kind: "authorize", client: 1, requested: "none" },
        { kind: "connectors", client: 1, set: "both" },
        { kind: "continue", request: 0, connector: "other" },
      ],
      "cardHonored",
    );
    expect(trace).toContain("authorize C2 (none): page P1 offers fake");
    expect(trace.at(-1)).toBe("continue P1 (C2) with other (edited link): 404");
  });

  it("a return address taken off the card while the provider answers completes no sign-in", async () => {
    const trace = await replay(
      [
        { kind: "authorize", client: 0, requested: "none" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "redirect", client: 0, on: false },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "redirect", client: 0, on: true },
        { kind: "redeem", code: 0 },
      ],
      "noSignInWhenStopped",
    );
    // The broker's own error page: the address is not on the card when the step refuses.
    expect(trace).toContain("callback finish A1 (C1, fake) with identity: 400 ");
    expect(trace).toContain("redeem: no code yet, skipped");
  });
  it("a return address taken off the card after the code refuses the code", async () => {
    const trace = await replay(
      [
        { kind: "authorize", client: 0, requested: "none" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "redirect", client: 0, on: false },
        { kind: "redeem", code: 0 },
        { kind: "redirect", client: 0, on: true },
        { kind: "redeem", code: 0 },
      ],
      "noSignInWhenStopped",
    );
    expect(trace).toContain("redeem K1 (C1, fake): 400 invalid_grant");
    expect(trace.at(-1)).toBe("redeem K1 (C1, fake): 200 ");
  });

  it("a stop that lands while the provider answers completes no sign-in", async () => {
    const trace = await replay(
      [
        { kind: "authorize", client: 0, requested: "none" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "stop", key: "owner:201", on: true },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
      ],
      "noSignInWhenStopped",
    );
    expect(trace).toContain("callback finish A1 (C1, fake) with identity: 302 access_denied");
  });

  it("two stops on one card: the end of one leaves the other, and a code issued before both is good once after them", async () => {
    const trace = await replay(
      [
        { kind: "authorize", client: 0, requested: "none" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "stop", key: "repository:101", on: true },
        { kind: "stop", key: "owner:201", on: true },
        { kind: "redeem", code: 0 },
        { kind: "stop", key: "repository:101", on: false },
        { kind: "redeem", code: 0 },
        { kind: "authorize", client: 0, requested: "none" },
        { kind: "stop", key: "owner:201", on: false },
        { kind: "redeem", code: 0 },
        { kind: "redeem", code: 0 },
      ],
      "noSignInWhenStopped",
    );
    expect(
      trace.filter((line) => line === "redeem K1 (C1, fake): 401 invalid_client"),
    ).toHaveLength(2);
    expect(trace).toContain("authorize C1 (none): 403");
    expect(trace.at(-2)).toBe("redeem K1 (C1, fake): 200 ");
    expect(trace.at(-1)).toBe("redeem K1 (C1, fake): 400 invalid_grant");
  });

  it("a new owner's key on the cards while the provider answers: the old owner's stop no longer holds, the new owner's does", async () => {
    const trace = await replay(
      [
        { kind: "authorize", client: 0, requested: "none" },
        { kind: "callbackStart", upstream: 0, route: "own" },
        { kind: "stop", key: "owner:201", on: true },
        { kind: "regate", repository: "101", owner: "202" },
        { kind: "callbackFinish", attempt: 0, outcome: "identity" },
        { kind: "redeem", code: 0 },
        { kind: "stop", key: "owner:202", on: true },
        { kind: "authorize", client: 0, requested: "none" },
      ],
      "noSignInWhenStopped",
    );
    expect(trace).toContain("callback finish A1 (C1, fake) with identity: K1");
    expect(trace).toContain("redeem K1 (C1, fake): 200 ");
    expect(trace.at(-1)).toBe("authorize C1 (none): 403");
  });

  it("confirm is read at /authorize: a flip after it changes nothing for that sign-in", async () => {
    const trace = await replay(
      [
        { kind: "confirm", client: 0, on: true },
        { kind: "authorize", client: 0, requested: "none" },
        { kind: "confirm", client: 0, on: false },
        { kind: "continue", request: 0, connector: "fake" },
        { kind: "authorize", client: 0, requested: "none" },
      ],
      "confirmHonored",
    );
    expect(trace).toContain("authorize C1 (none): page P1 offers fake");
    expect(trace).toContain("continue P1 (C1) with fake: to fake, U1");
    expect(trace.at(-1)).toBe("authorize C1 (none): straight to fake, U2");
  });
});

/**
 * One request that asks for the login's age, through an OIDC connector with each pair of
 * capabilities. `delayMs` is the time the user spends at the provider; `authTime` is the
 * provider's `auth_time` as seconds from the callback's second (`undefined`: none).
 */
type AgeCase = {
  promptLogin: boolean;
  relaysMaxAge: boolean;
  prompt: boolean;
  maxAge: number | undefined;
  delayMs: number;
  authTime: number | undefined;
};

const ageCase: fc.Arbitrary<AgeCase> = fc.record({
  promptLogin: fc.boolean(),
  relaysMaxAge: fc.boolean(),
  prompt: fc.boolean(),
  maxAge: fc.constantFrom(undefined, 0, 1, 10, 300, 10_000),
  delayMs: fc.constantFrom(0, 900, 1_500, 30_000, 120_000),
  authTime: fc.constantFrom(undefined, -20_000, -301, -300, -61, -60, -11, -10, -1, 0, 1, 60, 61),
});

/**
 * The model: `prompt=login` or `max_age=0` is a forced login, which needs `promptLogin`. A positive
 * `max_age` alone goes upstream as itself to a connector that relays it, else as a forced login.
 */
function agePath(c: AgeCase) {
  const forced = c.prompt || c.maxAge === 0;
  if (!forced && c.maxAge === undefined) {
    return "none";
  }
  if (!forced && c.relaysMaxAge) {
    return "relay";
  }
  return c.promptLogin ? "forced" : "refused";
}

describe("the login's age", () => {
  it("is forced, relayed, or refused as the connector can, and the id_token names the provider's time", async () => {
    const T = 1_800_000_000_250;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      await fc.assert(
        // oxlint-disable-next-line complexity -- one branch per path of the model, each with its checks.
        fc.asyncProperty(ageCase, async (c) => {
          vi.useFakeTimers({ now: T, toFake: ["Date"] });
          const fetch = stubFetch();
          const idp = await fakeOidcUpstream(fetch);
          const connector = {
            ...idp.connector,
            promptLogin: c.promptLogin,
            maxAge: c.relaysMaxAge,
          };
          const h = await createBroker({ fetch, config: { connectors: [connector] } });
          h.clock.set(T);
          const redirectUri = "https://app.example/cb";
          const client = await h.registerClient({ appName: "Age", redirectUri });
          const { verifier, challenge } = await pkce();
          const params = new URLSearchParams({
            client_id: client.clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: "openid",
            code_challenge: challenge,
            code_challenge_method: "S256",
            ...(c.prompt ? { prompt: "login" } : {}),
            ...(c.maxAge === undefined ? {} : { max_age: String(c.maxAge) }),
          });
          const started = await h.fetchBroker(`${h.issuer}/authorize?${params.toString()}`);
          const path = agePath(c);
          if (path === "refused") {
            expect(started.status).toBe(400);
            expect(await started.text()).toContain("cannot reauthenticate the user");
            return;
          }
          const upstream = new URL(started.headers.get("location") ?? "");
          expect(upstream.origin).toBe("https://server.example.com");
          expect(upstream.searchParams.get("prompt")).toBe(path === "forced" ? "login" : null);
          expect(upstream.searchParams.get("max_age")).toBe(
            path === "forced" ? "0" : path === "relay" ? String(c.maxAge) : null,
          );
          const now = T + c.delayMs;
          vi.setSystemTime(now);
          h.clock.set(now);
          const nowSecond = Math.floor(now / 1000);
          const authTime = c.authTime === undefined ? undefined : nowSecond + c.authTime;
          idp.nextIdToken({ nonce: upstream.searchParams.get("nonce") ?? "", authTime });
          const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
          callback.searchParams.set("code", "upstream-code");
          callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
          const back = await h.fetchBroker(callback, { headers: txnCookie(started) });
          const location = new URL(back.headers.get("location") ?? "");
          // A forced login falls inside the request, give or take 60 seconds; a positive max_age
          // holds with no tolerance; no time later than 60 seconds from now.
          const accepted =
            path === "none" ||
            (authTime !== undefined &&
              authTime <= nowSecond + 60 &&
              (path !== "forced" || authTime >= Math.floor(T / 1000) - 60) &&
              (c.maxAge === undefined || c.maxAge === 0 || nowSecond - authTime <= c.maxAge));
          expect(location.searchParams.get("error")).toBe(accepted ? null : "login_required");
          if (!accepted) {
            return;
          }
          const tokens = await h.fetchBroker(`${h.issuer}/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              client_id: client.clientId,
              client_secret: client.clientSecret,
              code: location.searchParams.get("code") ?? "",
              code_verifier: verifier,
              redirect_uri: redirectUri,
            }).toString(),
          });
          const answer = Schema.decodeUnknownSync(TokenAnswer)(await tokens.json());
          expect(decodeJwt(answer.id_token ?? "").auth_time).toBe(
            path === "none" ? undefined : authTime,
          );
        }),
        { numRuns: 150, seed: 31_212 },
      );
    } finally {
      vi.useRealTimers();
    }
  }, 120_000);
});
