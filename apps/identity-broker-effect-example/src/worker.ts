// The Worker, in Alchemy's Effect form: the app's handler with the global `fetch` toward the hub.
// The hub is a Worker on workers.dev in the same account, so this Worker has the compatibility flag
// `global_fetch_strictly_public`; without it each fetch gets error 1042. The stack attaches the
// sign-in bindings (alchemy.run.ts), so this file runs nothing of the hub client.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Config, Effect } from "effect";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { handle } from "./app.ts";

declare global {
  // Alchemy reads `main: import.meta.url` in Node and in the bundle; workerd gives each module its
  // URL, but @cloudflare/workers-types does not declare it.
  interface ImportMeta {
    url: string;
  }
}

/** The Worker's script name, which the hub client's return address names too. */
export const siteName = (stage: string) => `identity-broker-effect-example-${stage}`;

/** The bindings of the app, read on the first request of an isolate. */
const bindings = Effect.gen(function* () {
  return {
    IDENTITY_HUB_ISSUER: yield* Config.String("IDENTITY_HUB_ISSUER"),
    IDENTITY_HUB_CLIENT_ID: yield* Config.String("IDENTITY_HUB_CLIENT_ID"),
    IDENTITY_HUB_CLIENT_SECRET: yield* Config.String("IDENTITY_HUB_CLIENT_SECRET"),
    SESSION_SECRET: yield* Config.String("SESSION_SECRET"),
    REPOSITORY_ID: yield* Config.String("REPOSITORY_ID"),
  };
});

/** The app hands back a Web `Response`; `HttpServerResponse.raw` passes it on unchanged. */
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
    const env = yield* Effect.cached(bindings.pipe(Effect.orDie));
    return {
      fetch: Effect.gen(function* () {
        const request = yield* Cloudflare.Request;
        const app = yield* env;
        const response = yield* Effect.promise(() =>
          handle(request, app, (hubRequest) => fetch(hubRequest)),
        );
        return HttpServerResponse.raw(response);
      }),
    };
  }),
) {}
