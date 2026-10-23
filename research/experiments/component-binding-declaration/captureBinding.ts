import type { Output } from "alchemy/Output";
import { RuntimeContext, type BaseRuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import { workerUrl } from "./feature/workerBinding.ts";

export function captureBinding(binding = workerUrl) {
  const captured: Record<string, Output<unknown, never>> = {};
  const context: BaseRuntimeContext = {
    Type: "Convex.Component",
    id: "textJobs",
    env: captured,
    set: (key, output) =>
      Effect.sync(() => {
        // @ts-expect-error BaseRuntimeContext erases requirements. This probe captures only the pure Ref expression in workerBinding.ts.
        captured[key] = output;
        return key;
      }),
    get: () => Effect.succeed(undefined),
  };
  return binding.pipe(Effect.provideService(RuntimeContext, context), Effect.as(captured));
}
