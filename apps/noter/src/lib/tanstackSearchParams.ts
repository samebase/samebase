import { includes } from "@noter-md/dependent";
import { ROUTE_SEARCH_PRESENCE_FLAG_KEYS } from "@/routing/searchFlags";
import { SEARCH_RESET_QUERY_PARAM } from "@/lib/searchReset";

type PlainSearchRecord = Record<string, unknown>;
type PathSearchInput = {
  pathname: string;
  search?: PlainSearchRecord;
  hash?: string;
};

function normalizeHashInput(hash?: string): string {
  if (typeof hash === "undefined" || hash.length === 0) {
    return "";
  }

  const rawHash = hash.replace(/^#+/, "");
  return rawHash.length === 0 ? "" : `#${rawHash}`;
}

function setPlainSearchParam(searchParams: URLSearchParams, key: string, value: string | true) {
  searchParams.set(key, value === true ? "" : value);
}

function serializePlainSearchParams(searchParams: URLSearchParams): string {
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

// TODO(tanstack-router-cleanup): delete this serializer helper once the app can
// rely on TanStack's standard search serialization without changing the shipped
// URL contract.
function appendSearchParamValue(searchParams: URLSearchParams, key: string, value: unknown) {
  if (value === false || value === null || typeof value === "undefined") {
    return;
  }

  if (value === true) {
    setPlainSearchParam(searchParams, key, true);
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return;
    }

    setPlainSearchParam(searchParams, key, `${value}`);
    return;
  }

  if (typeof value === "string") {
    setPlainSearchParam(searchParams, key, value);
    return;
  }

  throw new Error(`Unsupported TanStack search param value for "${key}".`);
}

// TODO(tanstack-router-cleanup): remove this parser once the router can adopt
// TanStack's default search semantics without changing the shipped URL
// contract.
export function parseTanStackSearch(search: string): Record<string, string> {
  const searchParams = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  if (searchParams.has(SEARCH_RESET_QUERY_PARAM)) {
    return { [SEARCH_RESET_QUERY_PARAM]: "" };
  }

  const parsedSearch: Record<string, string> = {};

  for (const [key, value] of searchParams.entries()) {
    parsedSearch[key] = value;
  }

  return parsedSearch;
}

// TODO(tanstack-router-cleanup): remove this stringifier once the router and
// generic script-facing helpers can adopt TanStack's default search semantics.
export function stringifyTanStackSearch(search: PlainSearchRecord): string {
  if (
    Object.prototype.hasOwnProperty.call(search, SEARCH_RESET_QUERY_PARAM) &&
    search[SEARCH_RESET_QUERY_PARAM] !== null &&
    typeof search[SEARCH_RESET_QUERY_PARAM] !== "undefined"
  ) {
    return `?${encodeURIComponent(SEARCH_RESET_QUERY_PARAM)}`;
  }

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(search)) {
    if (key === SEARCH_RESET_QUERY_PARAM) {
      continue;
    }

    if (
      includes(ROUTE_SEARCH_PRESENCE_FLAG_KEYS, key) &&
      value !== null &&
      typeof value !== "undefined"
    ) {
      setPlainSearchParam(searchParams, key, true);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        appendSearchParamValue(searchParams, key, item);
      }
      continue;
    }

    appendSearchParamValue(searchParams, key, value);
  }

  const queryString = serializePlainSearchParams(searchParams);
  return queryString.length > 0 ? `?${queryString}` : "";
}

export function buildPathWithTanStackSearch(args: PathSearchInput): string {
  return `${args.pathname}${stringifyTanStackSearch(args.search ?? {})}${normalizeHashInput(args.hash)}`;
}
