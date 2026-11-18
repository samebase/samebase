// The Alchemy stack of the test hub: one Worker on workers.dev with one SQLite Durable Object.
// Run from this folder, with each secret read from a file into its environment variable:
//   IDENTITY_BROKER_KEYS="$(cat <file>)" GOOGLE_CLIENT_ID=... pnpm exec alchemy deploy --stage dev-spike
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
    const name = `identity-broker-effect-${stage}`;
    const worker = yield* Cloudflare.Worker("Hub", {
      name,
      main: "./src/hosts/cloudflare/hub.ts",
      workersDev: true,
      // The hub reads the verification file of an app that can be another Worker on workers.dev in
      // this account. Without the flag Cloudflare answers such a fetch with error 1042.
      compatibility: { date: "2026-10-28", flags: ["global_fetch_strictly_public"] },
      // A callback URL carries the provider's code and state, so no invocation log records it. The
      // hub writes only its own allow-listed lines (src/core/router.ts).
      observability: { enabled: true, logs: { enabled: true, invocationLogs: false } },
      // The object runs the new rules right after a deploy, not up to 5 minutes later.
      codeUpdateStrategy: { mode: "immediate" },
      env: {
        // The class name is the export of `main`. Renaming it, or this binding, moves the storage.
        HUB: Cloudflare.DurableObject("Hub", { storage: "sqlite" }),
        ISSUER: `https://${name}.pfp.workers.dev`,
        // samebase/samebase and the samebase organization: public ids.
        ALLOWED_REPOSITORIES: JSON.stringify([
          { repositoryId: "1021726325", ownerId: "285392744" },
        ]),
        IDENTITY_BROKER_KEYS: Config.Redacted("IDENTITY_BROKER_KEYS"),
        GOOGLE_CLIENT_ID: Config.Redacted("GOOGLE_CLIENT_ID"),
        GOOGLE_CLIENT_SECRET: Config.Redacted("GOOGLE_CLIENT_SECRET"),
        AUTH_GITHUB_CLIENT_ID: Config.Redacted("AUTH_GITHUB_CLIENT_ID"),
        AUTH_GITHUB_CLIENT_SECRET: Config.Redacted("AUTH_GITHUB_CLIENT_SECRET"),
      },
    });
    return { url: worker.url };
  }),
);
