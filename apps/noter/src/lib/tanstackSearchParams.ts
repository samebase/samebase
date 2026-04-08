import {
  buildSearchString,
  cloneQueryParams,
  setQueryParam,
} from "./queryParams";

type PlainSearchRecord = Record<string, unknown>;

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

export function parseTanStackSearch(search: string): Record<string, string> {
  const searchParams = cloneQueryParams(search);
  const parsedSearch: Record<string, string> = {};

  for (const [key, value] of searchParams.entries()) {
    parsedSearch[key] = value;
  }

  return parsedSearch;
}

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
