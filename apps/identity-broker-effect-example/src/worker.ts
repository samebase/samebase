// The Worker: the app's handler with the global `fetch` toward the hub. The hub is a Worker on
// workers.dev in the same account, so this Worker has the compatibility flag
// `global_fetch_strictly_public` (alchemy.run.ts); without it each fetch gets error 1042.
import { handle, type Env } from "./app.ts";

export default {
  fetch: (request, env) => handle(request, env, (hubRequest) => fetch(hubRequest)),
} satisfies ExportedHandler<Env>;
