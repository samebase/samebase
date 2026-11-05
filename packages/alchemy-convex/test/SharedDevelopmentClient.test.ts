// `alchemy-convex hub-client --shared` against the fake Convex control plane, a fake state store,
// and a fake identity hub behind a stubbed fetch. The production row comes from a real deploy of
// Convex.SharedHubClient, saved as the store client saves it.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Test from "@alchemy.run/test/Vitest";
import { encodeState, State } from "alchemy/State";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Convex from "../src/index.ts";
import { fromValues } from "../src/Credentials.ts";
import { ManagementApiLive } from "../src/ManagementApi.ts";
import { registerSharedDevelopmentClient } from "../src/SharedHubClient.ts";
import { STORE_PROJECT_NAME } from "../src/State.ts";
import { STORE_VERSION } from "../src/store/convex/version.ts";
import { FakeConvex, hubFixture, recorded, stateFixture } from "./fakeConvex.ts";

const TEAM = 38516;
const STACK = "nicu/scout";
const ISSUER = "https://hub.test";
const OIDC_REQUEST_URL = "https://oidc.test/token?api-version=2.0";
const OIDC_TOKEN = "oidc-token";
/** The 201 answers of `POST /hub-clients`, recorded from the hub of RFC 133. */
const PRODUCTION_ANSWER = hubFixture("hub-clients-production.json");
const PREVIEW_ANSWER = hubFixture("hub-clients-preview.json");
const REPOSITORY_ID = String(PRODUCTION_ANSWER["repository"]);
const PRODUCTION_URI = "https://prod-site-1.convex.site/auth/hub/callback";
const CLOUD_SITE = "https://happy-otter-123.convex.site";
const LOCAL_SITE = "http://127.0.0.1:3211";
const CALLBACK_PATH = "/auth/hub/callback";

const { test } = Test.make({
  providers: Convex.providers(Convex.fromValues({ accessToken: Redacted.make("test-token") })),
});

const ClientRequest = Schema.Struct({
  app: Schema.String,
  redirectUri: Schema.String,
  softwareVersion: Schema.String,
});

/** One request that reached the hub. */
interface Sent {
  readonly method: string;
  readonly url: string;
  readonly authorization: string;
  readonly body: unknown;
}

/**
 * The identity hub of RFC 133: `/hub-clients` takes GitHub's token, and answers a production client
 * with the app's initial access token, or takes that token for a development client of the same
 * app. A client's own record answers its token as `registrationEndpoints` of the broker does.
 */
class FakeHub {
  readonly sent: Sent[] = [];
  /** The clients on the hub: their token and return address. */
  readonly clients = new Map<string, { token: string; redirectUri: string }>();
  /** The initial access token of each app. */
  readonly tokens = new Map<string, string>();
  /** Set: the answer of `/hub-clients` in place of the normal one. */
  registrar: ((request: Sent) => Response) | undefined;
  /** Set: the answer of a client's own record in place of the normal one. */
  record: (() => Response) | undefined;
  /** False: a production registration answers no token, as the hub before RFC 133 did. */
  issuesTokens = true;
  private nextClient = 1;

  constructor(private readonly convex: FakeConvex) {}

  install() {
    vi.stubGlobal("fetch", this.fetch);
    return this;
  }

  private readonly fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.host === "oidc.test") return Response.json({ count: 1, value: OIDC_TOKEN });
    if (!request.url.startsWith(ISSUER)) return this.convex.fetch(request);
    const text = await request.text();
    const sent: Sent = {
      method: request.method,
      url: request.url,
      authorization: request.headers.get("Authorization") ?? "",
      body: text === "" ? undefined : JSON.parse(text),
    };
    this.sent.push(sent);
    return url.pathname === "/hub-clients" ? this.answerRegistrar(sent) : this.answerRecord(sent);
  };

  private answerRegistrar(sent: Sent) {
    if (this.registrar !== undefined) return this.registrar(sent);
    const { app, redirectUri } = Schema.decodeUnknownSync(ClientRequest)(sent.body);
    const bearer = sent.authorization.replace(/^Bearer /, "");
    const production = bearer === OIDC_TOKEN;
    if (!production && ![...this.tokens.values()].includes(bearer)) {
      return Response.json({ error: "invalid_token" }, { status: 401 });
    }
    if (!production && this.tokens.get(app) !== bearer) {
      return Response.json({ error: "not_allowed", reason: "app_mismatch" }, { status: 403 });
    }
    const clientId = `cl_${this.nextClient++}`;
    const token = `token-of-${clientId}`;
    this.clients.set(clientId, { token, redirectUri });
    const initialAccessToken = `iat-of-${clientId}`;
    if (production && this.issuesTokens) this.tokens.set(app, initialAccessToken);
    // A production answer without the token fields is the recorded preview answer.
    const withToken = production && this.issuesTokens;
    return Response.json(
      {
        ...(withToken ? PRODUCTION_ANSWER : PREVIEW_ANSWER),
        issuer: ISSUER,
        client_id: clientId,
        client_secret: `secret-of-${clientId}`,
        registration_access_token: token,
        registration_client_uri: `${ISSUER}/register/${clientId}`,
        redirect_uri: redirectUri,
        ...(withToken ? { initial_access_token: initialAccessToken } : {}),
      },
      { status: 201 },
    );
  }

  private answerRecord({ authorization, url }: Sent) {
    if (this.record !== undefined) return this.record();
    const clientId = url.split("/").at(-1) ?? "";
    const client = this.clients.get(clientId);
    if (client === undefined || authorization !== `Bearer ${client.token}`) {
      return Response.json({ error: "invalid_token" }, { status: 401 });
    }
    return Response.json({ client_id: clientId, redirect_uris: [client.redirectUri] });
  }

  /** The requests to `/hub-clients`. */
  registrations() {
    return this.sent.filter(({ url }) => url.endsWith("/hub-clients"));
  }
}

/**
 * The Convex CLI of the dev deployment with `variables` and `siteUrl`: it lists, reads, sets, and
 * removes them. `env set --force` reads standard input; `env set NAME VALUE` reads its arguments.
 */
const cli = (siteUrl: string, variables = new Map<string, string>()) => {
  const calls: string[] = [];
  const writes: string[] = [];
  const convex = (args: readonly string[], input?: string) => {
    calls.push(args.join(" "));
    const [command, subcommand, name = "", value = ""] = args;
    if (command === "run") return JSON.stringify(siteUrl);
    if (subcommand === "list") return [...variables.keys()].join("\n");
    if (subcommand === "get") return variables.get(name) ?? "";
    if (subcommand === "remove") variables.delete(name);
    if (subcommand === "set" && input !== undefined) {
      writes.push(input);
      for (const line of input.trim().split("\n")) {
        const [key = "", text = ""] = line.split("=");
        variables.set(key, text.replace(/^'|'$/g, ""));
      }
    } else if (subcommand === "set") {
      variables.set(name, value);
    }
    return "";
  };
  return { convex, calls, writes, variables };
};

/** A new empty directory. */
const directory = () => mkdtempSync(join(tmpdir(), "hub-client-"));

/** A directory whose `.env.local` selects `deployment`, as `npx convex dev` writes it. */
const selecting = (deployment: string, at = directory()) => {
  writeFileSync(
    join(at, ".env.local"),
    `# Deployment used by \`npx convex dev\`\nCONVEX_DEPLOYMENT=dev:${deployment} # team: nicu, project: scout\n\nVITE_CONVEX_URL=https://${deployment}.convex.cloud\n`,
  );
  return at;
};

const git = (cwd: string, args: readonly string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** A main checkout with `.env.local` that selects `deployment`, and a linked worktree of it. */
const linkedWorktree = (deployment: string) => {
  const root = directory();
  const main = join(root, "main");
  mkdirSync(main);
  git(main, ["init", "--quiet"]);
  git(main, [
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--quiet",
    "--allow-empty",
    "--message",
    "start",
  ]);
  git(main, ["worktree", "add", "--quiet", join(root, "linked")]);
  selecting(deployment, main);
  return join(root, "linked");
};

/**
 * The team's Convex: the state store, and the project of the app with the dev deployment that a
 * laptop selects. The hub registers the production client of a real deploy, which the store keeps
 * under stage `prod` of STACK.
 */
const world = (stack: Test.ScratchStack) => {
  const convex = new FakeConvex();
  const hub = new FakeHub(convex).install();
  const [store] = convex.deploymentsOf(
    convex.addProject({ name: STORE_PROJECT_NAME, teamId: TEAM }),
  );
  if (store === undefined) throw new Error("the fake store project has no deployment");
  const saved = convex.addStore(store.name, STORE_VERSION);
  const deployment = convex.addDeployment({
    projectId: convex.addProject({ name: "scout", teamId: TEAM }),
    type: "dev",
    name: "nicu",
  });

  /** Deploys production in GitHub Actions, and saves its client row as the store client does. */
  const deployMain = Effect.gen(function* () {
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", OIDC_REQUEST_URL);
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "oidc-request-token");
    yield* stack.deploy(
      Convex.SharedHubClient("HubClient", {
        app: "scout",
        redirectUri: PRODUCTION_URI,
        deploymentType: "production",
      }),
    );
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", "");
    const row = yield* Effect.gen(function* () {
      const state = yield* yield* State;
      return yield* state.get({ stack: stack.name, stage: stack.stage, fqn: "HubClient" });
    }).pipe(Effect.provide(stack.state));
    saved.rows.push({
      stack: STACK,
      stage: "prod",
      fqn: "HubClient",
      value: JSON.stringify(encodeState(row)),
    });
    hub.sent.length = 0;
  });
  return { convex, hub, deployment, deployMain, store: store.name };
};

const run = (options: {
  readonly cwd: string;
  readonly convex: (args: readonly string[], input?: string) => string;
  readonly team?: string;
  readonly app?: string;
}) =>
  registerSharedDevelopmentClient({
    stack: STACK,
    app: options.app ?? "scout",
    callbackPath: CALLBACK_PATH,
    cwd: options.cwd,
    convex: options.convex,
    ...(options.team === undefined ? {} : { team: options.team }),
  }).pipe(
    Effect.provide(
      ManagementApiLive().pipe(
        Layer.provide(fromValues({ accessToken: Redacted.make("test-token") })),
      ),
    ),
  );

/** The five variables of a client that the hub registered on `redirectUri`. */
const variablesOf = (clientId: string) =>
  new Map([
    ["HUB_ISSUER", ISSUER],
    ["HUB_CLIENT_ID", clientId],
    ["HUB_CLIENT_SECRET", `secret-of-${clientId}`],
    ["HUB_REGISTRATION_URI", `${ISSUER}/register/${clientId}`],
    ["HUB_REGISTRATION_TOKEN", `token-of-${clientId}`],
  ]);

const writeOf = (clientId: string) =>
  `HUB_ISSUER='${ISSUER}'\nHUB_CLIENT_ID='${clientId}'\nHUB_CLIENT_SECRET='secret-of-${clientId}'\nHUB_REGISTRATION_URI='${ISSUER}/register/${clientId}'\nHUB_REGISTRATION_TOKEN='token-of-${clientId}'\n`;

const OFF_VARIABLES = new Map([
  ["HUB_ISSUER", "http://127.0.0.1:1"],
  ["HUB_CLIENT_ID", "no-hub"],
  ["HUB_CLIENT_SECRET", "no-hub"],
]);

beforeEach(() => {
  vi.stubEnv("CONVEX_TEAM_ID", "");
  vi.stubEnv("HUB_URL", ISSUER);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("registerSharedDevelopmentClient", () => {
  test.provider(
    "registers a development client with the token of stage prod, and writes it on standard input",
    (stack) =>
      Effect.gen(function* () {
        const { deployMain, deployment, hub } = world(stack);
        yield* deployMain;
        const { calls, convex, variables, writes } = cli(CLOUD_SITE, new Map(OFF_VARIABLES));
        const line = yield* run({ cwd: selecting(deployment), convex });
        expect(line).toBe(`Hub client registered for ${CLOUD_SITE}${CALLBACK_PATH}.`);
        expect(hub.sent).toEqual([
          {
            method: "POST",
            url: `${ISSUER}/hub-clients`,
            authorization: "Bearer iat-of-cl_1",
            body: {
              app: "scout",
              redirectUri: `${CLOUD_SITE}${CALLBACK_PATH}`,
              softwareVersion: "happy-otter-123.convex.site",
            },
          },
        ]);
        // The site serves the repository id for the hub's file check.
        expect(calls).toContain(`env set SAMEBASE_REPOSITORY_ID ${REPOSITORY_ID}`);
        expect(calls.at(-1)).toBe("env set --force");
        expect(writes).toEqual([writeOf("cl_2")]);
        expect(variables.get("HUB_CLIENT_ID")).toBe("cl_2");
      }),
  );

  test.provider("a local backend gets a loopback client and no repository id", (stack) =>
    Effect.gen(function* () {
      const { deployMain, deployment, hub } = world(stack);
      yield* deployMain;
      const { calls, convex, writes } = cli(LOCAL_SITE);
      expect(yield* run({ cwd: selecting(deployment), convex })).toBe(
        `Hub client registered for ${LOCAL_SITE}${CALLBACK_PATH}.`,
      );
      expect(hub.clients.get("cl_2")?.redirectUri).toBe(`${LOCAL_SITE}${CALLBACK_PATH}`);
      expect(calls.filter((call) => call.includes("SAMEBASE_REPOSITORY_ID"))).toEqual([]);
      expect(writes).toEqual([writeOf("cl_2")]);
    }),
  );

  test.provider("--team names the team without a selected deployment", (stack) =>
    Effect.gen(function* () {
      const { deployMain } = world(stack);
      yield* deployMain;
      const { convex, writes } = cli(LOCAL_SITE);
      expect(yield* run({ cwd: directory(), convex, team: String(TEAM) })).toContain(
        "Hub client registered",
      );
      expect(writes).toHaveLength(1);
    }),
  );

  test.provider("CONVEX_TEAM_ID names the team without a selected deployment", (stack) =>
    Effect.gen(function* () {
      const { deployMain } = world(stack);
      yield* deployMain;
      vi.stubEnv("CONVEX_TEAM_ID", String(TEAM));
      const { convex, writes } = cli(LOCAL_SITE);
      expect(yield* run({ cwd: directory(), convex })).toContain("Hub client registered");
      expect(writes).toHaveLength(1);
    }),
  );

  test.provider(
    "a linked worktree finds the team from the .env.local of the main checkout",
    (stack) =>
      Effect.gen(function* () {
        const { deployMain, deployment } = world(stack);
        yield* deployMain;
        const { convex, writes } = cli(LOCAL_SITE);
        expect(yield* run({ cwd: linkedWorktree(deployment), convex })).toContain(
          "Hub client registered",
        );
        expect(writes).toHaveLength(1);
      }),
  );

  test.provider("no team: one line, and the values stay", (stack) =>
    Effect.gen(function* () {
      world(stack);
      const { calls, convex } = cli(LOCAL_SITE, new Map(OFF_VARIABLES));
      expect(yield* run({ cwd: directory(), convex })).toBe(
        "No Convex team for Google sign-in on this laptop: set CONVEX_TEAM_ID, or select a cloud development deployment.",
      );
      expect(calls).toEqual([]);
    }),
  );

  test.provider("a client on the current address is renewed with its own token", (stack) =>
    Effect.gen(function* () {
      const { deployMain, deployment, hub } = world(stack);
      yield* deployMain;
      const { convex, writes } = cli(LOCAL_SITE);
      const cwd = selecting(deployment);
      yield* run({ cwd, convex });
      hub.sent.length = 0;
      expect(yield* run({ cwd, convex })).toBe("Hub client renewed.");
      expect(hub.sent).toEqual([
        {
          method: "GET",
          url: `${ISSUER}/register/cl_2`,
          authorization: "Bearer token-of-cl_2",
          body: undefined,
        },
      ]);
      expect(writes).toHaveLength(1);
    }),
  );

  test.provider("a client on another address gets a new client", (stack) =>
    Effect.gen(function* () {
      const { deployMain, deployment, hub } = world(stack);
      yield* deployMain;
      hub.clients.set("cl_9", { token: "token-of-cl_9", redirectUri: "http://127.0.0.1:3212/x" });
      const { convex, writes } = cli(LOCAL_SITE, variablesOf("cl_9"));
      expect(yield* run({ cwd: selecting(deployment), convex })).toContain("Hub client registered");
      expect(hub.registrations()).toHaveLength(1);
      expect(writes).toEqual([writeOf("cl_2")]);
    }),
  );

  test.provider("a client that the hub no longer has gets a new client", (stack) =>
    Effect.gen(function* () {
      const { deployMain, deployment, hub } = world(stack);
      yield* deployMain;
      const { convex, writes } = cli(LOCAL_SITE, variablesOf("cl_9"));
      expect(yield* run({ cwd: selecting(deployment), convex })).toContain("Hub client registered");
      expect(hub.registrations()).toHaveLength(1);
      expect(writes).toEqual([writeOf("cl_2")]);
    }),
  );

  test.provider("403 on the renewal writes the off values and asks for nothing", (stack) =>
    Effect.gen(function* () {
      const { deployment, hub } = world(stack);
      hub.record = () => Response.json({ error: "access_denied" }, { status: 403 });
      const { calls, convex, variables, writes } = cli(LOCAL_SITE, variablesOf("cl_9"));
      expect(yield* run({ cwd: selecting(deployment), convex })).toBe(
        "The identity hub stopped the hub client of this laptop (HTTP 403), so the laptop has guest sign-in.",
      );
      expect(writes).toEqual([
        "HUB_ISSUER='http://127.0.0.1:1'\nHUB_CLIENT_ID='no-hub'\nHUB_CLIENT_SECRET='no-hub'\n",
      ]);
      expect(calls.slice(-2)).toEqual([
        "env remove HUB_REGISTRATION_URI",
        "env remove HUB_REGISTRATION_TOKEN",
      ]);
      expect(variables).toEqual(OFF_VARIABLES);
      expect(hub.registrations()).toEqual([]);
    }),
  );

  test.provider("a failed renewal keeps the values and says why", (stack) =>
    Effect.gen(function* () {
      const { deployment, hub } = world(stack);
      hub.record = () => new Response("no", { status: 500 });
      const { convex, variables, writes } = cli(LOCAL_SITE, variablesOf("cl_9"));
      expect(yield* run({ cwd: selecting(deployment), convex })).toBe(
        "The hub client keeps its values: the identity hub answered HTTP 500.",
      );
      expect(writes).toEqual([]);
      expect(variables).toEqual(variablesOf("cl_9"));
    }),
  );

  test.provider("no production row: one line, and the off values stay", (stack) =>
    Effect.gen(function* () {
      const { deployment, hub } = world(stack);
      const { calls, convex, writes } = cli(CLOUD_SITE, new Map(OFF_VARIABLES));
      expect(yield* run({ cwd: selecting(deployment), convex })).toBe(
        "Deploy to main once for Google sign-in on this laptop.",
      );
      expect(writes).toEqual([]);
      expect(calls.filter((call) => call.startsWith("env set"))).toEqual([]);
      expect(hub.sent).toEqual([]);
    }),
  );

  test.provider("a production row without a token: the same line", (stack) =>
    Effect.gen(function* () {
      const { deployMain, deployment, hub } = world(stack);
      hub.issuesTokens = false;
      yield* deployMain;
      const { convex, writes } = cli(CLOUD_SITE, new Map(OFF_VARIABLES));
      expect(yield* run({ cwd: selecting(deployment), convex })).toBe(
        "Deploy to main once for Google sign-in on this laptop.",
      );
      expect(writes).toEqual([]);
    }),
  );

  for (const [name, answer, text] of [
    [
      "app_mismatch",
      () => Response.json({ error: "not_allowed", reason: "app_mismatch" }, { status: 403 }),
      "the initial access token belongs to another app on the identity hub (HTTP 403)",
    ],
    [
      "a replaced token",
      () => Response.json({ error: "invalid_token" }, { status: 401 }),
      "the identity hub refused the initial access token of the app (HTTP 401)",
    ],
    [
      "rate_limited",
      () => Response.json({ error: "rate_limited", window: "owner" }, { status: 429 }),
      "one owner at most 100 new clients an hour (HTTP 429)",
    ],
  ] as const) {
    test.provider(`a refusal for ${name} says why and keeps the values`, (stack) =>
      Effect.gen(function* () {
        const { deployMain, deployment, hub } = world(stack);
        yield* deployMain;
        hub.registrar = answer;
        const { convex, variables, writes } = cli(LOCAL_SITE, new Map(OFF_VARIABLES));
        const line = yield* run({ cwd: selecting(deployment), convex });
        expect(line).toContain("The hub client keeps its values: ");
        expect(line).toContain(text);
        expect(writes).toEqual([]);
        expect(variables).toEqual(OFF_VARIABLES);
      }),
    );
  }

  test.provider("the app of another stack is refused for app_mismatch", (stack) =>
    Effect.gen(function* () {
      const { deployMain, deployment } = world(stack);
      yield* deployMain;
      const { convex, writes } = cli(LOCAL_SITE);
      expect(yield* run({ cwd: selecting(deployment), convex, app: "other" })).toContain(
        "belongs to another app",
      );
      expect(writes).toEqual([]);
    }),
  );

  test.provider("no line and no argument of the Convex CLI holds a secret or a token", (stack) =>
    Effect.gen(function* () {
      const { deployMain, deployment, hub } = world(stack);
      yield* deployMain;
      const cwd = selecting(deployment);
      const { calls, convex } = cli(CLOUD_SITE);
      /** An answer that repeats what the request sent. */
      const echo = ({ authorization }: Sent) =>
        Response.json({ error: authorization, reason: authorization }, { status: 403 });
      const lines = [yield* run({ cwd, convex }), yield* run({ cwd, convex })];
      hub.record = () => new Response('{"redirect_uris":"iat-of-cl_1"}', { status: 200 });
      lines.push(yield* run({ cwd, convex }));
      hub.record = undefined;
      hub.clients.clear();
      hub.registrar = echo;
      lines.push(yield* run({ cwd, convex }));
      // The recorded answer without its client ID, with a secret in it.
      const { client_id: _clientId, ...withoutClient } = PRODUCTION_ANSWER;
      hub.registrar = () =>
        Response.json({ ...withoutClient, client_secret: "secret-of-cl_1" }, { status: 201 });
      lines.push(yield* run({ cwd, convex }));
      hub.registrar = () => {
        throw new TypeError("fetch failed: Bearer iat-of-cl_1");
      };
      lines.push(yield* run({ cwd, convex }));

      expect(lines).toHaveLength(6);
      for (const secret of ["iat-of-cl_1", "secret-of-cl_2", "token-of-cl_2", "Bearer"]) {
        expect([...lines, ...calls].filter((text) => text.includes(secret))).toEqual([]);
      }
    }),
  );

  for (const [name, variable, value] of [
    ["another issuer", "HUB_ISSUER", "https://other.test"],
    ["the off issuer", "HUB_ISSUER", "http://127.0.0.1:1"],
    ["the no-hub secret", "HUB_CLIENT_SECRET", "no-hub"],
    ["an empty secret", "HUB_CLIENT_SECRET", ""],
  ] as const) {
    test.provider(`a client with ${name} is not renewed and gets a new client`, (stack) =>
      Effect.gen(function* () {
        const { deployMain, deployment, hub } = world(stack);
        yield* deployMain;
        hub.clients.set("cl_9", {
          token: "token-of-cl_9",
          redirectUri: `${LOCAL_SITE}${CALLBACK_PATH}`,
        });
        const { convex, writes } = cli(LOCAL_SITE, variablesOf("cl_9").set(variable, value));
        expect(yield* run({ cwd: selecting(deployment), convex })).toContain(
          "Hub client registered",
        );
        expect(hub.sent.map(({ method, url }) => `${method} ${url}`)).toEqual([
          `POST ${ISSUER}/hub-clients`,
        ]);
        expect(writes).toEqual([writeOf("cl_2")]);
      }),
    );
  }

  test.provider("a client with a second return address gets a new client", (stack) =>
    Effect.gen(function* () {
      const { deployMain, deployment, hub } = world(stack);
      yield* deployMain;
      hub.record = () =>
        Response.json({
          client_id: "cl_9",
          redirect_uris: [`${LOCAL_SITE}${CALLBACK_PATH}`, "http://127.0.0.1:3212/x"],
        });
      const { convex, writes } = cli(LOCAL_SITE, variablesOf("cl_9"));
      expect(yield* run({ cwd: selecting(deployment), convex })).toContain("Hub client registered");
      expect(writes).toEqual([writeOf("cl_2")]);
    }),
  );

  /** A secret that a failure of a service quotes. */
  const MARKER = "SECRET-MARKER-7f3a";

  test.provider("a Convex CLI error that quotes a secret prints a fixed text", (stack) =>
    Effect.gen(function* () {
      const { deployment } = world(stack);
      const exit = yield* Effect.exit(
        run({
          cwd: selecting(deployment),
          convex: () => {
            throw new Error(`Command failed: convex env get HUB_CLIENT_SECRET ${MARKER}`);
          },
        }),
      );
      expect(exit).toEqual(
        Exit.succeed("The hub client keeps its values: `convex run --inline-query` failed."),
      );
    }),
  );

  test.provider("a Management API error that quotes a secret prints a fixed text", (stack) =>
    Effect.gen(function* () {
      const { convex: fake, deployment } = world(stack);
      fake.scripted.set(`GET api.convex.dev/v1/deployments/${deployment}`, [
        { status: 500, body: { ...recorded("project_not_found.json"), message: MARKER } },
      ]);
      const { convex } = cli(LOCAL_SITE);
      const exit = yield* Effect.exit(run({ cwd: selecting(deployment), convex }));
      expect(exit).toEqual(
        Exit.succeed(
          "The hub client keeps its values: the Convex API could not read the selected development deployment.",
        ),
      );
    }),
  );

  for (const [name, script] of [
    [
      "a function error of the store",
      (fake: FakeConvex, store: string) =>
        fake.scripted.set(`POST ${store}.convex.cloud/api/function`, [
          {
            status: 200,
            body: { ...stateFixture("function_version_missing.json"), errorMessage: MARKER },
          },
        ]),
    ],
    [
      "a Management API error of the store lookup",
      (fake: FakeConvex) =>
        fake.scripted.set(`GET api.convex.dev/v1/teams/${TEAM}/projects`, [
          { status: 500, body: { ...recorded("project_not_found.json"), message: MARKER } },
        ]),
    ],
  ] as const) {
    test.provider(`${name} that quotes a secret prints a fixed text`, (stack) =>
      Effect.gen(function* () {
        const { convex: fake, deployMain, deployment, store } = world(stack);
        yield* deployMain;
        script(fake, store);
        const { convex, writes } = cli(LOCAL_SITE);
        const exit = yield* Effect.exit(run({ cwd: selecting(deployment), convex }));
        expect(exit).toEqual(
          Exit.succeed(
            "The hub client keeps its values: the state store of the team could not be read.",
          ),
        );
        expect(writes).toEqual([]);
      }),
    );
  }
});

describe("alchemy-convex hub-client --shared, as a process", () => {
  const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
  /** The fixture app resolves the installed convex package of this package. */
  const app = fileURLToPath(new URL("./fixtures/convex-app/", import.meta.url));
  const spawn = (args: readonly string[]) =>
    spawnSync(process.execPath, [cliPath, ...args], {
      cwd: app,
      encoding: "utf8",
      env: { ...process.env, CONVEX_TEAM_ID: "", HUB_URL: ISSUER },
    });

  it("exits 1 with the usage for a missing --stack", () => {
    const result = spawn(["hub-client", "--shared", "--app", "scout", "--callback-path", "/x"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("hub-client --shared --stack <owner/name>");
  });

  it("exits 0 with one line when it finds no team", () => {
    const result = spawn([
      "hub-client",
      "--shared",
      "--stack",
      STACK,
      "--app",
      "scout",
      "--callback-path",
      CALLBACK_PATH,
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "No Convex team for Google sign-in on this laptop: set CONVEX_TEAM_ID, or select a cloud development deployment.\n",
    );
  });
});
