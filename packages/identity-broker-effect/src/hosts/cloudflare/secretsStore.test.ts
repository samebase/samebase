import { Config, ConfigProvider, Effect, Redacted } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { secretsStoreConfig } from "./secretsStore.ts";

const env = {
  STORE_SECRET: { get: async () => "from the store" },
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
