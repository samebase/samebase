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
import { afterEach, expect, test, vi } from "vite-plus/test";
import { makeMemoryStore } from "../hosts/memory.ts";
import { hub } from "./hub.ts";
import { hubLogLine, TEST_ISSUER, TEST_SERVICE } from "./testing/harness.ts";

class PerRequestTag extends Context.Service<PerRequestTag, string>()("test/PerRequestTag") {}

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

const start = (options: Parameters<typeof hub<never>>[0], values: Record<string, string>) => {
  const asked: string[] = [];
  const run = hub(options).pipe(
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

test("with every secret a Config, the hub reads each when it runs, and a missing one stops it", async () => {
  const options = {
    issuer: TEST_ISSUER,
    connectors: { google },
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
    connectors: { google: { clientId: google.clientId, clientSecret } },
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
    connectors: { google },
    registration: { routes: [] },
    service: TEST_SERVICE,
  };
  const started = start(options, { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" });
  const built = await Effect.runPromise(started.run);
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const failed = await answer(built.fetch, new Request(`${TEST_ISSUER}/.well-known/jwks.json`));
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({ error: "server_error" });
  expect(logged.mock.calls.map(([line]) => hubLogLine(line))).toEqual([
    {
      message: "hub_error",
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
    connectors: { google: { clientId: google.clientId, clientSecret: wrapped } },
    registration: { routes: [] },
    service: TEST_SERVICE,
  };
  const started = start(options, { GOOGLE_CLIENT_ID: "id", IDENTITY_BROKER_KEYS: "{}" });
  const built = await Effect.runPromise(started.run);
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await discovery(built.fetch)).toBe(500);
  expect(logged.mock.calls.map(([line]) => hubLogLine(line))).toEqual([
    {
      message: "hub_error",
      level: "ERROR",
      annotations: {
        category: "start_failed",
        reason: "missing_config",
      },
      spans: {},
    },
  ]);
});

test("a lazy hub gives each request its own per-event context, and keeps the start's configuration and logger", async () => {
  const scopes: Array<Scope.Scope> = [];
  const options = {
    issuer: TEST_ISSUER,
    connectors: {
      google: { clientId: google.clientId, clientSecret: Effect.succeed(Redacted.make("secret")) },
    },
    registration: {
      routes: [
        {
          method: "GET",
          path: "/probe",
          match: "exact",
          template: "/probe",
          // Reads a `Config` in the request, as the keys of `stack` are read, and checks per-event services.
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
              const key = yield* Config.option(Config.String("HUB_PREVIEW_KEY"));
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
    HUB_PREVIEW_KEY: "preview-key",
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
  expect(logged.mock.calls.map(([line]) => hubLogLine(line))).toEqual([
    {
      message: "hub_error",
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
  const options = {
    issuer: TEST_ISSUER,
    connectors: { google: { clientId: google.clientId, clientSecret } },
    registration: { routes: [] },
    service: TEST_SERVICE,
  };
  const cases: ReadonlyArray<{
    readonly config: Parameters<typeof hub<never>>[0];
    readonly expected: string;
  }> = [
    {
      config: { ...options, issuer: "http://example.com" },
      expected: "The issuer must be https, or http on a loopback host for local development",
    },
    {
      config: { ...options, issuer: "https://hub.example.com?" },
      expected: "The issuer must not have a query or fragment",
    },
    {
      config: { ...options, issuer: "https://hub.example.com#" },
      expected: "The issuer must not have a query or fragment",
    },
    {
      config: { ...options, issuer: "https://user:pass@hub.example.com" },
      expected: "The issuer must not have credentials",
    },
    {
      config: { ...options, connectors: {}, keys: clientSecret },
      expected: "At least one connector is required",
    },
    {
      config: { ...options, connections: {} },
      expected: "The connections setting names no provider",
    },
  ];
  for (const { config, expected } of cases) {
    const started = start(config, { GOOGLE_CLIENT_ID: "id", IDENTITY_BROKER_KEYS: "{}" });
    const exit = await Effect.runPromiseExit(started.run);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const message = Cause.prettyErrors(exit.cause)
        .map((error) => error.message)
        .join("; ");
      expect(message).toContain(expected);
    }
  }
  expect(reads).toBe(0);
});
