import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { toPath } from "alchemy/FQN";
import * as Namespace from "alchemy/Namespace";
import * as Output from "alchemy/Output";
import { localState } from "alchemy/State/LocalState";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { z } from "zod";
import { componentPath } from "./component-path.ts";
import { components } from "./convex/_generated/api.js";
import { Deployment, deploymentProvider } from "./deployment.ts";
import { Processor } from "./job/alchemy.ts";
import { components as processingComponents } from "./processing/_generated/api.ts";
import { archiveAddress } from "./shared.run.ts";

const phase = z
  .enum([
    "initial",
    "changed",
    "secret-only",
    "renamed",
    "unlinked",
    "missing-parent",
    "invalid",
    "recovered",
  ])
  .parse(process.env.EXPERIMENT_PHASE);
const secret = Redacted.make(z.string().min(1).parse(process.env.EXPERIMENT_SECRET));

export default Alchemy.Stack(
  "component-native-bindings",
  { providers: Layer.mergeAll(Cloudflare.providers(), deploymentProvider), state: localState() },
  Effect.gen(function* () {
    const deployment = yield* Deployment("App", {});
    const parent = componentPath(components.processing);
    // A slash in a logical ID must not make this root resource a namespace member.
    yield* Cloudflare.R2.Bucket("Processing/Lookalike");
    const worker = yield* Namespace.push(
      "Processing",
      Effect.gen(function* () {
        yield* Cloudflare.R2.Bucket("Receipts");
        yield* deployment.bind("processing", {
          componentPath: parent.join("/"),
          namespace: phase === "unlinked" ? null : toPath(yield* Namespace.CurrentNamespace),
          uses: [],
          env: {},
        });
        return yield* Namespace.push(
          "Jobs",
          Effect.gen(function* () {
            const worker = yield* Processor({
              secret,
              archive: Cloudflare.R2.Bucket.ref(archiveAddress.fqn, {
                stack: archiveAddress.stack,
                stage: archiveAddress.stage,
              }),
            });
            yield* deployment.bind("jobs", {
              componentPath: componentPath(
                processingComponents.jobs,
                phase === "missing-parent" ? [] : parent,
              ).join("/"),
              namespace: phase === "unlinked" ? null : toPath(yield* Namespace.CurrentNamespace),
              uses: [archiveAddress],
              env: {
                JOBS_WORKER_URL:
                  phase === "invalid"
                    ? "not-a-url"
                    : worker.url.pipe(
                        Output.map((url) => {
                          if (url === undefined) throw new Error("Worker has no URL");
                          return phase === "initial" ? url : `${url}?revision=2`;
                        }),
                      ),
                JOBS_WORKER_SECRET: secret,
              },
            });
            return worker;
          }),
        );
      }),
    );
    if (phase === "initial") {
      yield* deployment.bind("marker", {
        componentPath: parent.join("/"),
        namespace: null,
        uses: [],
        env: { JOBS_MARKER: "first-apply" },
      });
    }
    return { associations: deployment.associations, workerUrl: worker.url };
  }),
);
