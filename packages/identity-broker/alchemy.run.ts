// The Alchemy stack of the test broker: the Worker and its SQLite Durable Object of
// src/hosts/cloudflare/broker.ts, as src/broker.ts declares them. Run from this folder, with each secret
// read from a file into its environment variable:
//   IDENTITY_BROKER_KEYS="$(cat <file>)" GOOGLE_CLIENT_ID=... pnpm exec alchemy deploy --stage dev-spike
//
// The state is in the account's Cloudflare state store (`alchemy-state-store`, version 8, which is
// the version Alchemy beta.85 expects), so this stack neither creates nor upgrades that store. A
// version raise of Alchemy must check that store first: an upgrade blocks every other user of it.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import Broker from "./src/broker.ts";

const accountId = "fe57d01d7ab41f60d00ba1aade20eb33";

export default Alchemy.Stack(
  "identity-broker-effect",
  { providers: Cloudflare.providers(), state: Cloudflare.state({ accountId }) },
  Effect.gen(function* () {
    const worker = yield* Broker;
    return { url: worker.url };
  }),
);
