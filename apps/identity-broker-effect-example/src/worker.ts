// The Worker, in Alchemy's Effect form. Its constructor provides the two services; their Layers
// bring the hub client, the session secret, and the Worker's bindings for them into the deploy.
//
// The hub is a Worker on workers.dev in the same account, so this Worker has the compatibility flag
// `global_fetch_strictly_public`; without it each fetch to the hub gets error 1042.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Effect, Layer } from "effect";
import { app } from "./app.ts";
import { HubClient } from "./hub-client.ts";
import { Session } from "./session.ts";

declare global {
  // Alchemy reads `main: import.meta.url` in Node and in the bundle; workerd gives each module its
  // URL, but @cloudflare/workers-types does not declare it.
  interface ImportMeta {
    url: string;
  }
}

const siteName = (stage: string) => `identity-broker-effect-example-${stage}`;
/** The workers.dev subdomain of the Cloudflare account fe57d01d7ab41f60d00ba1aade20eb33. */
const WORKERS_DEV = "pfp.workers.dev";

export default class Site extends Cloudflare.Worker<Site>()(
  "Site",
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    return {
      name: siteName(stage),
      main: import.meta.url,
      workersDev: true,
      compatibility: { date: "2026-10-28", flags: ["global_fetch_strictly_public"] },
    };
  }),
  Effect.gen(function* () {
    // Built once per isolate; the request handler only routes.
    const services = yield* Effect.context<HubClient | Session>();
    return { fetch: app.pipe(Effect.provide(services)) };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        // The return address needs no output of this Worker: the hub client comes first.
        HubClient.layer((stage) => `https://${siteName(stage)}.${WORKERS_DEV}/callback`),
        Session.layer,
      ),
    ),
  ),
) {}
