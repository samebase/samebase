import type { IconName } from "./icons.generated.ts";

export const resourceCategories = [
  "compute",
  "storage",
  "database",
  "network",
  "dns",
  "queue",
  "eventing",
  "ai",
  "auth",
  "security",
  "observability",
  "cdn",
  "email",
  "media",
  "config",
  "billing",
  "other",
] as const;

export type ResourceCategory = (typeof resourceCategories)[number];

/**
 * A resource type's own name, Lucide icon, accent colour and category. A tuple, so the generated
 * file holds one type per line.
 */
export type ResourceTypeEntry = readonly [
  name: string,
  icon: IconName,
  color: string | undefined,
  category: ResourceCategory,
];
