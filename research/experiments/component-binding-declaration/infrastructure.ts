import * as Convex from "@samebase/alchemy-convex";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import { captureBinding } from "./captureBinding.ts";
import { BridgeSecret, Transform } from "./feature/alchemy.ts";
import { componentName } from "./feature/name.ts";
import type { workerUrl } from "./feature/workerBinding.ts";

export function infrastructure(project: { projectId: number }, binding?: typeof workerUrl) {
  return Effect.gen(function* () {
    const worker = yield* Transform;
    const secret = yield* BridgeSecret;
    const captured = binding ? yield* captureBinding(binding) : undefined;
    const deployment = yield* Convex.Deployment("Site", {
      project,
      type: "dev",
      name: "declaration-experiment",
      rootDir: ".",
      source: "./convex",
      env: {
        TEXT_JOB_URL: (captured ? captured.workerUrl : worker.url).pipe(
          Output.map((url) => {
            if (typeof url !== "string") throw new Error("The Worker has no URL");
            return url;
          }),
        ),
        TEXT_JOB_SECRET: secret.text,
      },
    });
    return {
      worker,
      deployment,
      captured,
      association: {
        componentPath: componentName,
        deploymentFqn: deployment.FQN,
        resourceFqn: worker.FQN,
      },
    };
  });
}
