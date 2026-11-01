// Convex.SharedHubClient against a fake GitHub, Samebase, and identity hub behind a stubbed fetch.
// The hub answers as `registrationEndpoints` of @samebase/identity-broker does.
import { adopt } from "alchemy/AdoptPolicy";
import * as Output from "alchemy/Output";
import * as Test from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import * as Logger from "effect/Logger";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { afterEach, describe, expect, vi } from "vitest";
import * as Convex from "../src/index.ts";
import { FakeConvex } from "./fakeConvex.ts";

const TEAM = 38516;
const ISSUER = "https://hub.test";
const DEPLOYMENT = "happy-otter-123";
const OIDC_REQUEST_URL = "https://oidc.test/token?api-version=2.0";
const OIDC_REQUEST_TOKEN = "oidc-request-token";
const OIDC_TOKEN = "oidc-token";

const { test } = Test.make({
  providers: Convex.providers(Convex.fromValues({ accessToken: Redacted.make("test-token") })),
});

const props = (
  overrides: Partial<Convex.SharedHubClientProps> = {},
): Convex.SharedHubClientProps => ({
  app: "scout",
  deployment: DEPLOYMENT,
  deploymentType: "preview",
  softwareVersion: "abc",
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
      deployment: resource.deployment,
      deploymentType: resource.deploymentType,
      redirectUri: resource.redirectUri,
    };
  });

/** The outputs of the client `clientId` on `deployment`. */
const issued = (clientId = "cl_1", deployment = DEPLOYMENT) => ({
  status: "on",
  issuer: ISSUER,
  clientId,
  clientSecret: `secret-of-${clientId}`,
  registrationAccessToken: `token-of-${clientId}`,
  registrationClientUri: `${ISSUER}/register/${clientId}`,
  deployment,
  deploymentType: "preview",
  redirectUri: `https://${deployment}.convex.site/auth/hub/callback`,
});

const OFF = {
  status: "off",
  issuer: "http://127.0.0.1:1",
  clientId: "no-hub",
  clientSecret: "no-hub",
  registrationAccessToken: "",
  registrationClientUri: "",
  deployment: DEPLOYMENT,
  deploymentType: "preview",
  redirectUri: "",
};

/** The body of POST /api/hub-clients. */
const ClientRequest = Schema.Struct({ deployment: Schema.String });

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

/** The answers of POST /api/hub-clients that give no client. */
const REFUSALS: readonly (readonly [string, Answer])[] = [
  ["a refused token", () => Response.json({ error: "invalid_token" }, { status: 401 })],
  ["not_allowed", () => Response.json({ error: "not_allowed" }, { status: 403 })],
  ["off", () => Response.json({ error: "off" }, { status: 404 })],
  ["rate_limited", () => Response.json({ error: "rate_limited" }, { status: 429 })],
  ["hub_unavailable", () => Response.json({ error: "hub_unavailable" }, { status: 502 })],
  ["a network error", networkDown],
  ["an unreadable 201", () => new Response("<html>", { status: 201 })],
];

class FakeServices {
  /** Every request to GitHub, Samebase, or the hub, in order. */
  readonly sent: Sent[] = [];
  /** The clients on the hub, with the token of each. */
  readonly clients = new Map<string, string>();
  /** Set: the answers of the service in place of the normal ones. */
  github: Answer | undefined;
  samebase: Answer | undefined;
  hub: Answer | undefined;
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
    if (url.startsWith("https://samebase.com")) return this.samebase ?? this.answerSamebase;
    return url.startsWith(ISSUER) ? (this.hub ?? this.answerHub) : undefined;
  }

  private readonly fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
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

  private readonly answerSamebase: Answer = ({ body }) => {
    const clientId = `cl_${this.nextClient++}`;
    const token = `token-of-${clientId}`;
    this.clients.set(clientId, token);
    const { deployment } = Schema.decodeUnknownSync(ClientRequest)(body);
    return Response.json(
      {
        issuer: ISSUER,
        client_id: clientId,
        client_secret: `secret-of-${clientId}`,
        registration_access_token: token,
        registration_client_uri: `${ISSUER}/register/${clientId}`,
        redirect_uri: `https://${deployment}.convex.site/auth/hub/callback`,
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
          url: "https://samebase.com/api/hub-clients",
          authorization: `Bearer ${OIDC_TOKEN}`,
          body: { app: "scout", deployment: DEPLOYMENT, softwareVersion: "abc" },
        },
      ]);
    }),
  );

  test.provider("SAMEBASE_URL replaces the address of Samebase", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      vi.stubEnv("SAMEBASE_URL", "https://samebase.com/preview");
      yield* stack.deploy(client(props()));
      expect(fake.calls("https://samebase.com")).toEqual([
        "POST https://samebase.com/preview/api/hub-clients",
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
        expect(fake.calls("https://samebase.com")).toEqual([]);
        expect(warningsIn(lines)).toHaveLength(1);

        // The hub lifts the suspension, and the same client serves again.
        fake.hub = undefined;
        expect(yield* stack.deploy(client(props()))).toEqual(issued());
        expect(fake.calls("https://samebase.com")).toEqual([]);
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
        expect(fake.calls("https://samebase.com")).toEqual([]);
        expect(warningsIn(lines)).toEqual([
          expect.stringContaining(`${DEPLOYMENT} keeps the saved client`),
        ]);
      }),
    );
  }

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

  test.provider("another deployment asks for a new client without a renewal", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      yield* stack.deploy(client(props()));
      fake.sent.length = 0;
      const moved = yield* stack.deploy(client(props({ deployment: "calm-fox-456" })));
      expect(moved).toEqual(issued("cl_2", "calm-fox-456"));
      expect(fake.calls(ISSUER)).toEqual([]);
    }),
  );

  test.provider("a deploy with the off values asks again", (stack) =>
    Effect.gen(function* () {
      const fake = new FakeServices().install();
      fake.samebase = () => Response.json({ error: "off" }, { status: 404 });
      expect(yield* stack.deploy(client(props()))).toEqual(OFF);
      fake.samebase = undefined;
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
        fake.samebase = answer;
        const { layer, lines } = capturedLogs();
        const again = yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
        expect(again).toEqual(OFF);
        expect(warningsIn(lines)).toEqual([expect.stringContaining("deploys without the hub")]);

        // The next deploy asks again.
        fake.samebase = undefined;
        expect(yield* stack.deploy(client(props()))).toEqual(issued("cl_2"));
      }),
    );

    test.provider(`${name} on the first request gives the off values`, (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        fake.samebase = answer;
        const { layer, lines } = capturedLogs();
        const off = yield* stack.deploy(client(props())).pipe(Effect.provide(layer));
        expect(off).toEqual(OFF);
        expect(warningsIn(lines)).toEqual([expect.stringContaining("deploys without the hub")]);
      }),
    );
  }

  test.provider(
    "a failed request for another deployment gives the off values, and asks again",
    (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        yield* stack.deploy(client(props()));
        fake.samebase = () => Response.json({ error: "hub_unavailable" }, { status: 502 });
        const moved = yield* stack.deploy(client(props({ deployment: "calm-fox-456" })));
        expect(moved).toEqual({ ...OFF, deployment: "calm-fox-456" });
        fake.samebase = undefined;
        const next = yield* stack.deploy(client(props({ deployment: "calm-fox-456" })));
        expect(next).toEqual(issued("cl_2", "calm-fox-456"));
      }),
  );

  for (const [name, answer] of [
    ["a refused request", () => new Response(null, { status: 403 })],
    ["an answer without a token", () => Response.json({ count: 0 })],
    ["a network error", networkDown],
  ] satisfies readonly (readonly [string, Answer])[]) {
    test.provider(`${name} from GitHub gives the off values and asks Samebase nothing`, (stack) =>
      Effect.gen(function* () {
        const fake = new FakeServices().install();
        fake.github = answer;
        const { layer, lines } = capturedLogs();
        expect(yield* stack.deploy(client(props())).pipe(Effect.provide(layer))).toEqual(OFF);
        expect(fake.calls("https://samebase.com")).toEqual([]);
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
        // The split of a stack whose callback needs the deployment: the name is unresolved in the
        // plan of the first deploy, and each later plan has an update that reads the new client.
        const convex = new FakeConvex();
        const fake = new FakeServices(convex.fetch).install();
        const projectId = convex.addProject({ name: "scout", teamId: TEAM });
        const app = Effect.gen(function* () {
          const project = { projectId };
          const created = yield* Convex.Deployment("Preview", {
            project,
            type: "preview",
            name: "pr-1",
          });
          const hub = yield* Convex.SharedHubClient("Client", {
            app: "scout",
            deployment: created.name,
            deploymentType: "preview",
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
        expect(convex.variables.get(name)).toEqual({
          HUB_ISSUER: ISSUER,
          HUB_CLIENT_ID: "cl_1",
          HUB_CLIENT_SECRET: "secret-of-cl_1",
        });
        const writes = () =>
          convex.sent.filter(({ path }) => path.endsWith("/update_environment_variables"));
        expect(writes()).toHaveLength(1);

        yield* stack.deploy(app);
        expect(fake.calls(`${ISSUER}/register/cl_1`)).toHaveLength(1);
        expect(writes()).toHaveLength(1);

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
      fake.samebase = () => Response.json({ error: "off" }, { status: 404 });
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
      fake.samebase = networkDown;
      yield* deploy();
      fake.samebase = echo;
      yield* deploy({ ...props(), deployment: "calm-fox-456" });
      fake.samebase = () => new Response('{"client_secret":"secret-of-cl_1"}', { status: 201 });
      yield* deploy({ ...props(), deployment: "calm-fox-456" });
      fake.github = networkDown;
      yield* deploy({ ...props(), deployment: "calm-fox-456" });
      fake.hub = echo;
      yield* stack.destroy().pipe(Effect.provide(layer));

      expect(warningsIn(lines).length).toBeGreaterThanOrEqual(7);
      for (const secret of [
        "secret-of-cl_1",
        "token-of-cl_1",
        OIDC_TOKEN,
        OIDC_REQUEST_TOKEN,
        "Bearer",
      ]) {
        expect(lines.filter((line) => line.includes(secret))).toEqual([]);
      }
    }),
  );
});
