import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { localState } from "alchemy/State";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { createHash } from "node:crypto";
import { BindJobs } from "./binding.ts";

export default Alchemy.Stack(
  "component-binding-explicit",
  { providers: Cloudflare.providers(), state: localState() },
  Effect.gen(function* () {
    const secret = yield* Config.Redacted("EXPERIMENT_SECRET");
    const worker = yield* Cloudflare.Worker("JobWorker", {
      main: new URL("./worker.ts", import.meta.url).href,
      env: { JOB_SECRET: secret },
      dev: { port: 33212, strictPort: true },
    });
    const association = yield* BindJobs({
      target: { deployment: "http://127.0.0.1:33210", componentPath: "jobs" },
      workerFqn: worker.FQN,
      workerUrl: worker.url,
      secret,
      // Alchemy beta.83 Action input hashing does not distinguish Redacted values.
      secretHash: createHash("sha256").update(Redacted.value(secret)).digest("hex"),
      adminKey: yield* Config.Redacted("EXPERIMENT_ADMIN_KEY"),
    });
    return { association };
  }),
);
