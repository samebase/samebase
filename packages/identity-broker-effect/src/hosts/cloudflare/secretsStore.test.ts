import { Config, ConfigProvider, Effect, Redacted } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { secretsStoreConfig } from "./secretsStore.ts";

// On workerd a Secrets Store binding is a JS RPC stub: each of its properties is a remote method,
// `call` too. So `get.call(binding)` asks for a method `call`, which the secret does not have.
const rpcMethod = (value: string) =>
  Object.assign(async () => value, {
    call: async () => {
      throw new TypeError('The RPC receiver does not implement the method "call".');
    },
  });

const env = {
  STORE_SECRET: { get: rpcMethod("from the store") },
  PLAIN_SECRET: "plain",
  OTHER: "not a store name",
};
const provider = secretsStoreConfig(
  env,
  new Set(["STORE_SECRET", "PLAIN_SECRET"]),
  ConfigProvider.fromUnknown({ FALLBACK: "fallback" }),
);
const read = (name: string) =>
  Effect.runPromise(
    Config.Redacted(name).pipe(
      Effect.map(Redacted.value),
      Effect.provideService(ConfigProvider.ConfigProvider, provider),
    ),
  );

describe("Secrets Store configuration", () => {
  test("a store binding and a plain string both reach Config", async () => {
    expect(await read("STORE_SECRET")).toBe("from the store");
    expect(await read("PLAIN_SECRET")).toBe("plain");
  });

  test("any other name reads the fallback, never env", async () => {
    expect(await read("FALLBACK")).toBe("fallback");
    await expect(read("OTHER")).rejects.toThrow();
  });
});
