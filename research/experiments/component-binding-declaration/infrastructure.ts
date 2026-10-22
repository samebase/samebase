import { fileURLToPath } from "node:url";
import * as Convex from "@samebase/alchemy-convex";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Namespace from "alchemy/Namespace";
import * as Output from "alchemy/Output";
import { Stack, type StackSpec } from "alchemy/Stack";
import { inMemoryState } from "alchemy/State/InMemoryState";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { rootKeys } from "./binding.ts";
import { feature } from "./host.ts";

export async function construct(secret: string, localWorkerUrl: string) {
  const stack: Omit<StackSpec<unknown>, "output"> = {
    name: "ComponentDeclarationExperiment",
    stage: "local",
    resources: {},
    bindings: {},
    actions: {},
  };
  const program = Effect.gen(function* () {
    const worker = yield* Namespace.push(
      feature.name,
      Cloudflare.Worker("Transform", {
        main: fileURLToPath(new URL(feature.definition.workerEntry, import.meta.url)),
        env: { [feature.definition.binding.workerSecret]: Redacted.make(secret) },
      }),
    );
    const deployment = yield* Convex.Deployment("Site", {
      project: { projectId: 0 },
      type: "dev",
      name: "declaration-experiment",
      rootDir: ".",
      source: "./convex",
      env: {
        [rootKeys.url]: worker.url.pipe(
          Output.map((url) => {
            if (!url) throw new Error("The Worker has no URL");
            return url;
          }),
        ),
        [rootKeys.secret]: Redacted.make(secret),
      },
    });
    return {
      worker,
      deployment,
      association: {
        version: 1,
        componentPath: feature.name,
        deploymentFqn: deployment.FQN,
        resources: [{ fqn: worker.FQN, type: worker.Type }],
        binding: {
          componentUrl: feature.definition.binding.componentUrl,
          componentSecret: feature.definition.binding.componentSecret,
          workerSecret: feature.definition.binding.workerSecret,
        },
      },
    };
  });
  const noProviders = {
    kind: "ProviderCollection" as const,
    providers: {},
    get: () => {
      throw new Error("This experiment does not execute provider operations");
    },
  };
  const declared = await Effect.runPromise(
    program.pipe(
      Effect.provideService(Stack, stack),
      Effect.provideService(Cloudflare.Providers, noProviders),
      Effect.provideService(Convex.Providers, noProviders),
    ),
  );
  const deploymentProps = await Effect.runPromise(
    Output.evaluate(declared.deployment.Props, {
      [declared.worker.FQN]: { url: localWorkerUrl },
    }).pipe(Effect.provide(inMemoryState())),
  );
  const workerProps = await Effect.runPromise(
    Output.evaluate(declared.worker.Props, {}).pipe(Effect.provide(inMemoryState())),
  );
  return { ...declared, stack, deploymentProps, workerProps };
}
