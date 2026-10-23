import type { Worker } from "alchemy/Cloudflare/Workers/Worker";
import { map, of } from "alchemy/Output";
import { ref } from "alchemy/Ref";
import { componentName } from "./name.ts";

export function bindWorkerUrl(fqn: string) {
  return map(
    of(ref<Worker>(fqn, { stack: "ComponentNativeAlchemyExperiment", stage: "local" })),
    (worker) => worker.url,
  ).bind("workerUrl");
}

export const workerUrl = bindWorkerUrl(`${componentName}/Transform`);
