import { Config, ConfigProvider, Effect, Exit, Option, Redacted } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { makeMemoryStore } from "../hosts/memory.ts";
import { hub } from "./hub.ts";
import { hubLogLine, TEST_ISSUER, TEST_SERVICE } from "./testing/harness.ts";

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

test("a failed build answers 500 and the next request builds again", async () => {
  let reads = 0;
  const keys = Effect.suspend(() => {
    reads += 1;
    return reads === 1 ? Effect.fail("unreadable") : Effect.succeed(Redacted.make("{}"));
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
        reason: expect.stringMatching(/^The hub cannot start: /),
      },
      spans: {},
    },
  ]);
  expect(await discovery(built.fetch)).toBe(200);
  expect(await discovery(built.fetch)).toBe(200);
  expect(reads).toBe(2);
});

test("a lazy hub gives each request its own request, and keeps the start's configuration and logger", async () => {
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
          // Reads a `Config` in the request, as the keys of `stack` are read.
          handler: () =>
            Effect.gen(function* () {
              const request = yield* Effect.serviceOption(HttpServerRequest.HttpServerRequest);
              const key = yield* Config.option(Config.String("HUB_PREVIEW_KEY"));
              return Response.json({
                url: Option.getOrNull(Option.map(request, ({ url }) => url)),
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
  await answer(built.fetch, new Request(`${TEST_ISSUER}/probe?n=1`));
  const second = await answer(built.fetch, new Request(`${TEST_ISSUER}/probe?n=2`));
  expect(await second.json()).toEqual({ url: "/probe?n=2", key: "preview-key" });

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

test("with a lazy secret, wrong static settings stop the start before the secret is read", async () => {
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
  for (const wrong of [
    { ...options, issuer: "http://example.com" },
    { ...options, connectors: {}, keys: clientSecret },
    { ...options, connections: {} },
  ]) {
    const started = start(wrong, { GOOGLE_CLIENT_ID: "id", IDENTITY_BROKER_KEYS: "{}" });
    expect(Exit.isFailure(await Effect.runPromiseExit(started.run))).toBe(true);
  }
  expect(reads).toBe(0);
});
