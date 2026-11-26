// The local conformance stack, for `alchemy dev` only (run.ts starts it): the broker Worker with its
// SQLite Durable Object, and the fixture Worker that creates the suite's clients. The state is a
// local file; nothing here reaches Cloudflare.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import { BROKER_STORE_CLASS_ID } from "../../src/hosts/cloudflare/broker.ts";
import { ADMIN_PORT } from "./addresses.ts";
import ConformanceBroker from "./broker.ts";

export default Alchemy.Stack(
  "identity-broker-effect-conformance",
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const broker = yield* ConformanceBroker;
    const admin = yield* Cloudflare.Worker("Admin", {
      name: "ibe-conformance-admin",
      main: "./test/conformance/admin.ts",
      compatibility: { date: "2026-10-26" },
      dev: { host: "127.0.0.1", port: ADMIN_PORT, strictPort: true },
      env: {
        BROKER_STORE: Cloudflare.DurableObject(BROKER_STORE_CLASS_ID, {
          scriptName: broker.workerName,
        }),
      },
    });
    return { broker: broker.url, admin: admin.url };
  }),
);
