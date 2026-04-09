export type QueryParamValue = boolean | string | null | undefined;

type PathQueryInput = {
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

/** Canonicalize raw or browser-style hash input to either "" or a single-# string. */
function normalizeHashInput(hash?: string): string {
  if (typeof hash === "undefined" || hash.length === 0) {
    return "";
  }

  const rawHash = hash.replace(/^#+/, "");
  return rawHash.length === 0 ? "" : `#${rawHash}`;
}

export function buildPathWithQuery(args: PathQueryInput): string {
  const searchParams =
    args.search instanceof URLSearchParams
      ? args.search
      : cloneQueryParams(args.search);
  return `${args.pathname}${buildSearchString(searchParams)}${normalizeHashInput(args.hash)}`;
}

export function buildPathWithUpdatedQuery(
  args: PathQueryInput,
  updater: (nextSearchParams: URLSearchParams) => void,
): string {
  return buildPathWithQuery({
    ...args,
    search: updateQueryParams(args.search, updater),
  });
}
