import * as Convex from "@samebase/alchemy-convex";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import { RandomProvider } from "alchemy/Random";
import { Stack, type StackSpec } from "alchemy/Stack";
import { inMemoryState } from "alchemy/State/InMemoryState";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { BridgeSecret, Transform } from "./feature/alchemy.ts";
import { workerUrl } from "./feature/workerBinding.ts";
import { infrastructure } from "./infrastructure.ts";

/** Local construction fixture. It does not plan, apply, or contact cloud providers. */
export async function construct(secretValue: string, localWorkerUrl: string, binding = workerUrl) {
  const stack: Omit<StackSpec<unknown>, "output"> = {
    name: "ComponentNativeAlchemyExperiment",
    stage: "local",
    resources: {},
    bindings: {},
    actions: {},
  };
  const noProviders = {
    kind: "ProviderCollection" as const,
    providers: {},
    get: () => {
      throw new Error("This experiment does not execute provider operations");
    },
  };
  const declared = await Effect.runPromise(
    Effect.gen(function* () {
      const resources = yield* infrastructure({ projectId: 0 }, binding);
      const workerAgain = yield* Transform;
      const secret = yield* BridgeSecret;
      const secretAgain = yield* BridgeSecret;
      return { ...resources, workerAgain, secret, secretAgain };
    }).pipe(
      Effect.provideService(Stack, stack),
      Effect.provideService(Cloudflare.Providers, noProviders),
      Effect.provideService(Convex.Providers, noProviders),
      Effect.provide(RandomProvider()),
    ),
  );
  const outputs = {
    [declared.worker.FQN]: { url: localWorkerUrl },
    [declared.secret.FQN]: { text: Redacted.make(secretValue) },
  };
  // This fixture records the live Wrangler endpoint. It is not an Alchemy apply result.
  const workerState = inMemoryState({
    [stack.name]: {
      [stack.stage]: {
        [declared.worker.FQN]: {
          status: "created",
          resourceType: declared.worker.Type,
          namespace: undefined,
          fqn: declared.worker.FQN,
          logicalId: "Transform",
          instanceId: "local-wrangler-fixture",
          providerVersion: 1,
          downstream: [],
          bindings: [],
          props: {},
          attr: { url: localWorkerUrl },
        },
      },
    },
  });
  const capturedValues = await Effect.runPromise(
    Output.evaluate(declared.captured, outputs).pipe(Effect.provide(workerState)),
  );
  const deploymentProps = await Effect.runPromise(
    Output.evaluate(declared.deployment.Props, outputs).pipe(Effect.provide(workerState)),
  );
  const workerProps = await Effect.runPromise(
    Output.evaluate(declared.worker.Props, outputs).pipe(Effect.provide(inMemoryState())),
  );
  return { ...declared, stack, deploymentProps, workerProps, capturedValues };
}
