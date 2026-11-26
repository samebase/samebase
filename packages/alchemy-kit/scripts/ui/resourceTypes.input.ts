import type { ResourceCategory } from "../../src/ui/ResourceTypeEntry.ts";

/**
 * An entry as written here: name, any Lucide icon name (the generator resolves and checks it),
 * colour, category. One entry per line; `prettier-ignore` keeps the formatter from expanding them.
 */
export type InputEntry = readonly [
  name: string,
  icon: string,
  color: string | undefined,
  category: ResourceCategory,
];

/**
 * Entries that PR #1441 does not have: the resource types of @samebase/alchemy-convex, and Alchemy
 * types that came after it. scripts/ui/resourceTypes.haiku.input.ts has more.
 */
// prettier-ignore
export const resourceTypeEntries: Record<string, InputEntry> = {
  "Convex.Project": ["Convex Project", "folder", "#EE342F", "database"],
  "Convex.Deployment": ["Convex Deployment", "database", "#EE342F", "database"],
  "Convex.LocalDeployment": ["Convex Local Deployment", "laptop", "#EE342F", "database"],
  "IdentityBroker.Client": ["Identity Broker Client", "id-card", undefined, "auth"],
  "IdentityHub.Client": ["Identity Broker Client", "id-card", undefined, "auth"],
  "IdentityHub.SharedClient": ["Identity Broker Client", "id-card", undefined, "auth"],
};

/** Alchemy resource types that use the default name and icon, one tag per line. */
export const defaultResourceTypes: string[] = [];
