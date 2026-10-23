import * as Convex from "@samebase/alchemy-convex";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import { BridgeSecret, Transform } from "./feature/alchemy.ts";
import { componentName } from "./feature/name.ts";

export function infrastructure(project: { projectId: number }) {
  return Effect.gen(function* () {
    const worker = yield* Transform;
    const secret = yield* BridgeSecret;
    const deployment = yield* Convex.Deployment("Site", {
      project,
      type: "dev",
      name: "declaration-experiment",
      rootDir: ".",
      source: "./convex",
      env: {
        TEXT_JOB_URL: worker.url.pipe(
          Output.map((url) => {
            if (!url) throw new Error("The Worker has no URL");
            return url;
          }),
        ),
        TEXT_JOB_SECRET: secret.text,
      },
    });
    return {
      worker,
      deployment,
      association: {
        componentPath: componentName,
        deploymentFqn: deployment.FQN,
        resourceFqn: worker.FQN,
      },
    };
  });
}
