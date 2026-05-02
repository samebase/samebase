export const ROUTE_SEARCH_PRESENCE_FLAG_KEYS = [
  "compare",
  "dark",
  "dev",
  "devtools",
  "diff",
  "freeView",
  "light",
  "openedByCli",
  "prod-ui",
  "reset",
  "review",
] as const;

type SearchFlagReader = URLSearchParams | Readonly<Record<string, unknown>>;

function isSearchRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRouteSearchPresenceFlagKey(key: string): boolean {
  return ROUTE_SEARCH_PRESENCE_FLAG_KEYS.some(
    (presenceFlagKey) => presenceFlagKey === key,
  );
}

export function hasRouteSearchPresenceFlag(
  search: SearchFlagReader,
  key: string,
): boolean {
  if (search instanceof URLSearchParams) {
    return search.has(key);
  }

  return (
    key in search && search[key] !== null && typeof search[key] !== "undefined"
  );
}

export function normalizeRouteSearchPresenceFlags(
  search: unknown,
  keys: readonly string[],
): unknown {
  if (search instanceof URLSearchParams) {
    return normalizeRouteSearchPresenceFlags(
      Object.fromEntries(search.entries()),
      keys,
    );
  }

  if (!isSearchRecord(search)) {
    return search;
  }

  const normalizedSearch = { ...search };

  for (const key of keys) {
    if (hasRouteSearchPresenceFlag(search, key)) {
      normalizedSearch[key] = true;
      continue;
    }

    delete normalizedSearch[key];
  }

  return normalizedSearch;
}
