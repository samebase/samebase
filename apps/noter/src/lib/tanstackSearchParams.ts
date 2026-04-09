import {
  buildSearchString,
  cloneQueryParams,
  setQueryParam,
} from "./queryParams";

type PlainSearchRecord = Record<string, unknown>;

// TODO(tanstack-router-cleanup): delete this serializer helper once the app can
// rely on TanStack's standard search serialization without changing the shipped
// URL contract.
function appendSearchParamValue(
  searchParams: URLSearchParams,
  key: string,
  value: unknown,
) {
  if (value === false || value === null || typeof value === "undefined") {
    return;
  }

  if (value === true) {
    setQueryParam(searchParams, key, true);
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return;
    }

    setQueryParam(searchParams, key, `${value}`);
    return;
  }

  if (typeof value === "string") {
    setQueryParam(searchParams, key, value);
    return;
  }

  throw new Error(`Unsupported TanStack search param value for "${key}".`);
}

// TODO(tanstack-router-cleanup): remove this parser once route-owned helpers
// and href builders stop needing a plain-object fallback outside TanStack's
// native location/buildLocation flows.
export function parseTanStackSearch(search: string): Record<string, string> {
  const searchParams = cloneQueryParams(search);
  const parsedSearch: Record<string, string> = {};

  for (const [key, value] of searchParams.entries()) {
    parsedSearch[key] = value;
  }

  return parsedSearch;
}

// TODO(tanstack-router-cleanup): remove this stringifier from app code
// callsites whenever TanStack can build the href directly, and delete it
// entirely if the app later adopts TanStack's default search semantics.
export function stringifyTanStackSearch(search: PlainSearchRecord): string {
  const searchParams = cloneQueryParams();

  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        appendSearchParamValue(searchParams, key, item);
      }
      continue;
    }

    appendSearchParamValue(searchParams, key, value);
  }

  return buildSearchString(searchParams);
}
