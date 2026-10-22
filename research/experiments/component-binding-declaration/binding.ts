import { feature } from "./host.ts";

export const rootKeys = {
  url: `${feature.name}_${feature.definition.binding.componentUrl}`,
  secret: `${feature.name}_${feature.definition.binding.componentSecret}`,
} as const;
