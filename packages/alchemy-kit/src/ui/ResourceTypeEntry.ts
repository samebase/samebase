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

/** A resource type's own name, Lucide icon, accent colour and category. */
export interface ResourceTypeEntry {
  name: string;
  icon: IconName;
  color: string | undefined;
  category: ResourceCategory;
}
