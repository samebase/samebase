// The Alchemy stack of the deploy probe: one Worker on workers.dev with one SQLite Durable Object
// and one secret. Run from this folder:
//   IDENTITY_BROKER_EFFECT_PROBE_SECRET=... pnpm exec alchemy deploy --stage dev-spike
//
// The state is in the account's Cloudflare state store (`alchemy-state-store`, version 8, which is
// the version Alchemy beta.85 expects), so this stack neither creates nor upgrades that store. A
// version raise of Alchemy must check that store first: an upgrade blocks every other user of it.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

const accountId = "fe57d01d7ab41f60d00ba1aade20eb33";

export default Alchemy.Stack(
  "identity-broker-effect",
  { providers: Cloudflare.providers(), state: Cloudflare.state({ accountId }) },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    const worker = yield* Cloudflare.Worker("Probe", {
      name: `identity-broker-effect-${stage}`,
      main: "./src/hosts/cloudflare/probe.ts",
      workersDev: true,
      compatibility: { date: "2026-10-28" },
      env: {
        // The class name is the export of `main`. Renaming it moves the object's storage.
        HUB: Cloudflare.DurableObject("Hub", { storage: "sqlite" }),
        PROBE_SECRET: Config.Redacted("IDENTITY_BROKER_EFFECT_PROBE_SECRET"),
      },
    });
    return { url: worker.url };
  }),
);
