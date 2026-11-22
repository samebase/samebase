import { Config, ConfigProvider, Effect, Exit, Redacted } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { expect, test } from "vite-plus/test";
import { makeMemoryStore } from "../hosts/memory.ts";
import { hub } from "./hub.ts";
import { TEST_ISSUER, TEST_SERVICE } from "./testing/harness.ts";

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

/** The status of a discovery request, which reads no signing key. */
const discovery = (
  fetch: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    HttpServerRequest.HttpServerRequest
  >,
) =>
  Effect.runPromise(
    fetch.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request(`${TEST_ISSUER}/.well-known/openid-configuration`)),
      ),
      Effect.map((response) => HttpServerResponse.toWeb(response).status),
    ),
  );

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
  const keys = Effect.sync(() => {
    reads += 1;
    return Redacted.make("{}");
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
  expect(reads).toBe(0);
  expect(started.asked.toSorted()).toEqual(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
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
  expect(await discovery(built.fetch)).toBe(500);
  expect(await discovery(built.fetch)).toBe(200);
  expect(await discovery(built.fetch)).toBe(200);
  expect(reads).toBe(2);
});
