import { icons } from "./icons.generated.ts";
import type { ResourceCategory } from "./ResourceTypeEntry.ts";
import { resourceTypes } from "./resourceTypes.generated.ts";

export { resourceCategories, type ResourceCategory } from "./ResourceTypeEntry.ts";

/** A Lucide icon drawing: SVG child elements of a 24 by 24 view box, stroked, without fill. */
export type IconNode = ReadonlyArray<
  readonly [tag: string, attributes: Readonly<Record<string, string>>]
>;

export interface ResourceTypeUI {
  name: string;
  icon: IconNode;
  color: string | undefined;
  category: ResourceCategory;
}

/** `GCP.Compute.Instance` is "Compute Instance": the segments after the provider. */
const derivedName = (type: string) => type.split(".").slice(1).join(" ") || type;

/**
 * How to show a resource of `type`. A type marked `"default"`, or one with no entry, gets the name
 * from its tag and the `box` icon.
 */
export function resourceTypeUI(type: string): ResourceTypeUI {
  const entry = resourceTypes.get(type);
  if (entry === undefined || entry === "default") {
    return { name: derivedName(type), icon: icons.box, color: undefined, category: "other" };
  }
  return { ...entry, icon: icons[entry.icon] };
}
