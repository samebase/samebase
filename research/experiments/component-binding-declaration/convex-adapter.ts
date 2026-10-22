import type { AppDefinition } from "convex/server";
import { v } from "convex/values";
import { rootKeys } from "./binding.ts";
import { feature } from "./host.ts";
import type component from "./feature/convex/convex.config.ts";

export const environment = {
  [rootKeys.url]: v.string(),
  [rootKeys.secret]: v.string(),
};

export function mount(
  app: AppDefinition<typeof environment>,
  componentDefinition: typeof component,
) {
  app.use(componentDefinition, {
    name: feature.name,
    env: {
      [feature.definition.binding.componentUrl]: app.env[rootKeys.url],
      [feature.definition.binding.componentSecret]: app.env[rootKeys.secret],
    },
  });
}
