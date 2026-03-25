export type QueryParamValue = boolean | string | null | undefined;

export type PathWithSearch = {
  pathname: string;
  search?: string | URLSearchParams;
  hash?: string;
};

function normalizeSearchInput(search?: string | URLSearchParams): string {
  if (typeof search === "undefined") {
    return "";
  }
  if (typeof search === "string") {
    return search.startsWith("?") ? search.slice(1) : search;
  }
  return search.toString();
}

export function cloneQueryParams(
  search?: string | URLSearchParams,
): URLSearchParams {
  return new URLSearchParams(normalizeSearchInput(search));
}

export function hasQueryParam(
  search: string | URLSearchParams | undefined,
  name: string,
): boolean {
  return cloneQueryParams(search).has(name);
}

export function setQueryParam(
  searchParams: URLSearchParams,
  name: string,
  value: QueryParamValue,
): void {
  if (value === false || value === null || typeof value === "undefined") {
    searchParams.delete(name);
    return;
  }

  searchParams.set(name, value === true ? "" : value);
}

export function serializeQueryParams(searchParams: URLSearchParams): string {
  const parts: string[] = [];

  for (const [key, value] of searchParams.entries()) {
    const encodedKey = encodeURIComponent(key);
    if (value.length === 0) {
      parts.push(encodedKey);
      continue;
    }
    parts.push(`${encodedKey}=${encodeURIComponent(value)}`);
  }

  return parts.join("&");
}

export function buildSearchString(searchParams: URLSearchParams): string {
  const queryString = serializeQueryParams(searchParams);
  return queryString.length > 0 ? `?${queryString}` : "";
}

export function updateQueryParams(
  search: string | URLSearchParams | undefined,
  updater: (nextSearchParams: URLSearchParams) => void,
): URLSearchParams {
  const nextSearchParams = cloneQueryParams(search);
  updater(nextSearchParams);
  return nextSearchParams;
}

export function buildPathWithQuery(args: PathWithSearch): string {
  const searchParams =
    args.search instanceof URLSearchParams
      ? args.search
      : cloneQueryParams(args.search);
  return `${args.pathname}${buildSearchString(searchParams)}${args.hash ?? ""}`;
}

export function buildPathWithUpdatedQuery(
  args: PathWithSearch,
  updater: (nextSearchParams: URLSearchParams) => void,
): string {
  return buildPathWithQuery({
    ...args,
    search: updateQueryParams(args.search, updater),
  });
}
