// IdentityBroker.providers() beside a host's collection that holds Random's provider too.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { State } from "alchemy/State";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { afterEach, expect, vi } from "vite-plus/test";
import * as IdentityBroker from "./index.ts";

const { test } = Test.make({
  providers: Layer.mergeAll(Cloudflare.providers(), IdentityBroker.providers()),
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test.provider("a stack with Cloudflare's providers makes the key and the client", (stack) =>
  Effect.gen(function* () {
    // No OIDC token and no broker, so the client takes the off values and sends no request.
    vi.stubGlobal("fetch", () => Promise.reject(new Error("no request expected")));
    vi.stubEnv("GITHUB_ACTIONS", "");
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", "");
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "");
    const app = Effect.gen(function* () {
      const key = yield* IdentityBroker.registrationKey("Key", { stage: stack.stage });
      const client = yield* IdentityBroker.Client("Client", {
        app: "scout",
        broker: { issuer: "https://broker.test" },
        redirectUris: ["https://scout.test/auth/broker/callback"],
        deploymentType: "preview",
        connectors: ["google"],
      });
      return { key, clientId: client.clientId };
    });

    const { key, clientId } = yield* stack.deploy(app);
    expect(clientId).toBe(IdentityBroker.DISABLED);
    const text = Redacted.isRedacted(key) ? Redacted.value(key) : "";
    expect(text).toMatch(/^[0-9a-f]{64}$/);
    const types = yield* Effect.gen(function* () {
      const state = yield* yield* State;
      const rows = yield* Effect.forEach(["Key", "Client"], (fqn) =>
        state.get({ stack: stack.name, stage: stack.stage, fqn }),
      );
      return rows.map((row) =>
        row !== undefined && "resourceType" in row ? row.resourceType : "",
      );
    }).pipe(Effect.provide(stack.state));
    expect(types).toEqual(["Alchemy.Random", "IdentityBroker.Client"]);
    yield* stack.destroy();
  }),
);
