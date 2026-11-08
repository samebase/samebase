// Convex.SharedHubClient against a fake GitHub and identity hub behind a stubbed fetch. The hub
// answers `/hub-clients` as packages/identity-broker/src/client/hubClients.ts does, and a client's own record as
// `registrationEndpoints` of @samebase/identity-broker does.
import { adopt } from "alchemy/AdoptPolicy";
import * as Output from "alchemy/Output";
import { encodeState, type PersistedState, reviveState, State } from "alchemy/State";
import type { ScratchStack } from "@alchemy.run/test/Core";
import * as Test from "@alchemy.run/test/Vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Logger from "effect/Logger";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Convex from "../src/index.ts";
import { FakeConvex, hubFixture } from "./fakeConvex.ts";

const TEAM = 38516;
const ISSUER = "https://hub.test";
const DEPLOYMENT = "happy-otter-123";
const REDIRECT_URI = `https://${DEPLOYMENT}.convex.site/auth/hub/callback`;
/** Another host and another path, as a Worker on Convex Auth 0 has. */
const OTHER_REDIRECT_URI = "https://scout.example.workers.dev/api/auth/callback/hub";
const OIDC_REQUEST_URL = "https://oidc.test/token?api-version=2.0";
const OIDC_REQUEST_TOKEN = "oidc-request-token";
const OIDC_TOKEN = "oidc-token";
/** Where a run asks for a new client without `hub`. */
const HUB_CLIENTS = "https://auth.samebase.com/hub-clients";
/** The 201 answers of `POST /hub-clients`, recorded from the hub of RFC 133. */
const PRODUCTION_ANSWER = hubFixture("hub-clients-production.json");
const PREVIEW_ANSWER = hubFixture("hub-clients-preview.json");
const DEVELOPMENT_ANSWER = hubFixture("hub-clients-development.json");
const TERMS = String(PREVIEW_ANSWER["terms"]);
/** The numeric GitHub id of the repository, which the hub gives with the token. */
const REPOSITORY_ID = String(PRODUCTION_ANSWER["repository"]);

const { test } = Test.make({
  providers: Convex.providers(Convex.fromValues({ accessToken: Redacted.make("test-token") })),
});

/** The props of a client that asks with the GitHub OIDC token. */
type GitHubProps = Extract<
  Convex.SharedHubClientProps,
  { readonly deploymentType: "production" | "preview" }
>;
type DevelopmentProps = Extract<
  Convex.SharedHubClientProps,
  { readonly deploymentType: "development" }
>;

const props = (overrides: Partial<GitHubProps> = {}): GitHubProps => ({
  app: "scout",
  redirectUri: REDIRECT_URI,
  deploymentType: "preview",
  connectors: ["google"],
  softwareVersion: "abc",
  ...overrides,
});

/** The app's initial access token that the fake hub knows. */
const INITIAL_ACCESS_TOKEN = "iat-of-scout";

const development = (overrides: Partial<DevelopmentProps> = {}): DevelopmentProps => ({
  app: "scout",
  redirectUri: REDIRECT_URI,
  deploymentType: "development",
  connectors: ["google"],
  initialAccessToken: Redacted.make(INITIAL_ACCESS_TOKEN),
  softwareVersion: "abc",
  ...overrides,
});

/** The body of a registration, as the fake and the tests expect it. */
const requestBody = (overrides: Record<string, unknown> = {}) => ({
  app: "scout",
  redirectUri: REDIRECT_URI,
  softwareVersion: "abc",
  connectors: ["google"],
  ...overrides,
});

const client = (input: Convex.SharedHubClientProps) =>
  Effect.gen(function* () {
    const resource = yield* Convex.SharedHubClient("Client", input);
    return {
      status: resource.status,
      issuer: resource.issuer,
      clientId: resource.clientId,
      clientSecret: Output.map(resource.clientSecret, Redacted.value),
      registrationAccessToken: Output.map(resource.registrationAccessToken, Redacted.value),
      registrationClientUri: resource.registrationClientUri,
      deploymentType: resource.deploymentType,
      redirectUri: resource.redirectUri,
      connectors: resource.connectors,
      initialAccessToken: Output.map(resource.initialAccessToken, Redacted.value),
      repository: resource.repository,
    };
  });

/** The outputs of the client `clientId` on `redirectUri`. */
const issued = (clientId = "cl_1", redirectUri = REDIRECT_URI, deploymentType = "preview") => ({
  status: "on",
  issuer: ISSUER,
  clientId,
  clientSecret: `secret-of-${clientId}`,
  registrationAccessToken: `token-of-${clientId}`,
  registrationClientUri: `${ISSUER}/register/${clientId}`,
  deploymentType,
  redirectUri,
  connectors: ["google"],
  initialAccessToken: "",
  repository: "",
});

const OFF = {
  status: "off",
  issuer: "http://127.0.0.1:1",
  clientId: "no-hub",
  clientSecret: "no-hub",
  registrationAccessToken: "",
  registrationClientUri: "",
  deploymentType: "preview",
  redirectUri: "",
  connectors: [],
  initialAccessToken: "",
  repository: "",
};

/** The body of POST /hub-clients. */
const ClientRequest = Schema.Struct({
  redirectUri: Schema.String,
  connectors: Schema.Array(Schema.String),
});

/** One request that reached the fake. */
interface Sent {
  readonly method: string;
  readonly url: string;
  readonly authorization: string;
  readonly body: unknown;
}

/** An answer in place of the normal one. A thrown error is a network failure. */
type Answer = (request: Sent) => Response;

/** A failure whose text holds what the request sent, to show that no log line quotes it. */
const networkDown: Answer = ({ authorization }) => {
  throw new TypeError(`fetch failed: ${authorization}`);
};

/** The answers of POST /hub-clients that give no client. */
const REFUSALS: readonly (readonly [string, Answer])[] = [
  ["invalid_request", () => Response.json({ error: "invalid_request" }, { status: 400 })],
  ["a refused token", () => Response.json({ error: "invalid_token" }, { status: 401 })],
  ["not_allowed", () => Response.json({ error: "not_allowed" }, { status: 403 })],
  ["a missing endpoint", () => new Response("Not Found", { status: 404 })],
  [
    "rate_limited",
    () => Response.json({ error: "rate_limited", window: "repository" }, { status: 429 }),
  ],
  ["github_unavailable", () => Response.json({ error: "github_unavailable" }, { status: 502 })],
  ["a network error", networkDown],
  [
    "a 201 without a client secret",
    () => {
      const { client_secret: _secret, ...answer } = PREVIEW_ANSWER;
      return Response.json(answer, { status: 201 });
    },
  ],
  // The log line names the terms and the return address, so neither may be a value that the
  // answer chose.
  [
    "a 201 whose terms are not a page of samebase.com",
    ({ authorization }) =>
      Response.json(
        { ...PREVIEW_ANSWER, terms: `https://evil.example/${authorization}` },
        { status: 201 },
      ),
  ],
  [
    "a 201 whose terms are another page of samebase.com",
    ({ authorization }) =>
      Response.json(
        {
          ...PREVIEW_ANSWER,
          terms: `https://samebase.com/${Buffer.from(authorization).toString("hex")}`,
        },
        { status: 201 },
      ),
  ],
  [
    "a 201 with another return address",
    ({ authorization }) =>
      Response.json(
        { ...PREVIEW_ANSWER, redirect_uri: `https://evil.example/${authorization}` },
        { status: 201 },
      ),
  ],
  [
    "a 201 with other connectors",
    ({ body }) =>
      Response.json(
        {
          ...PREVIEW_ANSWER,
          redirect_uri: Schema.decodeUnknownSync(ClientRequest)(body).redirectUri,
          connectors: ["google", "github"],
        },
        { status: 201 },
      ),
  ],
  [
    "a 201 without connectors",
    ({ body }) => {
      const { connectors: _connectors, ...answer } = PREVIEW_ANSWER;
      return Response.json(
        { ...answer, redirect_uri: Schema.decodeUnknownSync(ClientRequest)(body).redirectUri },
        { status: 201 },
      );
    },
  ],
];

class FakeServices {
  /** Every request to GitHub or the hub, in order. */
  readonly sent: Sent[] = [];
  /** The clients on the hub, with the token of each. */
  readonly clients = new Map<string, string>();
  /** Set: the answers of the service in place of the normal ones. */
  github: Answer | undefined;
  /** `POST /hub-clients`. */
  registrar: Answer | undefined;
  /** A client's own record at the hub. */
  hub: Answer | undefined;
  /** Set: the hub answers as to a run of main, with the app's initial access token. */
  production = false;
  /** The initial access tokens that the hub takes for a development client. */
  readonly initialAccessTokens = new Set([INITIAL_ACCESS_TOKEN]);
  /** The connectors the hub's policy allows this app. */
  allowedConnectors = ["github", "google"];
  /** Every request in order, also those to Convex, as "METHOD URL". */
  readonly timeline: string[] = [];
  private nextClient = 1;

  constructor(private readonly rest?: typeof fetch) {}

  install() {
    vi.stubGlobal("fetch", this.fetch);
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", OIDC_REQUEST_URL);
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", OIDC_REQUEST_TOKEN);
    return this;
  }

  /** The requests whose URL starts with `prefix`, as "METHOD URL". */
  calls(prefix: string) {
    return this.sent
      .filter(({ url }) => url.startsWith(prefix))
      .map(({ method, url }) => `${method} ${url}`);
  }

  private answerOf(url: string) {
    if (url.startsWith("https://oidc.test")) return this.github ?? this.answerGitHub;
    if (new URL(url).pathname === "/hub-clients") return this.registrar ?? this.answerRegistrar;
    return url.startsWith(ISSUER) ? (this.hub ?? this.answerHub) : undefined;
  }

  private readonly fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    this.timeline.push(`${request.method} ${request.url}`);
    const answer = this.answerOf(request.url);
    if (answer === undefined) {
      if (this.rest === undefined) throw new Error(`unexpected request to ${request.url}`);
      return this.rest(request);
    }
    const text = await request.text();
    const sent: Sent = {
      method: request.method,
      url: request.url,
      authorization: request.headers.get("Authorization") ?? "",
      body: text === "" ? undefined : JSON.parse(text),
    };
    this.sent.push(sent);
    return answer(sent);
  };

  private readonly answerGitHub: Answer = () => Response.json({ count: 1, value: OIDC_TOKEN });

  /** A GitHub token gives a production or preview client, an initial access token a development one. */
  private readonly answerRegistrar: Answer = ({ authorization, body }) => {
    const bearer = authorization.replace(/^Bearer /, "");
    const withGitHub = bearer === OIDC_TOKEN;
    if (!withGitHub && !this.initialAccessTokens.has(bearer)) {
      return Response.json({ error: "invalid_token" }, { status: 401 });
    }
    const { redirectUri, connectors } = Schema.decodeUnknownSync(ClientRequest)(body);
    // The hub's policy allows these; another name is refused with the allowed ones, as the hub does.
    if (!connectors.every((name) => this.allowedConnectors.includes(name))) {
      return Response.json(
        { error: "invalid_connectors", allowed: this.allowedConnectors },
        { status: 400 },
      );
    }
    const clientId = `cl_${this.nextClient++}`;
    const token = `token-of-${clientId}`;
    this.clients.set(clientId, token);
    const production = withGitHub && this.production;
    if (production) this.initialAccessTokens.add(`iat-of-${clientId}`);
    return Response.json(
      {
        ...(withGitHub ? (production ? PRODUCTION_ANSWER : PREVIEW_ANSWER) : DEVELOPMENT_ANSWER),
        issuer: ISSUER,
        client_id: clientId,
        client_secret: `secret-of-${clientId}`,
        registration_access_token: token,
        registration_client_uri: `${ISSUER}/register/${clientId}`,
        redirect_uri: redirectUri,
        connectors,
        ...(production ? { initial_access_token: `iat-of-${clientId}` } : {}),
      },
      { status: 201 },
    );
  };

  private readonly answerHub: Answer = ({ authorization, method, url }) => {
    const clientId = url.split("/").at(-1) ?? "";
    if (authorization !== `Bearer ${this.clients.get(clientId)}`) {
      return Response.json({ error: "invalid_token" }, { status: 401 });
    }
    if (method === "DELETE") {
      this.clients.delete(clientId);
      return new Response(null, { status: 204 });
    }
    return Response.json({ client_id: clientId });
  };
}

/** Keeps each log line of what runs with `layer`, as "Level: text". */
const capturedLogs = () => {
  const lines: string[] = [];
  const logger = Logger.make(({ logLevel, message }) => {
    lines.push(`${logLevel}: ${String(message)}`);
  });
  return { lines, layer: Logger.layer([logger]) };
};

const warningsIn = (lines: readonly string[]) => lines.filter((line) => line.startsWith("Warn:"));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Convex.SharedHubClient", () => {
  test.provider("the first deploy gets a client with the OIDC token of the run", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      expect(yield* stack.deploy(client(props()))).toEqual(issued());
      expect(fake.sent).toEqual([
        {
          method: "GET",
          url: `${OIDC_REQUEST_URL}&audience=samebase`,
          authorization: `Bearer ${OIDC_REQUEST_TOKEN}`,
          body: undefined,
        },
        {
          method: "POST",
          url: HUB_CLIENTS,
          authorization: `Bearer ${OIDC_TOKEN}`,
          body: requestBody(),
        },
      ]);
    }),
  );

  test.provider("the request sends the connectors as a set, sorted, each once", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      const made = yield* stack.deploy(
        client(props({ connectors: ["google", "github", "google"] })),
      );
      expect(made.connectors).toEqual(["github", "google"]);
      expect(fake.sent.at(-1)?.body).toEqual(requestBody({ connectors: ["github", "google"] }));
    }),
  );

  test.provider("another connector set asks for a new client without a renewal", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      fake.sent.length = 0;
      const changed = yield* stack.deploy(client(props({ connectors: ["google", "github"] })));
      expect(changed).toEqual({ ...issued("cl_2"), connectors: ["github", "google"] });
      expect(fake.calls(ISSUER)).toEqual([]);
      // The same set in another order, with a name twice, renews that client.
      fake.sent.length = 0;
      expect(
        yield* stack.deploy(client(props({ connectors: ["github", "google", "github"] }))),
      ).toEqual(changed);
      expect(fake.calls(ISSUER)).toEqual([`GET ${ISSUER}/register/cl_2`]);
      expect(fake.calls(HUB_CLIENTS)).toEqual([]);
    }),
  );

  for (const [name, connectors] of [
    ["no connector", []],
    ["a name with a capital letter", ["Google"]],
    ["a name with a space", ["google apps"]],
    ["a name of 65 characters", ["a".repeat(65)]],
  ] satisfies readonly (readonly [string, string[]])[]) {
    test.provider(`${name} fails the run before any request`, (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        const exit = yield* Effect.exit(stack.deploy(client(props({ connectors }))));
        expect(Exit.isFailure(exit)).toBe(true);
        expect(String(exit)).toContain("needs connectors: one or more names of [a-z0-9-]{1,64}");
        expect(fake.sent).toEqual([]);
      }),
    );
  }

  test.provider("invalid_connectors gives the off values and names the allowed ones", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      fake.allowedConnectors = ["google"];
      const { layer, lines } = capturedLogs();
      const off = yield* stack
        .deploy(client(props({ connectors: ["google", "github"] })))
        .pipe(Effect.provide(layer));
      expect(off).toEqual(OFF);
      expect(warningsIn(lines)).toEqual([
        expect.stringContaining(
          "does not offer or allow one of the connectors; it allows google (HTTP 400)",
        ),
      ]);
    }),
  );

  test.provider("invalid_connectors prints only names of the connector grammar", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      fake.registrar = ({ authorization }) =>
        Response.json(
          { error: "invalid_connectors", allowed: [authorization, "Google", "evil example"] },
          { status: 400 },
        );
      const { layer, lines } = capturedLogs();
      yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
      expect(warningsIn(lines)).toEqual([
        expect.stringContaining("it allows none for this app (HTTP 400)"),
      ]);
      expect(lines.filter((line) => /Google|evil|Bearer/.test(line))).toEqual([]);
    }),
  );

  test.provider("another hub gets the request, with a GitHub token for its own audience", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props({ hub: { issuer: ISSUER, terms: TERMS } })));
      expect(fake.calls(OIDC_REQUEST_URL)).toEqual([
        `GET ${OIDC_REQUEST_URL}&audience=${encodeURIComponent(ISSUER)}`,
      ]);
      expect(fake.calls(ISSUER)).toEqual([`POST ${ISSUER}/hub-clients`]);
      expect(fake.calls(HUB_CLIENTS)).toEqual([]);
    }),
  );

  test.provider("a changed hub asks the new hub for a client, without a renewal", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      fake.sent.length = 0;
      yield* stack.deploy(client(props({ hub: { issuer: ISSUER, terms: TERMS } })));
      expect(fake.calls(ISSUER)).toEqual([`POST ${ISSUER}/hub-clients`]);
    }),
  );

  test.provider("an answer with other terms than the hub's gives no client", (stack) =>
    Effect.gen(function* () {
      new FakeServices().install();
      const hub = { issuer: ISSUER, terms: "https://hub.test/terms" };
      expect(yield* stack.deploy(client(props({ hub })))).toMatchObject({ status: "off" });
    }),
  );

  test.provider("a new client logs the terms once, and a renewal does not", (stack) =>
    Effect.gen(function* () {
      new FakeServices().install();
      const { layer, lines } = capturedLogs();
      yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
      yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
      expect(lines.filter((line) => line.includes(TERMS))).toEqual([
        `Info: Convex.SharedHubClient: scout on ${REDIRECT_URI} has a new client of the identity hub. Its use is under ${TERMS}.`,
      ]);
    }),
  );

  test.provider(
    "a later deploy renews the client with its own token and keeps the values",
    (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        const first = yield* stack.deploy(client(props()));
        fake.sent.length = 0;
        const again = yield* stack.deploy(client(props({ softwareVersion: "def" })));
        expect(again).toEqual(first);
        expect(fake.sent).toEqual([
          {
            method: "GET",
            url: `${ISSUER}/register/cl_1`,
            authorization: "Bearer token-of-cl_1",
            body: undefined,
          },
        ]);
      }),
  );

  test.provider(
    "a production registration saves the initial access token and the repository id",
    (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        fake.production = true;
        const production = props({ deploymentType: "production" });
        const saved = {
          ...issued(),
          deploymentType: "production",
          initialAccessToken: "iat-of-cl_1",
          repository: REPOSITORY_ID,
        };
        expect(yield* stack.deploy(client(production))).toEqual(saved);
        // The renewal answer has no token, and the deploy keeps the saved one.
        expect(yield* stack.deploy(client(production))).toEqual(saved);
        expect(fake.calls(HUB_CLIENTS)).toHaveLength(1);
      }),
  );

  test.provider("a client saved by an older version gives way to a new client", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      fake.production = true;
      const production = props({ deploymentType: "production" });
      yield* stack.deploy(client(production));
      // The row as 0.32 saved it: no connectors.
      yield* Effect.gen(function* () {
        const state = yield* yield* State;
        const request = { stack: stack.name, stage: stack.stage, fqn: "Client" };
        const row = yield* state.get(request);
        if (row === undefined || !("attr" in row) || row.attr === undefined) {
          throw new Error("the deploy saved no client");
        }
        const { connectors: _connectors, ...attr } = row.attr;
        yield* state.set({ ...request, value: { ...row, attr } });
      }).pipe(Effect.provide(stack.state));
      const { layer, lines } = capturedLogs();
      expect(yield* stack.deploy(client(production)).pipe(Effect.provide(layer))).toEqual({
        ...issued("cl_2"),
        deploymentType: "production",
        initialAccessToken: "iat-of-cl_2",
        repository: REPOSITORY_ID,
      });
      expect(fake.calls(HUB_CLIENTS)).toHaveLength(2);
      expect(warningsIn(lines)).toEqual([
        expect.stringContaining("cannot be read by this version"),
      ]);
      expect(lines.join("\n")).not.toContain("secret-of");
      // The new client is saved in this version's shape, so the next deploy renews it.
      expect(yield* stack.deploy(client(production))).toEqual({
        ...issued("cl_2"),
        deploymentType: "production",
        initialAccessToken: "iat-of-cl_2",
        repository: REPOSITORY_ID,
      });
      expect(fake.calls(HUB_CLIENTS)).toHaveLength(2);
    }),
  );

  test.provider("a saved row with a field of another shape gives way to a new client", (stack) =>
    Effect.gen(function* () {
      new FakeServices().install();
      yield* stack.deploy(client(props()));
      // Current data with one field that is not a string: a schema issue, not a defect.
      yield* Effect.gen(function* () {
        const state = yield* yield* State;
        const request = { stack: stack.name, stage: stack.stage, fqn: "Client" };
        const row = yield* state.get(request);
        if (row === undefined || !("attr" in row) || row.attr === undefined) {
          throw new Error("the deploy saved no client");
        }
        yield* state.set({ ...request, value: { ...row, attr: { ...row.attr, redirectUri: 7 } } });
      }).pipe(Effect.provide(stack.state));
      const { layer, lines } = capturedLogs();
      expect(yield* stack.deploy(client(props())).pipe(Effect.provide(layer))).toEqual(
        issued("cl_2"),
      );
      expect(warningsIn(lines)).toEqual([
        expect.stringContaining("cannot be read by this version"),
      ]);
      expect(lines.join("\n")).not.toContain("secret-of");
    }),
  );

  test.provider("a renewal needs no OIDC token", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      const first = yield* stack.deploy(client(props()));
      vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", "");
      expect(yield* stack.deploy(client(props()))).toEqual(first);
      expect(fake.calls(ISSUER)).toHaveLength(1);
    }),
  );

  test.provider("401 on a renewal asks for a new client", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      fake.clients.delete("cl_1");
      expect(yield* stack.deploy(client(props()))).toEqual(issued("cl_2"));
    }),
  );

  test.provider("a development answer's token fields are dropped", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      fake.registrar = ({ body }) =>
        Response.json(
          {
            ...DEVELOPMENT_ANSWER,
            issuer: ISSUER,
            redirect_uri: Schema.decodeUnknownSync(ClientRequest)(body).redirectUri,
            initial_access_token: "not-for-a-development-client",
            repository: "1",
          },
          { status: 201 },
        );
      const { layer, lines } = capturedLogs();
      const made = yield* stack.deploy(client(development())).pipe(Effect.provide(layer));
      expect(made.initialAccessToken).toBe("");
      expect(made.repository).toBe("");
      expect(lines.join("\n")).not.toContain("not-for-a-development-client");
    }),
  );

  test.provider(
    "403 on a renewal keeps the values, reports suspended, and asks for nothing",
    (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        yield* stack.deploy(client(props()));
        fake.hub = () => Response.json({ error: "access_denied" }, { status: 403 });
        fake.sent.length = 0;
        const { layer, lines } = capturedLogs();
        const suspended = yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
        expect(suspended).toEqual({ ...issued(), status: "suspended" });
        expect(fake.calls(HUB_CLIENTS)).toEqual([]);
        expect(warningsIn(lines)).toHaveLength(1);

        // The hub lifts the suspension, and the same client serves again.
        fake.hub = undefined;
        expect(yield* stack.deploy(client(props()))).toEqual(issued());
        expect(fake.calls(HUB_CLIENTS)).toEqual([]);
      }),
  );

  for (const [name, answer] of [
    ["a 500", () => new Response("no", { status: 500 })],
    ["a 503", () => new Response("no", { status: 503 })],
    ["a 404", () => new Response("no", { status: 404 })],
    ["a network error", networkDown],
  ] satisfies readonly (readonly [string, Answer])[]) {
    test.provider(`${name} on a renewal keeps the values and warns`, (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        const first = yield* stack.deploy(client(props()));
        fake.hub = answer;
        fake.sent.length = 0;
        const { layer, lines } = capturedLogs();
        const again = yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
        expect(again).toEqual(first);
        expect(fake.calls(HUB_CLIENTS)).toEqual([]);
        expect(warningsIn(lines)).toEqual([
          expect.stringContaining(`${REDIRECT_URI} keeps the saved client`),
        ]);
      }),
    );
  }

  test.provider(
    "a required client fails the run on a refusal, in place of the off values",
    (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        fake.registrar = () =>
          Response.json({ error: "not_allowed", reason: "blocked" }, { status: 403 });
        const exit = yield* Effect.exit(stack.deploy(client(props({ required: true }))));
        expect(Exit.isFailure(exit)).toBe(true);
        expect(String(exit)).toContain("is required and has no working client (off)");
      }),
  );

  test.provider(
    "a required client fails the run when suspended, and when the hub then does not answer",
    (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        expect(yield* stack.deploy(client(props({ required: true })))).toEqual(issued());
        fake.hub = () => new Response(null, { status: 403 });
        const suspended = yield* Effect.exit(stack.deploy(client(props({ required: true }))));
        expect(String(suspended)).toContain("is required and has no working client (suspended)");
        // The failed run saved nothing, so the state still says `on`: a run that the hub does not
        // answer must not pass with it.
        fake.hub = () => new Response(null, { status: 500 });
        const outage = yield* Effect.exit(stack.deploy(client(props({ required: true }))));
        expect(String(outage)).toContain("is required, and the hub did not confirm its client");
        fake.hub = undefined;
        expect(yield* stack.deploy(client(props({ required: true })))).toEqual(issued());
      }),
  );

  test.provider("a 5xx keeps the saved status of a suspended client", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      fake.hub = () => new Response(null, { status: 403 });
      yield* stack.deploy(client(props()));
      fake.hub = () => new Response(null, { status: 500 });
      const again = yield* stack.deploy(client(props()));
      expect(again).toEqual({ ...issued(), status: "suspended" });
    }),
  );

  test.provider("another return address asks for a new client without a renewal", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      fake.sent.length = 0;
      const moved = yield* stack.deploy(client(props({ redirectUri: OTHER_REDIRECT_URI })));
      expect(moved).toEqual(issued("cl_2", OTHER_REDIRECT_URI));
      expect(fake.calls(ISSUER)).toEqual([]);
    }),
  );

  for (const [reason, text] of [
    ["verification_file_missing", "does not serve /samebase-verification.json"],
    ["repository_mismatch", "names another repository"],
    ["blocked", "Samebase blocked this repository or its owner"],
    ["paused", "this app is paused on the identity hub"],
  ] as const) {
    test.provider(`a 403 for ${reason} says why in the log`, (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        fake.registrar = () => Response.json({ error: "not_allowed", reason }, { status: 403 });
        const { layer, lines } = capturedLogs();
        yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
        expect(warningsIn(lines)).toEqual([expect.stringContaining(`${text} (HTTP 403)`)]);
      }),
    );
  }

  for (const [window, text] of [
    ["repository", "one repository at most 30 new clients an hour"],
    ["owner", "one owner at most 100 new clients an hour"],
    ["new_owners", "at most 50 new owners an hour"],
  ] as const) {
    test.provider(`a 429 for the window ${window} says which in the log`, (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        fake.registrar = () => Response.json({ error: "rate_limited", window }, { status: 429 });
        const { layer, lines } = capturedLogs();
        yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
        expect(warningsIn(lines)).toEqual([expect.stringContaining(`${text} (HTTP 429)`)]);
      }),
    );
  }

  test.provider("a 403 with an unknown reason logs no text of the answer", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      fake.registrar = () =>
        Response.json({ error: "not_allowed", reason: "toString" }, { status: 403 });
      const { layer, lines } = capturedLogs();
      yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
      expect(warningsIn(lines)).toEqual([
        expect.stringContaining("does not allow this repository or return address (HTTP 403)"),
      ]);
      expect(lines.filter((line) => line.includes("toString"))).toEqual([]);
    }),
  );

  test.provider("a deploy with the off values asks again", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      fake.registrar = () => new Response("Not Found", { status: 404 });
      expect(yield* stack.deploy(client(props()))).toEqual(OFF);
      fake.registrar = undefined;
      fake.sent.length = 0;
      expect(yield* stack.deploy(client(props()))).toEqual(issued());
      expect(fake.calls(ISSUER)).toEqual([]);
    }),
  );

  for (const [name, answer] of REFUSALS) {
    test.provider(`${name} on a request for a gone client gives the off values`, (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        yield* stack.deploy(client(props()));
        fake.clients.delete("cl_1");
        fake.registrar = answer;
        const { layer, lines } = capturedLogs();
        const again = yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
        expect(again).toEqual(OFF);
        expect(warningsIn(lines)).toEqual([expect.stringContaining("deploys without the hub")]);

        // The next deploy asks again.
        fake.registrar = undefined;
        expect(yield* stack.deploy(client(props()))).toEqual(issued("cl_2"));
      }),
    );

    test.provider(`${name} on the first request gives the off values`, (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        fake.registrar = answer;
        const { layer, lines } = capturedLogs();
        const off = yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
        expect(off).toEqual(OFF);
        expect(warningsIn(lines)).toEqual([expect.stringContaining("deploys without the hub")]);
      }),
    );
  }

  test.provider(
    "a failed request for another return address gives the off values, and asks again",
    (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        yield* stack.deploy(client(props()));
        fake.registrar = () => Response.json({ error: "github_unavailable" }, { status: 502 });
        const moved = yield* stack.deploy(client(props({ redirectUri: OTHER_REDIRECT_URI })));
        expect(moved).toEqual(OFF);
        fake.registrar = undefined;
        const next = yield* stack.deploy(client(props({ redirectUri: OTHER_REDIRECT_URI })));
        expect(next).toEqual(issued("cl_2", OTHER_REDIRECT_URI));
      }),
  );

  for (const [name, answer] of [
    ["a refused request", () => new Response(null, { status: 403 })],
    ["an answer without a token", () => Response.json({ count: 0 })],
    ["a network error", networkDown],
  ] satisfies readonly (readonly [string, Answer])[]) {
    test.provider(`${name} from GitHub gives the off values and asks the hub nothing`, (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        fake.github = answer;
        const { layer, lines } = capturedLogs();
        expect(yield* stack.deploy(client(props())).pipe(Effect.provide(layer))).toEqual(OFF);
        expect(fake.calls(HUB_CLIENTS)).toEqual([]);
        expect(warningsIn(lines)).toHaveLength(1);
      }),
    );
  }

  test.provider("a workflow without the permission gives the off values and a warning", (stack) =>
    Effect.gen(function* () {
      new FakeServices().install();
      vi.stubEnv("GITHUB_ACTIONS", "true");
      vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", "");
      vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "");
      const { layer, lines } = capturedLogs();
      expect(yield* stack.deploy(client(props())).pipe(Effect.provide(layer))).toEqual(OFF);
      expect(warningsIn(lines)).toEqual([expect.stringContaining("id-token: write")]);
    }),
  );

  test.provider("a run without OIDC variables gives the off values without a warning", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      vi.stubEnv("GITHUB_ACTIONS", "");
      vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", "");
      vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "");
      const { layer, lines } = capturedLogs();
      expect(yield* stack.deploy(client(props())).pipe(Effect.provide(layer))).toEqual(OFF);
      expect(fake.sent).toEqual([]);
      expect(warningsIn(lines)).toEqual([]);
      expect(lines).toContainEqual(expect.stringContaining("no GitHub OIDC token"));
    }),
  );

  test.provider(
    "a run without OIDC variables gives the off values for a client that is gone",
    (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        yield* stack.deploy(client(props()));
        fake.clients.delete("cl_1");
        vi.stubEnv("GITHUB_ACTIONS", "");
        vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "");
        const { layer, lines } = capturedLogs();
        expect(yield* stack.deploy(client(props())).pipe(Effect.provide(layer))).toEqual(OFF);
        expect(warningsIn(lines)).toEqual([]);
      }),
  );

  test.provider(
    "the push reads the values that the run ended with, and only when they change",
    (stack) =>
      Effect.gen(function* () {
        // The order of the template: the site is live before the hub reads its file, so the
        // client takes the URL of the row that pushes, which is unresolved in the plan of the first
        // deploy, and a second row with no source writes the variables. Each later plan has an
        // update that reads the new client.
        const convex = new FakeConvex();
        const fake = new FakeServices(convex.fetch).install();
        const projectId = convex.addProject({ name: "scout", teamId: TEAM });
        const app = Effect.gen(function* () {
          const project = { projectId };
          const deployment = yield* Convex.Deployment("Deployment", {
            project,
            type: "preview",
            name: "pr-1",
            env: { SAMEBASE_REPOSITORY_ID: REPOSITORY_ID },
          });
          const hub = yield* Convex.SharedHubClient("Client", {
            app: "scout",
            redirectUri: Output.interpolate`${deployment.siteUrl}/auth/hub/callback`,
            deploymentType: "preview",
            connectors: ["google"],
          });
          const site = yield* Convex.Deployment("Site", {
            project,
            type: "preview",
            name: "pr-1",
            env: {
              HUB_ISSUER: hub.issuer,
              HUB_CLIENT_ID: hub.clientId,
              HUB_CLIENT_SECRET: hub.clientSecret,
            },
          }).pipe(adopt(true));
          return { name: site.name, status: hub.status };
        });

        const { name } = yield* stack.deploy(app);
        // "Site" leaves the variable of "Deployment": it removes only a name that leaves its own env.
        expect(convex.variables.get(name)).toEqual({
          SAMEBASE_REPOSITORY_ID: REPOSITORY_ID,
          HUB_ISSUER: ISSUER,
          HUB_CLIENT_ID: "cl_1",
          HUB_CLIENT_SECRET: "secret-of-cl_1",
        });
        const writes = () =>
          convex.sent.filter(({ path }) => path.endsWith("/update_environment_variables"));
        expect(writes()).toHaveLength(2);

        yield* stack.deploy(app);
        expect(fake.calls(`${ISSUER}/register/cl_1`)).toHaveLength(1);
        expect(writes()).toHaveLength(2);

        fake.clients.delete("cl_1");
        yield* stack.deploy(app);
        expect(convex.variables.get(name)).toMatchObject({
          HUB_CLIENT_ID: "cl_2",
          HUB_CLIENT_SECRET: "secret-of-cl_2",
        });
      }),
  );

  test.provider("a destroy deletes a preview client with its token", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      fake.sent.length = 0;
      yield* stack.destroy();
      expect(fake.sent).toEqual([
        {
          method: "DELETE",
          url: `${ISSUER}/register/cl_1`,
          authorization: "Bearer token-of-cl_1",
          body: undefined,
        },
      ]);
      expect(fake.clients.size).toBe(0);
    }),
  );

  test.provider("a destroy of a production client makes no request", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props({ deploymentType: "production" })));
      fake.sent.length = 0;
      yield* stack.destroy();
      expect(fake.sent).toEqual([]);
      expect(fake.clients.size).toBe(1);
    }),
  );

  test.provider("a destroy of the off values makes no request and no warning", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      fake.registrar = () => new Response("Not Found", { status: 404 });
      yield* stack.deploy(client(props()));
      fake.sent.length = 0;
      const { layer, lines } = capturedLogs();
      yield* stack.destroy().pipe(Effect.provide(layer));
      expect(fake.sent).toEqual([]);
      expect(warningsIn(lines)).toEqual([]);
    }),
  );

  test.provider("a destroy after 401 from the hub has no warning", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      fake.clients.delete("cl_1");
      const { layer, lines } = capturedLogs();
      yield* stack.destroy().pipe(Effect.provide(layer));
      expect(warningsIn(lines)).toEqual([]);
    }),
  );

  for (const [name, answer] of [
    ["a 500", () => new Response("no", { status: 500 })],
    ["a network error", networkDown],
  ] satisfies readonly (readonly [string, Answer])[]) {
    test.provider(`${name} on a delete warns and does not fail the destroy`, (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        yield* stack.deploy(client(props()));
        fake.hub = answer;
        const { layer, lines } = capturedLogs();
        yield* stack.destroy().pipe(Effect.provide(layer));
        expect(warningsIn(lines)).toEqual([
          expect.stringContaining("stays on the hub until its removal date"),
        ]);
        // The destroy removed the row, so another destroy has nothing to do.
        fake.sent.length = 0;
        yield* stack.destroy();
        expect(fake.sent).toEqual([]);
      }),
    );
  }

  test.provider("no logged line holds a secret or a token", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      fake.production = true;
      const { layer, lines } = capturedLogs();
      const deploy = (input = props()) => stack.deploy(client(input)).pipe(Effect.provide(layer));
      /** A refusal that repeats what a confused service could send back. */
      const echo: Answer = ({ authorization }) =>
        Response.json(
          {
            error: authorization,
            client_secret: "secret-of-cl_1",
            registration_access_token: "token-of-cl_1",
          },
          { status: 500 },
        );

      yield* deploy();
      fake.hub = networkDown;
      yield* deploy();
      fake.hub = echo;
      yield* deploy();
      fake.hub = () => new Response(null, { status: 403 });
      yield* deploy();
      fake.hub = undefined;
      fake.clients.delete("cl_1");
      fake.registrar = networkDown;
      yield* deploy();
      fake.registrar = echo;
      yield* deploy({ ...props(), redirectUri: OTHER_REDIRECT_URI });
      // The recorded answer without its client ID, with a secret in it.
      const { client_id: _clientId, ...withoutClient } = PRODUCTION_ANSWER;
      fake.registrar = () =>
        Response.json({ ...withoutClient, client_secret: "secret-of-cl_1" }, { status: 201 });
      yield* deploy({ ...props(), redirectUri: OTHER_REDIRECT_URI });
      fake.github = networkDown;
      yield* deploy({ ...props(), redirectUri: OTHER_REDIRECT_URI });
      fake.hub = echo;
      yield* stack.destroy().pipe(Effect.provide(layer));

      expect(warningsIn(lines).length).toBeGreaterThanOrEqual(7);
      for (const secret of [
        "secret-of-cl_1",
        "token-of-cl_1",
        "iat-of-cl_1",
        OIDC_TOKEN,
        OIDC_REQUEST_TOKEN,
        "Bearer",
      ]) {
        expect(lines.filter((line) => line.includes(secret))).toEqual([]);
      }
    }),
  );
});

describe("Convex.SharedHubClient for a development client", () => {
  const DEVELOPED = issued("cl_1", REDIRECT_URI, "development");

  it("takes the initial access token only for a development client", () => {
    // @ts-expect-error A preview client asks with the GitHub OIDC token.
    const preview: Convex.SharedHubClientProps = {
      app: "scout",
      redirectUri: REDIRECT_URI,
      deploymentType: "preview",
      connectors: ["google"],
      initialAccessToken: Redacted.make(INITIAL_ACCESS_TOKEN),
    };
    // @ts-expect-error A development client needs the token.
    const withoutToken: Convex.SharedHubClientProps = {
      app: "scout",
      redirectUri: REDIRECT_URI,
      deploymentType: "development",
      connectors: ["google"],
    };
    // @ts-expect-error Every client names its connectors.
    const withoutConnectors: Convex.SharedHubClientProps = {
      app: "scout",
      redirectUri: REDIRECT_URI,
      deploymentType: "preview",
    };
    expect([preview, withoutToken, withoutConnectors]).toHaveLength(3);
  });

  test.provider(
    "registers with the initial access token and no OIDC token, from the recorded answer",
    (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        expect(yield* stack.deploy(client(development()))).toEqual(DEVELOPED);
        expect(fake.sent).toEqual([
          {
            method: "POST",
            url: HUB_CLIENTS,
            authorization: `Bearer ${INITIAL_ACCESS_TOKEN}`,
            body: requestBody(),
          },
        ]);
      }),
  );

  test.provider("renews with the saved address and token", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(development()));
      fake.sent.length = 0;
      expect(yield* stack.deploy(client(development()))).toEqual(DEVELOPED);
      expect(fake.sent).toEqual([
        {
          method: "GET",
          url: `${ISSUER}/register/cl_1`,
          authorization: "Bearer token-of-cl_1",
          body: undefined,
        },
      ]);
    }),
  );

  test.provider("registers anew for another return address", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(development()));
      fake.sent.length = 0;
      const moved = yield* stack.deploy(client(development({ redirectUri: OTHER_REDIRECT_URI })));
      expect(moved).toEqual(issued("cl_2", OTHER_REDIRECT_URI, "development"));
      expect(fake.calls(ISSUER)).toEqual([]);
    }),
  );

  test.provider("registers anew for another type on the same return address", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      fake.sent.length = 0;
      expect(yield* stack.deploy(client(development()))).toEqual(
        issued("cl_2", REDIRECT_URI, "development"),
      );
      expect(fake.calls(ISSUER)).toEqual([]);
      expect(fake.calls(HUB_CLIENTS)).toEqual([`POST ${HUB_CLIENTS}`]);
    }),
  );

  test.provider("registers anew when the hub no longer has the client", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(development()));
      fake.clients.delete("cl_1");
      expect(yield* stack.deploy(client(development()))).toEqual(
        issued("cl_2", REDIRECT_URI, "development"),
      );
    }),
  );

  test.provider("403 on a renewal keeps the saved client in state, suspended", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(development()));
      fake.hub = () => Response.json({ error: "access_denied" }, { status: 403 });
      fake.sent.length = 0;
      expect(yield* stack.deploy(client(development()))).toEqual({
        ...DEVELOPED,
        status: "suspended",
      });
      expect(fake.calls(HUB_CLIENTS)).toEqual([]);

      // The hub lifts the suspension, and the same client serves again.
      fake.hub = undefined;
      expect(yield* stack.deploy(client(development()))).toEqual(DEVELOPED);
      expect(fake.calls(HUB_CLIENTS)).toEqual([]);
    }),
  );

  test.provider("an empty token gives the off values with one line and no request", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      const { layer, lines } = capturedLogs();
      const off = yield* stack
        .deploy(client(development({ initialAccessToken: Redacted.make("") })))
        .pipe(Effect.provide(layer));
      expect(off).toEqual({ ...OFF, deploymentType: "development" });
      expect(fake.sent).toEqual([]);
      expect(lines.filter((line) => line.includes("Convex.SharedHubClient"))).toEqual([
        "Info: Convex.SharedHubClient: deploy to main once for hub sign-in in development.",
      ]);
    }),
  );

  for (const [name, answer, text] of [
    ["a refused token", undefined, "the identity hub refused the initial access token (HTTP 401)"],
    [
      "app_mismatch",
      () => Response.json({ error: "not_allowed", reason: "app_mismatch" }, { status: 403 }),
      "the initial access token belongs to another app on the identity hub (HTTP 403)",
    ],
  ] satisfies readonly (readonly [string, Answer | undefined, string])[]) {
    test.provider(`${name} gives the off values and says why`, (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        fake.initialAccessTokens.delete(INITIAL_ACCESS_TOKEN);
        fake.registrar = answer;
        const { layer, lines } = capturedLogs();
        const off = yield* stack.deploy(client(development())).pipe(Effect.provide(layer));
        expect(off).toEqual({ ...OFF, deploymentType: "development" });
        expect(warningsIn(lines)).toEqual([expect.stringContaining(text)]);
      }),
    );
  }

  test.provider("a destroy deletes the development client", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(development()));
      fake.sent.length = 0;
      yield* stack.destroy();
      expect(fake.calls(ISSUER)).toEqual([`DELETE ${ISSUER}/register/cl_1`]);
      expect(fake.clients.size).toBe(0);
    }),
  );

  test.provider("no logged line holds a secret or a token", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      const { layer, lines } = capturedLogs();
      const deploy = (input = development()) =>
        stack.deploy(client(input)).pipe(Effect.provide(layer));
      const echo: Answer = ({ authorization }) =>
        Response.json({ error: authorization }, { status: 500 });

      yield* deploy();
      fake.hub = echo;
      yield* deploy();
      fake.hub = () => new Response(null, { status: 403 });
      yield* deploy();
      fake.registrar = echo;
      yield* deploy(development({ redirectUri: OTHER_REDIRECT_URI }));
      fake.registrar = networkDown;
      yield* deploy(development({ redirectUri: OTHER_REDIRECT_URI }));
      fake.registrar = undefined;
      fake.initialAccessTokens.clear();
      yield* deploy(development({ redirectUri: OTHER_REDIRECT_URI }));
      fake.hub = echo;
      yield* stack.destroy().pipe(Effect.provide(layer));

      expect(warningsIn(lines).length).toBeGreaterThanOrEqual(4);
      for (const secret of [INITIAL_ACCESS_TOKEN, "secret-of-cl_1", "token-of-cl_1", "Bearer"]) {
        expect(lines.filter((line) => line.includes(secret))).toEqual([]);
      }
    }),
  );
});

describe("Convex.SharedHubClient.variables", () => {
  const variables = (input: Convex.SharedHubClientProps) =>
    Effect.gen(function* () {
      const resource = yield* Convex.SharedHubClient("Client", input);
      const values = Convex.SharedHubClient.variables(resource);
      return {
        issuer: values.issuer,
        clientId: values.clientId,
        clientSecret: Output.map(values.clientSecret, Redacted.value),
      };
    });
  const REAL = { issuer: ISSUER, clientId: "cl_1", clientSecret: "secret-of-cl_1" };
  const OFF_VARIABLES = { issuer: OFF.issuer, clientId: OFF.clientId, clientSecret: "no-hub" };

  test.provider("gives the client's values when it is on", (stack) =>
    Effect.gen(function* () {
      new FakeServices().install();
      expect(yield* stack.deploy(variables(development()))).toEqual(REAL);
    }),
  );

  test.provider("gives the off values while suspended, and the client's values after", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(variables(development()));
      fake.hub = () => new Response(null, { status: 403 });
      expect(yield* stack.deploy(variables(development()))).toEqual(OFF_VARIABLES);
      fake.hub = undefined;
      expect(yield* stack.deploy(variables(development()))).toEqual(REAL);
    }),
  );

  test.provider("gives the off values without a client", (stack) =>
    Effect.gen(function* () {
      new FakeServices().install();
      const off = development({ initialAccessToken: Redacted.make("") });
      expect(yield* stack.deploy(variables(off))).toEqual(OFF_VARIABLES);
    }),
  );
});

/**
 * The client row of stage `prod`, from a production deploy of this stack, as the Convex store
 * answers it: encoded to JSON and revived.
 */
const deployProduction = (stack: ScratchStack, fake: FakeServices) =>
  Effect.gen(function* () {
    fake.production = true;
    yield* stack.deploy(
      Convex.SharedHubClient("HubClient", props({ deploymentType: "production" })),
    );
    yield* Effect.gen(function* () {
      const state = yield* yield* State;
      const row = yield* state.get({ stack: stack.name, stage: stack.stage, fqn: "HubClient" });
      if (row === undefined) throw new Error("the deploy saved no client");
      const stored: PersistedState = JSON.parse(JSON.stringify(encodeState(row)), reviveState);
      yield* state.set({ stack: stack.name, stage: "prod", fqn: "HubClient", value: stored });
    }).pipe(Effect.provide(stack.state));
    // A production client stays on the hub, and the row of this stage goes.
    yield* stack.destroy();
    fake.production = false;
    fake.sent.length = 0;
    fake.timeline.length = 0;
  });

describe("Convex.SharedHubClient.read", () => {
  const readProd = Effect.sync(() => {
    const prod = Convex.SharedHubClient.read("HubClient", { stage: "prod" });
    return {
      status: prod.status,
      clientId: prod.clientId,
      deploymentType: prod.deploymentType,
      connectors: prod.connectors,
      repository: prod.repository,
      initialAccessToken: Output.map(prod.initialAccessToken, (token) =>
        Redacted.isRedacted(token) ? Redacted.value(token) : "not redacted",
      ),
      clientSecret: Output.map(prod.clientSecret, (secret) =>
        Redacted.isRedacted(secret) ? Redacted.value(secret) : "not redacted",
      ),
    };
  });

  test.provider("gives the row's attributes with the secrets as Redacted", (stack) =>
    Effect.gen(function* () {
      yield* deployProduction(stack, new FakeServices().install());
      expect(yield* stack.deploy(readProd)).toEqual({
        status: "on",
        clientId: "cl_1",
        deploymentType: "production",
        connectors: ["google"],
        repository: REPOSITORY_ID,
        initialAccessToken: "iat-of-cl_1",
        clientSecret: "secret-of-cl_1",
      });
    }),
  );

  test.provider("gives the off attributes when the stage has no row", (stack) =>
    Effect.gen(function* () {
      expect(yield* stack.deploy(readProd)).toEqual({
        status: "off",
        clientId: "no-hub",
        deploymentType: "production",
        connectors: [],
        repository: "",
        initialAccessToken: "",
        clientSecret: "no-hub",
      });
    }),
  );

  test.provider("stops with a fixed message when the row cannot be read", (stack) =>
    Effect.gen(function* () {
      yield* deployProduction(stack, new FakeServices().install());
      // The row of prod as 0.32 saved it: no connectors.
      yield* Effect.gen(function* () {
        const state = yield* yield* State;
        const request = { stack: stack.name, stage: "prod", fqn: "HubClient" };
        const row = yield* state.get(request);
        if (row === undefined || !("attr" in row) || row.attr === undefined) {
          throw new Error("no row of prod");
        }
        const { connectors: _connectors, ...attr } = row.attr;
        yield* state.set({ ...request, value: { ...row, attr } });
      }).pipe(Effect.provide(stack.state));
      // The read dies: a defect, not a failure of the run. Every text of the defect is checked: the
      // JSON, which has the enumerable fields, and the message and the stack, which it leaves out.
      const defect = yield* stack
        .deploy(readProd)
        .pipe(
          Effect.catchDefect((cause) =>
            Effect.succeed(
              [
                JSON.stringify(cause),
                String(cause),
                cause instanceof Error ? (cause.stack ?? "") : "",
              ].join("\n"),
            ),
          ),
        );
      expect(defect).toContain("holds attributes that this version cannot read");
      // The message names the reason, so a terminal shows more than a stack trace.
      expect(defect).toContain(
        "Convex.SharedHubClient: the row HubClient of stage prod holds attributes that this version cannot read.",
      );
      expect(defect).not.toContain("secret-of");
    }),
  );
});

describe("the development stage of the starter", () => {
  test.provider(
    "writes the repository id, registers with prod's token, writes the variables, and a destroy keeps the deployment",
    (stack) =>
      Effect.gen(function* () {
        const convex = new FakeConvex();
        const services = new FakeServices(convex.fetch).install();
        yield* deployProduction(stack, services);
        const projectId = convex.addProject({ name: "scout", teamId: TEAM });
        // The dev deployment that `npx convex dev` made and `.env.local` selects, with the code
        // already pushed. The stage takes it by its Convex name and pushes nothing.
        const selected = convex.addDeployment({ projectId, type: "dev", name: "nicu" });
        const app = Effect.gen(function* () {
          const project = { projectId };
          const prod = Convex.SharedHubClient.read("HubClient", { stage: "prod" });
          const deployment = yield* Convex.Deployment("Verification", {
            project,
            type: "dev",
            name: selected,
            env: { SAMEBASE_REPOSITORY_ID: prod.repository },
          }).pipe(adopt(true));
          const hub = yield* Convex.SharedHubClient("HubClient", {
            app: "scout",
            redirectUri: Output.interpolate`${deployment.siteUrl}/auth/hub/callback`,
            deploymentType: "development",
            connectors: ["google"],
            initialAccessToken: prod.initialAccessToken,
          });
          const variables = Convex.SharedHubClient.variables(hub);
          const site = yield* Convex.Deployment("Site", {
            project,
            type: "dev",
            name: selected,
            env: {
              HUB_ISSUER: variables.issuer,
              HUB_CLIENT_ID: variables.clientId,
              HUB_CLIENT_SECRET: variables.clientSecret,
            },
          }).pipe(adopt(true));
          return { name: site.name, siteUrl: site.siteUrl };
        });

        const { layer, lines } = capturedLogs();
        const { name, siteUrl } = yield* stack.deploy(app).pipe(Effect.provide(layer));
        expect(name).toBe(selected);
        const callback = `${siteUrl}/auth/hub/callback`;
        expect(services.sent.filter(({ url }) => url === HUB_CLIENTS)).toEqual([
          {
            method: "POST",
            url: HUB_CLIENTS,
            authorization: "Bearer iat-of-cl_1",
            body: requestBody({ redirectUri: callback, softwareVersion: "unknown" }),
          },
        ]);
        const at = (pattern: RegExp) =>
          services.timeline.flatMap((line, index) => (pattern.test(line) ? [index] : []));
        // The repository id is written before the request for the client, which the hub needs to
        // read the file, and the three variables after it.
        const [register] = at(/\/hub-clients$/);
        const writes = at(/\/update_environment_variables$/);
        expect(writes[0]).toBeLessThan(register ?? -1);
        expect(writes.at(-1)).toBeGreaterThan(register ?? Infinity);
        // No new deployment and no push: `convex dev` owns the code, so no deploy key is minted
        // for a push, only for the variable writes.
        expect(services.timeline.filter((line) => line.endsWith("/create_deployment"))).toEqual([]);
        // "Site" leaves the variable of "Verification": it removes only a name that leaves its own env.
        expect(convex.variables.get(name)).toEqual({
          SAMEBASE_REPOSITORY_ID: REPOSITORY_ID,
          HUB_ISSUER: ISSUER,
          HUB_CLIENT_ID: "cl_2",
          HUB_CLIENT_SECRET: "secret-of-cl_2",
        });

        // Both rows keep the default removal policy retain: a destroy deletes the client only.
        yield* stack.destroy().pipe(Effect.provide(layer));
        expect(services.calls(ISSUER)).toContain(`DELETE ${ISSUER}/register/cl_2`);
        expect(convex.deployment(name)).toMatchObject({ deploymentType: "dev", reference: "nicu" });

        expect(lines).toContainEqual(expect.stringContaining("has a new client"));
        for (const secret of ["iat-of-cl_1", "secret-of-cl_2", "token-of-cl_2", "Bearer"]) {
          expect(lines.filter((line) => line.includes(secret))).toEqual([]);
        }
      }),
  );
});
