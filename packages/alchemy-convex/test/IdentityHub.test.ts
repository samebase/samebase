// IdentityHub.Client against a fake GitHub and identity hub behind a stubbed fetch. The hub
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
import * as IdentityHub from "../src/IdentityHub.ts";
import * as Convex from "../src/index.ts";
import { FakeConvex, hubFixture } from "./fakeConvex.ts";

const TEAM = 38516;
/** The issuer of the hub that recorded the answers in `test/fixtures/hub/`. */
const ISSUER = "https://auth.test";
const DEPLOYMENT = "happy-otter-123";
const REDIRECT_URI = `https://${DEPLOYMENT}.convex.site/auth/hub/callback`;
/** Another host and another path, as a Worker on Convex Auth 0 has. */
const OTHER_REDIRECT_URI = "https://scout.example.workers.dev/api/auth/callback/hub";
const OIDC_REQUEST_URL = "https://oidc.test/token?api-version=2.0";
const OIDC_REQUEST_TOKEN = "oidc-request-token";
const OIDC_TOKEN = "oidc-token";
/** Where a run asks for a new client. */
const HUB_CLIENTS = `${ISSUER}/hub-clients`;
/** The clients' own records at the hub, which a renewal and a delete read. */
const RECORDS = `${ISSUER}/register/`;
/** The 201 answers of `POST /hub-clients`, recorded from the hub of RFC 133. */
const PRODUCTION_ANSWER = hubFixture("hub-clients-production.json");
const PREVIEW_ANSWER = hubFixture("hub-clients-preview.json");
const DEVELOPMENT_ANSWER = hubFixture("hub-clients-development.json");
/** The hub of every test, unless a test names another. */
const HUB: IdentityHub.Hub = { issuer: ISSUER };
/** A second hub, for the tests that change the hub. */
const OTHER_HUB: IdentityHub.Hub = { issuer: "https://auth.other.test" };
/** The numeric GitHub id of the repository, which the hub gives with the token. */
const REPOSITORY_ID = String(PRODUCTION_ANSWER["repository"]);

const { test } = Test.make({
  providers: Convex.providers(Convex.fromValues({ accessToken: Redacted.make("test-token") })),
});

/** The props of a client that asks with the GitHub OIDC token. */
type GitHubProps = Extract<
  IdentityHub.ClientProps,
  { readonly deploymentType: "production" | "preview" }
>;
type DevelopmentProps = Extract<
  IdentityHub.ClientProps,
  { readonly deploymentType: "development" }
>;

const props = (overrides: Partial<GitHubProps> = {}): GitHubProps => ({
  app: "scout",
  hub: HUB,
  redirectUris: [REDIRECT_URI],
  deploymentType: "preview",
  connectors: ["google"],
  softwareVersion: "abc",
  ...overrides,
});

/** The app's initial access token that the fake hub knows. */
const INITIAL_ACCESS_TOKEN = "iat-of-scout";

const development = (overrides: Partial<DevelopmentProps> = {}): DevelopmentProps => ({
  app: "scout",
  hub: HUB,
  redirectUris: [REDIRECT_URI],
  deploymentType: "development",
  connectors: ["google"],
  initialAccessToken: Redacted.make(INITIAL_ACCESS_TOKEN),
  softwareVersion: "abc",
  ...overrides,
});

/** The body of a registration, as the fake and the tests expect it. */
const requestBody = (overrides: Record<string, unknown> = {}) => ({
  app: "scout",
  redirectUris: [REDIRECT_URI],
  softwareVersion: "abc",
  connectors: ["google"],
  ...overrides,
});

const client = (input: IdentityHub.ClientProps) =>
  Effect.gen(function* () {
    const resource = yield* IdentityHub.Client("Client", input);
    return {
      status: resource.status,
      issuer: resource.issuer,
      clientId: resource.clientId,
      clientSecret: Output.map(resource.clientSecret, Redacted.value),
      registrationAccessToken: Output.map(resource.registrationAccessToken, Redacted.value),
      registrationClientUri: resource.registrationClientUri,
      deploymentType: resource.deploymentType,
      app: resource.app,
      redirectUris: resource.redirectUris,
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
  app: "scout",
  redirectUris: [redirectUri],
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
  app: "",
  redirectUris: [],
  connectors: [],
  initialAccessToken: "",
  repository: "",
};

/** The body of POST /hub-clients. */
const ClientRequest = Schema.Struct({
  app: Schema.String,
  redirectUris: Schema.Array(Schema.String),
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
  // The log line names the return address, so it may not be a value that the answer chose.
  [
    "a 201 with another return address",
    ({ authorization }) =>
      Response.json(
        { ...PREVIEW_ANSWER, redirect_uris: [`https://evil.example/${authorization}`] },
        { status: 201 },
      ),
  ],
  [
    "a 201 that names another issuer",
    ({ body }) =>
      Response.json(
        {
          ...PREVIEW_ANSWER,
          redirect_uris: Schema.decodeUnknownSync(ClientRequest)(body).redirectUris,
          issuer: "https://auth.other.test",
        },
        { status: 201 },
      ),
  ],
  [
    "a 201 with other connectors",
    ({ body }) =>
      Response.json(
        {
          ...PREVIEW_ANSWER,
          redirect_uris: Schema.decodeUnknownSync(ClientRequest)(body).redirectUris,
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
        { ...answer, redirect_uris: Schema.decodeUnknownSync(ClientRequest)(body).redirectUris },
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
    return new URL(url).pathname.startsWith("/register/")
      ? (this.hub ?? this.answerHub)
      : undefined;
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
  /** Any hub: the answer names the issuer that the request went to. */
  private readonly answerRegistrar: Answer = ({ authorization, body, url }) => {
    const issuer = new URL(url).origin;
    const bearer = authorization.replace(/^Bearer /, "");
    const withGitHub = bearer === OIDC_TOKEN;
    if (!withGitHub && !this.initialAccessTokens.has(bearer)) {
      return Response.json({ error: "invalid_token" }, { status: 401 });
    }
    const { redirectUris, connectors } = Schema.decodeUnknownSync(ClientRequest)(body);
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
        issuer,
        client_id: clientId,
        client_secret: `secret-of-${clientId}`,
        registration_access_token: token,
        registration_client_uri: `${issuer}/register/${clientId}`,
        redirect_uris: redirectUris,
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

/** The type of this resource before 0.37.0, which saved rows can still have. */
const OLD_TYPE = "IdentityHub.SharedClient";

/** The saved row `fqn` of `stage`. */
const savedRow = (stack: ScratchStack, stage: string, fqn: string) =>
  Effect.gen(function* () {
    const state = yield* yield* State;
    const row = yield* state.get({ stack: stack.name, stage, fqn });
    if (row === undefined || !("resourceType" in row)) throw new Error(`no row ${fqn} of ${stage}`);
    return row;
  }).pipe(Effect.provide(stack.state));

const typeOfRow = (stack: ScratchStack, stage: string, fqn: string) =>
  Effect.map(savedRow(stack, stage, fqn), (row) => row.resourceType);

/** Gives the saved row `fqn` of `stage` the type `resourceType`, as an older version saved it. */
const relabel = (stack: ScratchStack, stage: string, fqn: string, resourceType: string) =>
  Effect.gen(function* () {
    const row = yield* savedRow(stack, stage, fqn);
    const state = yield* yield* State;
    yield* state.set({ stack: stack.name, stage, fqn, value: { ...row, resourceType } });
  }).pipe(Effect.provide(stack.state));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("IdentityHub.Client", () => {
  test.provider("the first deploy gets a client with the OIDC token of the run", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      expect(yield* stack.deploy(client(props()))).toEqual(issued());
      expect(fake.sent).toEqual([
        {
          method: "GET",
          url: `${OIDC_REQUEST_URL}&audience=${encodeURIComponent(ISSUER)}`,
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

  test.provider("the request sends the return addresses as a set, sorted, each once", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      const made = yield* stack.deploy(
        client(props({ redirectUris: [REDIRECT_URI, OTHER_REDIRECT_URI, REDIRECT_URI] })),
      );
      const sorted = [REDIRECT_URI, OTHER_REDIRECT_URI].sort();
      expect(made.redirectUris).toEqual(sorted);
      expect(fake.sent.at(-1)?.body).toEqual(requestBody({ redirectUris: sorted }));
      // The same set in another order renews that client.
      fake.sent.length = 0;
      expect(
        yield* stack.deploy(client(props({ redirectUris: [OTHER_REDIRECT_URI, REDIRECT_URI] }))),
      ).toEqual(made);
      expect(fake.calls(HUB_CLIENTS)).toEqual([]);
    }),
  );

  test.provider("another app name asks for a new client without a renewal", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      fake.sent.length = 0;
      const renamed = yield* stack.deploy(client(props({ app: "scout-admin" })));
      expect(renamed).toEqual({ ...issued("cl_2"), app: "scout-admin" });
      expect(fake.sent.at(-1)?.body).toEqual(requestBody({ app: "scout-admin" }));
      expect(fake.calls(RECORDS)).toEqual([]);
    }),
  );

  test.provider(
    "without an app, a stack whose name is not owner/repo fails before any request",
    (stack) =>
      Effect.gen(function* () {
        // The scratch stack's name has no slash, so no default exists.
        const fake = new FakeServices().install();
        const { app: _app, ...withoutApp } = props();
        const exit = yield* Effect.exit(stack.deploy(client(withoutApp)));
        expect(Exit.isFailure(exit)).toBe(true);
        expect(String(exit)).toContain("so set app");
        expect(fake.sent).toEqual([]);
      }),
  );

  test.provider("an app name over the hub's 64 characters fails before any request", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      const exit = yield* Effect.exit(stack.deploy(client(props({ app: "a".repeat(65) }))));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(String(exit)).toContain("set a shorter app");
      expect(fake.sent).toEqual([]);
      // 64 is the limit itself, and the hub takes it.
      expect(yield* stack.deploy(client(props({ app: "a".repeat(64) })))).toEqual({
        ...issued(),
        app: "a".repeat(64),
      });
    }),
  );

  for (const [name, redirectUris] of [
    ["no return address", []],
    ["nine return addresses", Array.from({ length: 9 }, (_, i) => `${REDIRECT_URI}/${i}`)],
    ["a return address that is not a URL", ["not a url"]],
  ] as const) {
    test.provider(`${name} fails before any request`, (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        const exit = yield* Effect.exit(
          stack.deploy(client(props({ redirectUris: [...redirectUris] }))),
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect(String(exit)).toContain("needs redirectUris");
        expect(fake.sent).toEqual([]);
      }),
    );
  }

  test.provider("another connector set asks for a new client without a renewal", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      fake.sent.length = 0;
      const changed = yield* stack.deploy(client(props({ connectors: ["google", "github"] })));
      expect(changed).toEqual({ ...issued("cl_2"), connectors: ["github", "google"] });
      expect(fake.calls(RECORDS)).toEqual([]);
      // The same set in another order, with a name twice, renews that client.
      fake.sent.length = 0;
      expect(
        yield* stack.deploy(client(props({ connectors: ["github", "google", "github"] }))),
      ).toEqual(changed);
      expect(fake.calls(RECORDS)).toEqual([`GET ${ISSUER}/register/cl_2`]);
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

  test.provider("another hub gets the request, with a GitHub token for its own issuer", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      expect(yield* stack.deploy(client(props({ hub: OTHER_HUB })))).toMatchObject({
        status: "on",
        issuer: OTHER_HUB.issuer,
      });
      expect(fake.calls(OIDC_REQUEST_URL)).toEqual([
        `GET ${OIDC_REQUEST_URL}&audience=${encodeURIComponent(OTHER_HUB.issuer)}`,
      ]);
      expect(fake.calls(OTHER_HUB.issuer)).toEqual([`POST ${OTHER_HUB.issuer}/hub-clients`]);
      expect(fake.calls(ISSUER)).toEqual([]);
    }),
  );

  test.provider("a changed hub asks the new hub for a client, without a renewal", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      fake.sent.length = 0;
      yield* stack.deploy(client(props({ hub: OTHER_HUB })));
      expect(fake.calls(OTHER_HUB.issuer)).toEqual([`POST ${OTHER_HUB.issuer}/hub-clients`]);
      expect(fake.calls(ISSUER)).toEqual([]);
    }),
  );

  test.provider("a new client logs its hub once, and a renewal does not", (stack) =>
    Effect.gen(function* () {
      new FakeServices().install();
      const { layer, lines } = capturedLogs();
      yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
      yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
      expect(lines.filter((line) => line.includes("has a new client"))).toEqual([
        `Info: IdentityHub.Client: scout on ${REDIRECT_URI} has a new client of the identity hub ${ISSUER}.`,
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

  test.provider("a saved row without the connectors stops the run with a fixed message", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      fake.production = true;
      const production = props({ deploymentType: "production" });
      yield* stack.deploy(client(production));
      // The saved row without one field of this version's shape.
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
      const exit = yield* Effect.exit(stack.deploy(client(production)));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(String(exit)).toContain(
        `IdentityHub.Client: the saved attributes of scout on ${REDIRECT_URI} cannot be read by this version.`,
      );
      expect(String(exit)).not.toContain("secret-of");
      expect(String(exit)).not.toContain("iat-of");
      // No request asks for a client that would replace the saved one.
      expect(fake.calls(HUB_CLIENTS)).toHaveLength(1);
    }),
  );

  test.provider("a saved row of the type before 0.37.0 is updated in place", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      yield* relabel(stack, stack.stage, "Client", OLD_TYPE);
      expect(yield* typeOfRow(stack, stack.stage, "Client")).toBe(OLD_TYPE);

      // The same client: no new registration and no delete, only the renewal of cl_1.
      expect(yield* stack.deploy(client(props()))).toEqual(issued());
      expect(fake.calls(HUB_CLIENTS)).toHaveLength(1);
      expect(fake.calls(RECORDS)).toEqual([`GET ${ISSUER}/register/cl_1`]);
      expect(yield* typeOfRow(stack, stack.stage, "Client")).toBe("IdentityHub.Client");
    }),
  );

  test.provider("a saved row with a field of another shape stops the run", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      // Current data with one field that is not a string: a schema issue, not a defect.
      yield* Effect.gen(function* () {
        const state = yield* yield* State;
        const request = { stack: stack.name, stage: stack.stage, fqn: "Client" };
        const row = yield* state.get(request);
        if (row === undefined || !("attr" in row) || row.attr === undefined) {
          throw new Error("the deploy saved no client");
        }
        yield* state.set({ ...request, value: { ...row, attr: { ...row.attr, redirectUris: 7 } } });
      }).pipe(Effect.provide(stack.state));
      const exit = yield* Effect.exit(stack.deploy(client(props())));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(String(exit)).toContain("cannot be read by this version");
      expect(String(exit)).not.toContain("secret-of");
      expect(fake.calls(HUB_CLIENTS)).toHaveLength(1);
    }),
  );

  test.provider("a renewal needs no OIDC token", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      const first = yield* stack.deploy(client(props()));
      vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", "");
      expect(yield* stack.deploy(client(props()))).toEqual(first);
      expect(fake.calls(RECORDS)).toHaveLength(1);
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
            redirect_uris: Schema.decodeUnknownSync(ClientRequest)(body).redirectUris,
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
      const moved = yield* stack.deploy(client(props({ redirectUris: [OTHER_REDIRECT_URI] })));
      expect(moved).toEqual(issued("cl_2", OTHER_REDIRECT_URI));
      expect(fake.calls(RECORDS)).toEqual([]);
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
      expect(fake.calls(RECORDS)).toEqual([]);
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
        const moved = yield* stack.deploy(client(props({ redirectUris: [OTHER_REDIRECT_URI] })));
        expect(moved).toEqual(OFF);
        fake.registrar = undefined;
        const next = yield* stack.deploy(client(props({ redirectUris: [OTHER_REDIRECT_URI] })));
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
          const hub = yield* IdentityHub.Client("Client", {
            app: "scout",
            hub: HUB,
            redirectUris: [Output.interpolate`${deployment.siteUrl}/auth/hub/callback`],
            deploymentType: "preview",
            connectors: ["google"],
          });
          const site = yield* Convex.Deployment("Site", {
            project,
            type: "preview",
            name: "pr-1",
            env: {
              IDENTITY_HUB_ISSUER: hub.issuer,
              IDENTITY_HUB_CLIENT_ID: hub.clientId,
              IDENTITY_HUB_CLIENT_SECRET: hub.clientSecret,
            },
          }).pipe(adopt(true));
          return { name: site.name, status: hub.status };
        });

        const { name } = yield* stack.deploy(app);
        // "Site" leaves the variable of "Deployment": it removes only a name that leaves its own env.
        expect(convex.variables.get(name)).toEqual({
          SAMEBASE_REPOSITORY_ID: REPOSITORY_ID,
          IDENTITY_HUB_ISSUER: ISSUER,
          IDENTITY_HUB_CLIENT_ID: "cl_1",
          IDENTITY_HUB_CLIENT_SECRET: "secret-of-cl_1",
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
          IDENTITY_HUB_CLIENT_ID: "cl_2",
          IDENTITY_HUB_CLIENT_SECRET: "secret-of-cl_2",
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
      yield* deploy({ ...props(), redirectUris: [OTHER_REDIRECT_URI] });
      // The recorded answer without its client ID, with a secret in it.
      const { client_id: _clientId, ...withoutClient } = PRODUCTION_ANSWER;
      fake.registrar = () =>
        Response.json({ ...withoutClient, client_secret: "secret-of-cl_1" }, { status: 201 });
      yield* deploy({ ...props(), redirectUris: [OTHER_REDIRECT_URI] });
      fake.github = networkDown;
      yield* deploy({ ...props(), redirectUris: [OTHER_REDIRECT_URI] });
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

describe("IdentityHub.Client for a development client", () => {
  const DEVELOPED = issued("cl_1", REDIRECT_URI, "development");

  it("takes the initial access token only for a development client", () => {
    // @ts-expect-error A preview client asks with the GitHub OIDC token.
    const preview: IdentityHub.ClientProps = {
      app: "scout",
      redirectUris: [REDIRECT_URI],
      deploymentType: "preview",
      connectors: ["google"],
      initialAccessToken: Redacted.make(INITIAL_ACCESS_TOKEN),
    };
    // @ts-expect-error A development client needs the token.
    const withoutToken: IdentityHub.ClientProps = {
      app: "scout",
      redirectUris: [REDIRECT_URI],
      deploymentType: "development",
      connectors: ["google"],
    };
    // @ts-expect-error Every client names its connectors.
    const withoutConnectors: IdentityHub.ClientProps = {
      app: "scout",
      redirectUris: [REDIRECT_URI],
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
      const moved = yield* stack.deploy(
        client(development({ redirectUris: [OTHER_REDIRECT_URI] })),
      );
      expect(moved).toEqual(issued("cl_2", OTHER_REDIRECT_URI, "development"));
      expect(fake.calls(RECORDS)).toEqual([]);
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
      expect(fake.calls(RECORDS)).toEqual([]);
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
      expect(lines.filter((line) => line.includes("IdentityHub.Client"))).toEqual([
        "Info: IdentityHub.Client: deploy to main once for hub sign-in in development.",
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
      expect(fake.calls(RECORDS)).toEqual([`DELETE ${ISSUER}/register/cl_1`]);
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
      yield* deploy(development({ redirectUris: [OTHER_REDIRECT_URI] }));
      fake.registrar = networkDown;
      yield* deploy(development({ redirectUris: [OTHER_REDIRECT_URI] }));
      fake.registrar = undefined;
      fake.initialAccessTokens.clear();
      yield* deploy(development({ redirectUris: [OTHER_REDIRECT_URI] }));
      fake.hub = echo;
      yield* stack.destroy().pipe(Effect.provide(layer));

      expect(warningsIn(lines).length).toBeGreaterThanOrEqual(4);
      for (const secret of [INITIAL_ACCESS_TOKEN, "secret-of-cl_1", "token-of-cl_1", "Bearer"]) {
        expect(lines.filter((line) => line.includes(secret))).toEqual([]);
      }
    }),
  );
});

describe("the app's default name", () => {
  it("is the stack's path in the repository, or `app` for a stack named after it", () => {
    expect(IdentityHub.defaultApp("samebase/samebase/apps/samebase")).toBe("apps/samebase");
    expect(IdentityHub.defaultApp("octo-org/scout")).toBe("app");
    expect(IdentityHub.defaultApp("octo-org/base/apps/web/admin")).toBe("apps/web/admin");
  });

  it("does not exist for a stack whose name is not owner/repo", () => {
    expect(IdentityHub.defaultApp("scout")).toBeUndefined();
    expect(IdentityHub.defaultApp("octo-org//scout")).toBeUndefined();
    expect(IdentityHub.defaultApp("/scout")).toBeUndefined();
    expect(IdentityHub.defaultApp("")).toBeUndefined();
  });
});

describe("IdentityHub.Client.variables", () => {
  const variables = (input: IdentityHub.ClientProps) =>
    Effect.gen(function* () {
      const resource = yield* IdentityHub.Client("Client", input);
      const values = IdentityHub.Client.variables(resource);
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
    yield* stack.deploy(IdentityHub.Client("HubClient", props({ deploymentType: "production" })));
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

describe("IdentityHub.Client.read", () => {
  const readProd = Effect.sync(() => {
    const prod = IdentityHub.Client.read("HubClient", { stage: "prod" });
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

  test.provider("reads a row of the type before 0.37.0 as well", (stack) =>
    Effect.gen(function* () {
      yield* deployProduction(stack, new FakeServices().install());
      expect(yield* typeOfRow(stack, "prod", "HubClient")).toBe("IdentityHub.Client");
      yield* relabel(stack, "prod", "HubClient", OLD_TYPE);
      expect(yield* stack.deploy(readProd)).toMatchObject({
        status: "on",
        clientId: "cl_1",
        initialAccessToken: "iat-of-cl_1",
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
      // The row of prod without one field of this version's shape.
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
        "IdentityHub.Client: the row HubClient of stage prod holds attributes that this version cannot read.",
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
          const prod = IdentityHub.Client.read("HubClient", { stage: "prod" });
          const deployment = yield* Convex.Deployment("Verification", {
            project,
            type: "dev",
            name: selected,
            env: { SAMEBASE_REPOSITORY_ID: prod.repository },
          }).pipe(adopt(true));
          const hub = yield* IdentityHub.Client("HubClient", {
            app: "scout",
            hub: HUB,
            redirectUris: [Output.interpolate`${deployment.siteUrl}/auth/hub/callback`],
            deploymentType: "development",
            connectors: ["google"],
            initialAccessToken: prod.initialAccessToken,
          });
          const variables = IdentityHub.Client.variables(hub);
          const site = yield* Convex.Deployment("Site", {
            project,
            type: "dev",
            name: selected,
            env: {
              IDENTITY_HUB_ISSUER: variables.issuer,
              IDENTITY_HUB_CLIENT_ID: variables.clientId,
              IDENTITY_HUB_CLIENT_SECRET: variables.clientSecret,
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
            body: requestBody({ redirectUris: [callback], softwareVersion: "unknown" }),
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
          IDENTITY_HUB_ISSUER: ISSUER,
          IDENTITY_HUB_CLIENT_ID: "cl_2",
          IDENTITY_HUB_CLIENT_SECRET: "secret-of-cl_2",
        });

        // Both rows keep the default removal policy retain: a destroy deletes the client only.
        yield* stack.destroy().pipe(Effect.provide(layer));
        expect(services.calls(RECORDS)).toContain(`DELETE ${ISSUER}/register/cl_2`);
        expect(convex.deployment(name)).toMatchObject({ deploymentType: "dev", reference: "nicu" });

        expect(lines).toContainEqual(expect.stringContaining("has a new client"));
        for (const secret of ["iat-of-cl_1", "secret-of-cl_2", "token-of-cl_2", "Bearer"]) {
          expect(lines.filter((line) => line.includes(secret))).toEqual([]);
        }
      }),
  );
});
