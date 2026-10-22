import { fileURLToPath } from "node:url";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Redacted from "effect/Redacted";

export function provision(componentPath: string, secret: string) {
  return Cloudflare.Worker(componentPath, {
    main: fileURLToPath(new URL("./worker.ts", import.meta.url)),
    env: { SECRET: Redacted.make(secret) },
    dev: { host: "127.0.0.1", port: 33412, strictPort: true },
  });
}
