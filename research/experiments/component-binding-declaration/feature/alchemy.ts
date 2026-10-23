import { fileURLToPath } from "node:url";
import * as Cloudflare from "alchemy/Cloudflare";
import { Random } from "alchemy/Random";
import * as Effect from "effect/Effect";
import { componentName } from "./name.ts";

export const BridgeSecret = Random(`${componentName}/Secret`);

export const Transform = Effect.gen(function* () {
  const secret = yield* BridgeSecret;
  return yield* Cloudflare.Worker(`${componentName}/Transform`, {
    main: fileURLToPath(new URL("./worker.ts", import.meta.url)),
    env: { BRIDGE_SECRET: secret.text },
  });
});
