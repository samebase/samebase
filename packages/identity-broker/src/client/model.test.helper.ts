/// <reference types="vite-plus/client" />
import fc from "fast-check";
import { vi } from "vite-plus/test";
import { createHarness, sha256Hex, type Harness } from "./harness.test.helper.js";
import {
  hubConnectors,
  hubRegistration,
  jsonResponse,
  MODERATION_KEY,
  signToken,
  stubProviders,
} from "./hub.test.helper.js";
import type { PolicyFunction } from "./policy.js";
import { cloudflareConnection, type ResourceProvider } from "./resourceProviders.js";

// The world of the model-based tests of RFC 136: one hub on the real component, one clock, and one
// fetch dispatcher for every outside party (GitHub's keys, the hosts' verification files, a resource
// provider whose refresh answers are held until a command releases them). The commands and the
// model are in registration.model.test.ts and refresh.model.test.ts.

/** The start of every run. Only `Date` is fake, so convex-test's scheduler keeps real timers. */
export const EPOCH = Date.UTC(2026, 10, 6, 12, 0, 0);

const JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";

export function startClock() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(EPOCH);
}

export function advanceClock(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

/** A promise that the test settles from outside. The executor runs at once, so `settle` is set. */
export function deferred<T>() {
  const box: { settle: (value: T) => void } = { settle: () => undefined };
  const promise = new Promise<T>((resolve) => {
    box.settle = resolve;
  });
  return { promise, settle: (value: T) => box.settle(value) };
}

/**
 * The broker in the hub mode, as `createHub` of hub.test.helper.ts mounts it, with API resources
 * and the story's policy, which reads the model's state at each request.
 */
export async function createModelHub(options: {
  resources: ResourceProvider[];
  policy: PolicyFunction;
}) {
  vi.stubEnv("IDENTITY_HUB_MODERATION_KEY", MODERATION_KEY);
  return await createHarness({
    connectors: hubConnectors(),
    resources: options.resources,
    registration: hubRegistration(options.policy),
  });
}

/** The resource of the model: Cloudflare's OAuth application, which rotates refresh tokens. */
export const RESOURCE = cloudflareConnection({
  clientId: () => "provider-client",
  clientSecret: () => "provider-secret",
  scopes: ["workers-scripts.read"],
});

/** RFC 6749 section 5.1's token response, with values numbered so that each answer is its own. */
function providerTokens(serial: number) {
  return {
    access_token: `2YotnFZFEjr1zCsicMWpAA-${serial}`,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: `tGzv3JOkF0XG5Qx2TlKWIA-${serial}`,
    example_parameter: "example_value",
  };
}

/** What the held provider answers to one refresh request. */
export type RefreshOutcome = "tokens" | "invalid_grant" | "transient";

/** A refresh request that reached the provider, waiting for its answer. */
export type HeldRefresh = {
  /** The provider refresh token that the hub sent, as the grant held it when the attempt claimed. */
  upstreamRefreshToken: string;
  answer: (outcome: RefreshOutcome) => void;
};

/** What the held sign-in provider answers to the hub's code exchange of a callback. */
export type SignInOutcome = "identity" | "invalid_grant";

/** A connector callback whose code exchange reached the sign-in provider, waiting for its answer. */
export type HeldSignIn = { answer: (outcome: SignInOutcome) => void };

/** The sign-in provider of the fake connectors, as `fakeUpstream` serves it. */
const UPSTREAM = "https://upstream.test";

/** What a host serves at `/samebase-verification.json`. */
export type HostOutcome = "present" | "missing" | "wrongId";

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

/** GitHub's key set as `stubProviders` serves it, read once through its stub. */
let gitHubKeySet: unknown = null;
async function readGitHubKeySet() {
  if (gitHubKeySet === null) {
    stubProviders();
    gitHubKeySet = await (await fetch(JWKS_URL)).json();
  }
  return gitHubKeySet;
}

/**
 * The outside parties of one run. Installs the one fetch stub, so it must come after the harness,
 * whose upstream stub it replaces.
 */
export async function createWorld(repositories: Record<string, string>) {
  const keySet = await readGitHubKeySet();
  const owners = new Map(Object.entries(repositories));
  let host: { outcome: HostOutcome; repositoryId: string } = {
    outcome: "present",
    repositoryId: "",
  };
  let hostHold: { reached: () => void; release: Promise<void> } | null = null;
  let refreshWaiter: ((held: HeldRefresh) => void) | null = null;
  let signInWaiter: ((held: HeldSignIn) => void) | null = null;
  let serial = 0;
  /** Requests that no command expected, such as a refresh with no waiter. They fail the run. */
  const unexpected: string[] = [];

  async function answerHost() {
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
  }

  async function answerProvider(request: Request) {
    const body = new URLSearchParams(await request.text());
    serial += 1;
    if (body.get("grant_type") === "authorization_code") {
      return Response.json(providerTokens(serial));
    }
    const waiter = refreshWaiter;
    refreshWaiter = null;
    if (waiter === null) {
      unexpected.push("a refresh request reached the provider with no command waiting for it");
      return new Response(null, { status: 503 });
    }
    const answer = deferred<RefreshOutcome>();
    waiter({ upstreamRefreshToken: body.get("refresh_token") ?? "", answer: answer.settle });
    const outcome = await answer.promise;
    switch (outcome) {
      case "tokens":
        return Response.json(providerTokens(serial));
      case "invalid_grant":
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      case "transient":
        return new Response(null, { status: 503 });
      default:
        return outcome satisfies never;
    }
  }

  /**
   * The sign-in provider's code exchange. With a waiter, the answer waits for the command that
   * releases it; without one, the identity is answered at once.
   */
  async function answerSignIn(request: Request) {
    const body = new URLSearchParams(await request.text());
    if (body.get("code") !== "upstream-code" || body.get("client_secret") !== "up-secret") {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    const waiter = signInWaiter;
    signInWaiter = null;
    let outcome: SignInOutcome = "identity";
    if (waiter !== null) {
      const answer = deferred<SignInOutcome>();
      waiter({ answer: answer.settle });
      outcome = await answer.promise;
    }
    switch (outcome) {
      case "identity":
        return Response.json({ access_token: "up-access", token_type: "bearer" });
      case "invalid_grant":
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      default:
        return outcome satisfies never;
    }
  }

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (request.url === JWKS_URL) {
        return jsonResponse(keySet);
      }
      if (url.pathname === "/samebase-verification.json") {
        return await answerHost();
      }
      if (request.url === RESOURCE.server.token_endpoint && request.method === "POST") {
        return await answerProvider(request);
      }
      if (request.url === `${UPSTREAM}/.well-known/oauth-authorization-server`) {
        return Response.json({
          issuer: UPSTREAM,
          authorization_endpoint: `${UPSTREAM}/authorize`,
          token_endpoint: `${UPSTREAM}/token`,
          response_types_supported: ["code"],
        });
      }
      if (request.url === `${UPSTREAM}/token` && request.method === "POST") {
        return await answerSignIn(request);
      }
      if (request.url === "https://api.upstream.test/user") {
        return request.headers.get("authorization") === "Bearer up-access"
          ? Response.json({ id: "42", name: "Octo Cat", email: "octo@example.com" })
          : new Response("unauthorized", { status: 401 });
      }
      unexpected.push(`unexpected ${request.method} ${url.origin}${url.pathname}`);
      return new Response("unexpected", { status: 599 });
    }),
  );

  return {
    unexpected,
    github: {
      ownerOf(repositoryId: string) {
        return owners.get(repositoryId) ?? "";
      },
      transfer(repositoryId: string, ownerId: string) {
        owners.set(repositoryId, ownerId);
      },
      /** A new OIDC token of a run of the repository under its current owner, issued now. */
      async prove(repositoryId: string, stage: string) {
        const ownerId = owners.get(repositoryId) ?? "";
        const iat = Math.floor(Date.now() / 1_000);
        const token = await signToken({
          ...stageClaims(stage),
          repository_id: repositoryId,
          repository_owner_id: ownerId,
          repository: repositoryName(repositoryId, ownerId),
          repository_owner: `owner-${ownerId}`,
        });
        // signToken's default lifetime: GitHub's documented example token lives 300 seconds.
        return { token, ownerId, stage, iat, expiresAt: iat + 300 };
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
    provider: {
      /** Settles with the next refresh request that reaches the provider. */
      expectRefresh() {
        const arrival = deferred<HeldRefresh>();
        refreshWaiter = arrival.settle;
        return arrival.promise;
      },
      cancelExpect() {
        refreshWaiter = null;
      },
      /** Settles with the next callback whose code exchange reaches the sign-in provider. */
      expectSignIn() {
        const arrival = deferred<HeldSignIn>();
        signInWaiter = arrival.settle;
        return arrival.promise;
      },
      cancelExpectSignIn() {
        signInWaiter = null;
      },
    },
  };
}

export type World = Awaited<ReturnType<typeof createWorld>>;

/** Every row of the tables that the invariants read, in insertion order. */
export async function readRows(h: Harness) {
  return await h.t.run(async (ctx) => ({
    tenants: await ctx.db.query("tenants").collect(),
    initialAccessTokens: await ctx.db.query("initialAccessTokens").collect(),
    apps: await ctx.db.query("apps").collect(),
    clients: await ctx.db.query("clients").collect(),
    events: await ctx.db.query("events").collect(),
    rateLimits: await ctx.db.query("rateLimits").collect(),
    refreshGrants: await ctx.db.query("refreshGrants").collect(),
  }));
}

export type Rows = Awaited<ReturnType<typeof readRows>>;

/** The grant row of a broker refresh token, or null. */
export async function readGrant(h: Harness, refreshToken: string) {
  const tokenHash = await sha256Hex(refreshToken);
  return await h.t.run(
    async (ctx) =>
      await ctx.db
        .query("refreshGrants")
        .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
        .unique(),
  );
}

/** A broken invariant, by its name in the model. The runner reports it with the trace. */
export class Violation extends Error {
  constructor(
    readonly invariant: string,
    message: string,
  ) {
    super(`${invariant}: ${message}`);
  }
}

/**
 * The invariants that a run checks. `only` (the env `RFC136_ONLY`, or a regression test) makes one
 * invariant the only one that fails the run; the others are still computed.
 */
export type Checks = { only: string | null };

export function check(checks: Checks, invariant: string, holds: boolean, message: string) {
  if (!holds && (checks.only === null || checks.only === invariant)) {
    throw new Violation(invariant, message);
  }
}

/** One played story: the trace of what each command did, with logical handles only. */
export type Story = { trace: string[]; commands: number };

/**
 * Runs `play` on generated command lists with fast-check, from a fixed seed unless `RFC136_SEED`
 * names one, `numRuns` times unless `RFC136_RUNS` says otherwise. A failure answers the seed, the
 * shrink path, the clock, and the minimized trace, as it replayed once more. `RFC136_REPORT` prints
 * the report and the timings.
 */
export async function checkModel<Command>(options: {
  name: string;
  commands: fc.Arbitrary<Command[]>;
  play: (commands: Command[], checks: Checks, story: Story) => Promise<void>;
  numRuns: number;
}) {
  const seed = Number(process.env["RFC136_SEED"] ?? "136");
  const only = process.env["RFC136_ONLY"];
  const checks: Checks = { only: only === undefined || only === "" ? null : only };
  const totals = { runs: 0, commands: 0 };
  const started = performance.now();
  const result = await fc.check(
    fc.asyncProperty(options.commands, async (commands) => {
      const story: Story = { trace: [], commands: 0 };
      try {
        await options.play(commands, checks, story);
      } finally {
        totals.runs += 1;
        totals.commands += story.commands;
      }
    }),
    { numRuns: Number(process.env["RFC136_RUNS"] ?? options.numRuns), seed },
  );
  const ms = performance.now() - started;
  const timing =
    `${options.name}: ${totals.runs} runs (shrinking included), ${totals.commands} commands, ` +
    `${Math.round(ms)} ms, ${(ms / Math.max(1, totals.commands)).toFixed(1)} ms per command`;
  let report: string | null = null;
  if (result.failed && result.counterexample !== null) {
    const [commands] = result.counterexample;
    const story: Story = { trace: [], commands: 0 };
    let failure = "the replay did not fail again";
    try {
      await options.play(commands, checks, story);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    report = [
      `${options.name} failed`,
      `seed: ${result.seed}`,
      `path: ${result.counterexamplePath}`,
      `code: ${process.env["GITHUB_SHA"] ?? "local checkout"}`,
      `clock: starts at ${new Date(EPOCH).toISOString()}, Date only`,
      `failure: ${failure}`,
      "minimized trace:",
      ...story.trace.map((line, index) => `  ${index + 1}. ${line}`),
    ].join("\n");
  }
  if (process.env["RFC136_REPORT"] !== undefined) {
    console.info(report === null ? `${timing}\n${options.name} passed` : `${timing}\n${report}`);
  }
  return { report, timing };
}

/**
 * Plays one command and turns anything that it throws, other than a broken invariant, into the
 * invariant "no command throws".
 */
export async function step(checks: Checks, story: Story, run: () => Promise<void>) {
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

/** No answer of the broker is a 500. A 503 is the refresh lease's or a provider outage's answer. */
export function checkAnswer(checks: Checks, what: string, response: Response) {
  check(checks, "noServerError", response.status !== 500, `${what} answered 500`);
}
