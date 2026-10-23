import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import { localState } from "alchemy/State/LocalState";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { z } from "zod";
import { Deployment, deploymentProvider } from "./deployment.ts";

const phase = z
  .enum(["initial", "changed", "secret-only", "invalid"])
  .parse(process.env.EXPERIMENT_PHASE);
const secret = Redacted.make(z.string().min(1).parse(process.env.EXPERIMENT_SECRET));

export default Alchemy.Stack(
  "component-native-bindings",
  { providers: Layer.mergeAll(Cloudflare.providers(), deploymentProvider), state: localState() },
  Effect.gen(function* () {
    const deployment = yield* Deployment("App", {});
    const worker = yield* Cloudflare.Worker("Processor", {
      main: "./job/worker.ts",
      env: { SECRET: secret },
      dev: { host: "127.0.0.1", port: 33442, strictPort: true },
    });
    yield* deployment.bind(worker.FQN, {
      componentPath: "jobs",
      resource: { fqn: worker.FQN, type: worker.Type },
      env: {
        WORKER_URL:
          phase === "invalid"
            ? "not-a-url"
            : worker.url.pipe(
                Output.map((url) => {
                  if (url === undefined) throw new Error("Worker has no URL");
                  return phase === "initial" ? url : `${url}?revision=2`;
                }),
              ),
        WORKER_SECRET: secret,
      },
    });
    // This second binding is removed on the next apply. No Convex schema needs it.
    if (phase === "initial") {
      yield* deployment.bind("marker", {
        componentPath: "jobs",
        resource: { fqn: worker.FQN, type: worker.Type },
        env: { MARKER: "first-apply" },
      });
    }
    return { associations: deployment.associations, workerUrl: worker.url };
  }),
);
