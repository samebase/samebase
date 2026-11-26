import {
  Cause,
  Config,
  ConfigProvider,
  Context,
  Effect,
  Exit,
  Option,
  Redacted,
  Scope,
} from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { afterEach, expect, expectTypeOf, test, vi } from "vite-plus/test";
import * as Integrations from "../integrations/index.ts";
import type { IntegrationSpec } from "../integrations/providers.ts";
import { makeMemoryStore } from "../hosts/memory.ts";
import * as Connectors from "./connectors/index.ts";
import type { ConnectorSpec, Secret } from "./connectors/types.ts";
import { identityBroker } from "./identityBroker.ts";
import { brokerLogLine, TEST_ISSUER, TEST_SERVICE } from "./testing/harness.ts";

class PerRequestTag extends Context.Service<PerRequestTag, string>()("test/PerRequestTag") {}
class SecretsA extends Context.Service<SecretsA, string>()("test/SecretsA") {}
class SecretsB extends Context.Service<SecretsB, string>()("test/SecretsB") {}

/** A configuration provider over `values` that records each name it is asked for. */
const recordingProvider = (values: Record<string, string>, asked: string[]) =>
  ConfigProvider.make((path) =>
    Effect.sync(() => {
      const name = path.join("_");
      asked.push(name);
      const value = values[name];
      return value === undefined ? undefined : ConfigProvider.makeValue(value);
    }),
  );

const google = {
  clientId: Config.Redacted("GOOGLE_CLIENT_ID"),
  clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
};

type Options = Parameters<typeof identityBroker<ConnectorSpec, IntegrationSpec, Secret>>[0];

const start = (options: Options, values: Record<string, string>) => {
  const asked: string[] = [];
  const run = identityBroker(options).pipe(
    Effect.provide(makeMemoryStore().layer),
    Effect.provideService(ConfigProvider.ConfigProvider, recordingProvider(values, asked)),
  );
  return { asked, run };
};

type Fetch = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  HttpServerRequest.HttpServerRequest
>;

/** The answer of `fetch` to `request`. */
const answer = (fetch: Fetch, request: Request) =>
  Effect.runPromise(
    fetch.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(request),
      ),
      Effect.map((response) => HttpServerResponse.toWeb(response)),
    ),
  );

/** The status of a discovery request, which reads no signing key. */
const discovery = async (fetch: Fetch) =>
  (await answer(fetch, new Request(`${TEST_ISSUER}/.well-known/openid-configuration`))).status;

afterEach(() => {
  vi.restoreAllMocks();
});

test("with every secret a Config, the broker reads each when it runs, and a missing one stops it", async () => {
  const options = {
    issuer: TEST_ISSUER,
    connectors: [Connectors.google(google)],
    registration: { routes: [] },
    service: TEST_SERVICE,
  };
  const values = {
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    IDENTITY_BROKER_KEYS: "{}",
  };
  const complete = start(options, values);
  expect(Exit.isSuccess(await Effect.runPromiseExit(complete.run))).toBe(true);
  expect(new Set(complete.asked)).toEqual(new Set(Object.keys(values)));

  const missing = start(options, { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" });
  expect(Exit.isFailure(await Effect.runPromiseExit(missing.run))).toBe(true);
});

test("with one other secret, nothing is built before the first request, and the build is kept", async () => {
  let reads = 0;
  const clientSecret = Effect.sync(() => {
    reads += 1;
    return Redacted.make("secret");
  });
  const options = {
    issuer: TEST_ISSUER,
    connectors: [Connectors.google({ clientId: google.clientId, clientSecret })],
    registration: { routes: [] },
    service: TEST_SERVICE,
  };
  const started = start(options, { GOOGLE_CLIENT_ID: "id", IDENTITY_BROKER_KEYS: "{}" });
  const built = await Effect.runPromise(started.run);
  expect(reads).toBe(0);
  // The default keys too: on Cloudflare this read at the start is what declares the binding.
  expect(started.asked.toSorted()).toEqual(["GOOGLE_CLIENT_ID", "IDENTITY_BROKER_KEYS"]);
  expect(await discovery(built.fetch)).toBe(200);
  expect(await discovery(built.fetch)).toBe(200);
  expect(reads).toBe(1);
});

test("a failed build answers 500 with a fixed reason code, logs no error text, and builds again", async () => {
  let reads = 0;
  const sensitive = "super-secret-value https://callback.example/cb?code=abc";
  const keys = Effect.suspend(() => {
    reads += 1;
    return reads === 1
      ? Effect.fail(new Error(`unreadable ${sensitive}`))
      : Effect.succeed(Redacted.make("{}"));
  });
  const options = {
    issuer: TEST_ISSUER,
    keys,
    connectors: [Connectors.google(google)],
    registration: { routes: [] },
    service: TEST_SERVICE,
  };
  const started = start(options, { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" });
  const built = await Effect.runPromise(started.run);
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const failed = await answer(built.fetch, new Request(`${TEST_ISSUER}/.well-known/jwks.json`));
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({ error: "server_error" });
  expect(logged.mock.calls.map(([line]) => brokerLogLine(line))).toEqual([
    {
      message: "broker_error",
      level: "ERROR",
      annotations: {
        category: "start_failed",
        reason: "secret_failed",
      },
      spans: {},
    },
  ]);
  expect(String(logged.mock.calls[0]?.[0])).not.toContain("super-secret-value");
  expect(String(logged.mock.calls[0]?.[0])).not.toContain("code=abc");
  expect(await discovery(built.fetch)).toBe(200);
  expect(await discovery(built.fetch)).toBe(200);
  expect(reads).toBe(2);
});

test("a wrapped Config that is missing logs reason missing_config on a lazy build", async () => {
  const wrapped = Config.Redacted("MISSING_WRAPPED_SECRET").pipe(Effect.map((value) => value));
  const options = {
    issuer: TEST_ISSUER,
    connectors: [Connectors.google({ clientId: google.clientId, clientSecret: wrapped })],
    registration: { routes: [] },
    service: TEST_SERVICE,
  };
  const started = start(options, { GOOGLE_CLIENT_ID: "id", IDENTITY_BROKER_KEYS: "{}" });
  const built = await Effect.runPromise(started.run);
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await discovery(built.fetch)).toBe(500);
  expect(logged.mock.calls.map(([line]) => brokerLogLine(line))).toEqual([
    {
      message: "broker_error",
      level: "ERROR",
      annotations: {
        category: "start_failed",
        reason: "missing_config",
      },
      spans: {},
    },
  ]);
});

test("a lazy broker gives each request its own per-event context, and keeps the start's configuration and logger", async () => {
  const scopes: Array<Scope.Scope> = [];
  const options = {
    issuer: TEST_ISSUER,
    connectors: [
      Connectors.google({
        clientId: google.clientId,
        clientSecret: Effect.succeed(Redacted.make("secret")),
      }),
    ],
    registration: {
      routes: [
        {
          method: "GET",
          path: "/probe",
          match: "exact",
          template: "/probe",
          // Reads a `Config` in the request, as `keys` reads its keys, and checks per-event services.
          handler: () =>
            Effect.gen(function* () {
              const request = yield* Effect.serviceOption(HttpServerRequest.HttpServerRequest);
              const tag = yield* Effect.serviceOption(PerRequestTag);
              const scope = yield* Effect.serviceOption(Scope.Scope);
              if (Option.isSome(scope)) {
                scopes.push(scope.value);
              }
              const span = yield* Effect.currentSpan.pipe(Effect.option);
              const parentSpan = Option.flatMap(span, ({ parent }) => parent);
              const key = yield* Config.option(Config.String("BROKER_PREVIEW_KEY"));
              return Response.json({
                url: Option.getOrNull(Option.map(request, ({ url }) => url)),
                tag: Option.getOrNull(tag),
                parentSpan: Option.getOrNull(
                  Option.map(parentSpan, (parent) => (parent._tag === "Span" ? parent.name : null)),
                ),
                key: Option.getOrNull(key),
              });
            }).pipe(Effect.orDie),
        },
        {
          method: "GET",
          path: "/defect",
          match: "exact",
          template: "/defect",
          handler: () => Effect.die(new Error("probe")),
        },
      ],
    },
    service: TEST_SERVICE,
  } as const;
  const started = start(options, {
    GOOGLE_CLIENT_ID: "id",
    IDENTITY_BROKER_KEYS: "{}",
    BROKER_PREVIEW_KEY: "preview-key",
  });
  const built = await Effect.runPromise(started.run);

  const runEvent = (n: number) =>
    Effect.runPromise(
      Effect.scoped(
        built.fetch.pipe(
          Effect.withSpan(`req-${n}`),
          Effect.provideService(PerRequestTag, `event-${n}`),
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            HttpServerRequest.fromWeb(new Request(`${TEST_ISSUER}/probe?n=${n}`)),
          ),
          Effect.map((response) => HttpServerResponse.toWeb(response)),
        ),
      ),
    );

  await runEvent(1);
  const second = await runEvent(2);
  expect(await second.json()).toEqual({
    url: "/probe?n=2",
    tag: "event-2",
    parentSpan: "req-2",
    key: "preview-key",
  });
  expect(scopes).toHaveLength(2);
  expect(scopes[0]).not.toBe(scopes[1]);

  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  expect((await answer(built.fetch, new Request(`${TEST_ISSUER}/defect`))).status).toBe(500);
  expect(logged.mock.calls.map(([line]) => brokerLogLine(line))).toEqual([
    {
      message: "broker_error",
      level: "ERROR",
      annotations: { route: "/defect", category: "defect" },
      spans: {},
    },
  ]);
});

test("with a lazy secret, wrong static settings stop the start with specific messages before the secret is read", async () => {
  let reads = 0;
  const clientSecret = Effect.sync(() => {
    reads += 1;
    return Redacted.make("secret");
  });
  const googleSpec = Connectors.google({ clientId: google.clientId, clientSecret });
  const options = {
    issuer: TEST_ISSUER,
    connectors: [googleSpec],
    registration: { routes: [] },
    service: TEST_SERVICE,
  };
  const integration = (name: string, resource: string) =>
    Integrations.oauth({
      name,
      resource,
      issuer: "https://api.example.com",
      authorizationEndpoint: "https://api.example.com/authorize",
      tokenEndpoint: "https://api.example.com/token",
      clientId: google.clientId,
      clientSecret,
    });
  const cases: ReadonlyArray<{ readonly config: Options; readonly expected: string }> = [
    {
      config: { ...options, issuer: "http://example.com" },
      expected: "The issuer must be https, or http on a loopback host for local development",
    },
    {
      config: { ...options, issuer: "https://broker.example.com?" },
      expected: "The issuer must not have a query or fragment",
    },
    {
      config: { ...options, issuer: "https://broker.example.com#" },
      expected: "The issuer must not have a query or fragment",
    },
    {
      config: { ...options, issuer: "https://user:pass@broker.example.com" },
      expected: "The issuer must not have credentials",
    },
    {
      config: { ...options, connectors: [], keys: clientSecret },
      expected: "At least one connector is required",
    },
    {
      config: { ...options, connectors: [googleSpec, googleSpec] },
      expected: "Connector names must be unique",
    },
    {
      config: {
        ...options,
        connectors: [
          Connectors.oidc({
            name: "Okta",
            label: "Okta",
            issuer: "https://okta.example.com",
            clientId: google.clientId,
            clientSecret,
          }),
        ],
      },
      expected: 'Connector "Okta" has a name that is not [a-z0-9-]+',
    },
    {
      config: {
        ...options,
        connectors: [
          Connectors.oidc({
            name: "okta",
            provider: "Okta",
            label: "Okta",
            issuer: "https://okta.example.com",
            clientId: google.clientId,
            clientSecret,
          }),
        ],
      },
      expected: 'Connector "okta" has a provider that is not [a-z0-9-]+',
    },
    {
      config: {
        ...options,
        connectors: [
          Connectors.oidc({
            name: "okta",
            label: "   ",
            issuer: "https://okta.example.com",
            clientId: google.clientId,
            clientSecret,
          }),
        ],
      },
      expected: 'Connector "okta" must have a non-empty label',
    },
    {
      config: {
        ...options,
        connectors: [
          Connectors.oidc({
            name: "okta",
            label: "Okta",
            issuer: "http://127.0.0.1:8080",
            clientId: google.clientId,
            clientSecret,
          }),
        ],
      },
      expected: 'Connector "okta" issuer must be https',
    },
    {
      config: {
        ...options,
        connectors: [
          Connectors.oidc({
            name: "okta",
            label: "Okta",
            issuer: "https://okta.example.com",
            scopes: ["email"],
            clientId: google.clientId,
            clientSecret,
          }),
        ],
      },
      expected: 'OIDC connector "okta" must include the "openid" scope',
    },
    {
      config: {
        ...options,
        connectors: [
          googleSpec,
          Connectors.oidc({
            name: "google-workspace",
            provider: "google",
            label: "Google Workspace",
            issuer: "https://workspace.example.com",
            clientId: google.clientId,
            clientSecret,
          }),
        ],
      },
      expected: 'The connectors of provider "google" have two issuers',
    },
    {
      config: { ...options, integrations: [] },
      expected: "The integrations setting names no provider",
    },
    {
      config: { ...options, integrations: [integration("MyAPI", "https://api.example.com")] },
      expected: 'Integration "MyAPI" has a name that is not [a-z0-9-]+',
    },
    {
      config: {
        ...options,
        integrations: [
          integration("api", "https://api.example.com"),
          integration("api", "https://api.example.com/v2"),
        ],
      },
      expected: "Integration names must be unique",
    },
    {
      config: {
        ...options,
        integrations: [
          integration("api", "https://api.example.com"),
          integration("api-two", "https://api.example.com"),
        ],
      },
      expected: "Integration resources must be unique",
    },
    {
      config: { ...options, integrations: [integration("api", "https://api.example.com/#v1")] },
      expected: 'Integration "api" has a resource that is not an absolute URI with no fragment',
    },
    {
      config: { ...options, integrations: [integration("api", "https://api.example.com/v1 test")] },
      expected: 'Integration "api" has a resource that is not an absolute URI with no fragment',
    },
    {
      config: {
        ...options,
        integrations: [
          Integrations.oauth({
            name: "api",
            resource: "https://api.example.com",
            issuer: "https://api.example.com",
            authorizationEndpoint: "http://127.0.0.1:8080/authorize",
            tokenEndpoint: "https://api.example.com/token",
            clientId: google.clientId,
            clientSecret,
          }),
        ],
      },
      expected: 'Integration "api" authorizationEndpoint must be https',
    },
  ];
  // Empty Config values prove static checks fail before any Config secret is read.
  for (const { config, expected } of cases) {
    const started = start(config, {});
    const exit = await Effect.runPromiseExit(started.run);
    expect(Exit.isFailure(exit)).toBe(true);
    expect(started.asked).toEqual([]);
    if (Exit.isFailure(exit)) {
      const message = Cause.prettyErrors(exit.cause)
        .map((error) => error.message)
        .join("; ");
      expect(message).toContain(expected);
    }
  }
  expect(reads).toBe(0);
});

test("a lazy broker of any OIDC and OAuth connector and integration names them in order in discovery", async () => {
  const secret = Effect.succeed(Redacted.make("secret"));
  const started = start(
    {
      issuer: TEST_ISSUER,
      connectors: [
        Connectors.oidc({
          name: "okta",
          label: "Okta",
          issuer: "https://okta.example.com",
          clientId: google.clientId,
          clientSecret: secret,
        }),
        Connectors.oauth({
          name: "forge",
          label: "Forge",
          issuer: "https://forge.example.com",
          scopes: ["read:user"],
          identity: async () => ({ upstreamId: "1" }),
          clientId: google.clientId,
          clientSecret: google.clientSecret,
        }),
      ],
      integrations: [
        Integrations.oauth({
          name: "api",
          resource: "https://api.example.com",
          issuer: "https://api.example.com",
          authorizationEndpoint: "https://api.example.com/authorize",
          tokenEndpoint: "https://api.example.com/token",
          revocationEndpoint: "https://api.example.com/revoke",
          clientId: google.clientId,
          clientSecret: google.clientSecret,
        }),
      ],
      registration: { routes: [] },
      service: TEST_SERVICE,
    },
    { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", IDENTITY_BROKER_KEYS: "{}" },
  );
  const built = await Effect.runPromise(started.run);
  const response = await answer(
    built.fetch,
    new Request(`${TEST_ISSUER}/.well-known/openid-configuration`),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    connectors_supported: ["okta", "forge"],
    revocation_endpoint: `${TEST_ISSUER}/revoke`,
  });
});

test("secrets that need two different services in one connectors array are each read once", async () => {
  const reads: string[] = [];
  const readFrom = (service: typeof SecretsA | typeof SecretsB) =>
    Effect.gen(function* () {
      const value = yield* service;
      reads.push(value);
      return Redacted.make(value);
    });
  const asked: string[] = [];
  const built = await Effect.runPromise(
    identityBroker({
      issuer: TEST_ISSUER,
      connectors: [
        Connectors.google({ clientId: google.clientId, clientSecret: readFrom(SecretsA) }),
        Connectors.oidc({
          name: "okta",
          label: "Okta",
          issuer: "https://okta.example.com",
          clientId: google.clientId,
          clientSecret: readFrom(SecretsB),
        }),
      ],
      registration: { routes: [] },
      service: TEST_SERVICE,
    }).pipe(
      Effect.provide(makeMemoryStore().layer),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        recordingProvider({ GOOGLE_CLIENT_ID: "id", IDENTITY_BROKER_KEYS: "{}" }, asked),
      ),
    ),
  );
  expectTypeOf(built.fetch).toEqualTypeOf<
    Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      never,
      HttpServerRequest.HttpServerRequest | SecretsA | SecretsB
    >
  >();
  const status = async () =>
    (
      await answer(
        built.fetch.pipe(
          Effect.provideService(SecretsA, "a"),
          Effect.provideService(SecretsB, "b"),
        ),
        new Request(`${TEST_ISSUER}/.well-known/openid-configuration`),
      )
    ).status;
  expect(await status()).toBe(200);
  expect(await status()).toBe(200);
  expect(reads).toEqual(["a", "b"]);
});
