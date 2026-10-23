import type { BaseRuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import { unpackEnvValue } from "../../.local/output-entry.js";

export function outputContext(values: Record<string, string>): BaseRuntimeContext {
  return {
    Type: "Convex.Component",
    id: "textJobs",
    env: {},
    set: (key) => Effect.succeed(key),
    get: <T>(key: string) => Effect.succeed(unpackEnvValue<T>(values[key])),
  };
}
