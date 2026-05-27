import { keys } from "@noter-md/dependent/object";

export const ROUTE_SEARCH_PRESENCE_FLAG_KEYS = [
  "add-app-root",
  "add-cloudflare",
  "add-convex",
  "compare",
  "dark",
  "delete",
  "dev",
  "devtools",
  "diff",
  "freeView",
  "light",
  "new-app",
  "openedByCli",
  "prod-ui",
  "reset",
  "review",
] as const;

export type SearchPatch<Search extends object> = {
  [Key in keyof Search]?: Search[Key] | null;
};

export function formatRouteSearchPresenceFlagLinkLabel(key: string): string {
  return `?${key}`;
}

export function formatRouteSearchPresenceFlagDisableLinkLabel(key: string): string {
  // The enabled label stays as the prefix so hover previews do not move the pointer target.
  return `${formatRouteSearchPresenceFlagLinkLabel(key)}-`;
}

function isSearchRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Applies route-search patch semantics for TanStack navigation objects:
 * `undefined` means no opinion, and `null` means remove this search key.
 */
export function applySearchPatch<Search extends object>(
  current: Search,
  patch: SearchPatch<Search>,
): Search {
  const next = { ...current };

  for (const key of keys(patch)) {
    const value = patch[key];

    if (value === null) {
      // TanStack retained-search middleware only knows key presence, so a
      // removal must stay as an own key until stringifyTanStackSearch omits it.
      // @ts-expect-error Generic patch tombstones become that clear marker.
      next[key] = undefined;
      continue;
    }

    if (typeof value !== "undefined") {
      next[key] = value;
    }
  }

  return next;
}

export function normalizeRouteSearchPresenceFlags(
  search: URLSearchParams,
  keys: readonly string[],
): Record<string, unknown>;
export function normalizeRouteSearchPresenceFlags(
  search: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown>;
export function normalizeRouteSearchPresenceFlags(
  search: unknown,
  keys: readonly string[],
): unknown {
  if (search instanceof URLSearchParams) {
    return normalizeRouteSearchPresenceFlags(Object.fromEntries(search.entries()), keys);
  }

  if (!isSearchRecord(search)) {
    return search;
  }

  const normalizedSearch = { ...search };

  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(search, key) &&
      search[key] !== null &&
      typeof search[key] !== "undefined"
    ) {
      normalizedSearch[key] = true;
      continue;
    }

    delete normalizedSearch[key];
  }

  return normalizedSearch;
}
