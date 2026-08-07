import { entries, fromEntries } from "@samebase/dependent/object";

export type UrlSearchParamValue = string | undefined;
type UrlSearchParamsInput<Params> = {
  readonly [Key in keyof Params]: UrlSearchParamValue;
};
type DefinedUrlSearchParamEntry<Params> = [key: keyof Params & string, value: string];

// eslint-disable-next-line no-restricted-globals -- This helper is the shared native query-string protocol boundary.
const NativeURLSearchParams = URLSearchParams;
const RELATIVE_URL_BASE = "https://samebase.local";
const URL_PROTOCOL_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
type UrlInput =
  | {
      kind: "absolute";
      url: URL;
    }
  | {
      kind: "relative";
      url: URL;
    };

function readDefinedUrlSearchParamEntries<const Params extends UrlSearchParamsInput<Params>>(
  params: Params,
): Array<DefinedUrlSearchParamEntry<Params>> {
  const definedEntries: Array<DefinedUrlSearchParamEntry<Params>> = [];
  for (const [key, value] of entries(params)) {
    if (typeof value === "undefined") {
      continue;
    }
    definedEntries.push([key, value]);
  }
  return definedEntries;
}

export function createUrlSearchParams<const Params extends UrlSearchParamsInput<Params>>(
  params: Params,
): URLSearchParams {
  return new NativeURLSearchParams(readDefinedUrlSearchParamEntries(params));
}

export function readUrlSearchParamsRecord(search: string): Record<string, string | string[]> {
  const valuesByKey = new Map<string, string | string[]>();
  for (const [key, value] of new NativeURLSearchParams(search)) {
    const existing = valuesByKey.get(key);
    valuesByKey.set(
      key,
      existing === undefined
        ? value
        : typeof existing === "string"
          ? [existing, value]
          : [...existing, value],
    );
  }
  return fromEntries([...valuesByKey.entries()]);
}

export function removeUrlSearchParams(search: string, keysToRemove: readonly string[]): string {
  const removedKeys = new Set(keysToRemove);
  const serializedSearch = search.startsWith("?") ? search.slice(1) : search;
  if (serializedSearch === "") {
    return "";
  }
  const retainedParts = serializedSearch.split("&").filter((part) => {
    const key = new NativeURLSearchParams(part).keys().next().value;
    return key === undefined || !removedKeys.has(key);
  });
  return retainedParts.length === 0 ? "" : `?${retainedParts.join("&")}`;
}

function readUrlInput(baseUrl: string | URL): UrlInput {
  if (baseUrl instanceof URL) {
    return {
      kind: "absolute",
      url: new URL(baseUrl),
    };
  }

  if (URL_PROTOCOL_PATTERN.test(baseUrl)) {
    return {
      kind: "absolute",
      url: new URL(baseUrl),
    };
  }

  return {
    kind: "relative",
    url: new URL(baseUrl, RELATIVE_URL_BASE),
  };
}

function serializeUrlInput(input: UrlInput): string {
  if (input.kind === "absolute") {
    return input.url.toString();
  }
  return `${input.url.pathname}${input.url.search}${input.url.hash}`;
}

export function buildUrlWithSearchParams<const Params extends UrlSearchParamsInput<Params>>(
  baseUrl: string | URL,
  params: Params,
): string {
  const input = readUrlInput(baseUrl);
  const definedEntries = readDefinedUrlSearchParamEntries(params);
  const definedKeys = new Set<string>(definedEntries.map(([key]) => key));
  input.url.search = new NativeURLSearchParams([
    ...[...input.url.searchParams.entries()].filter(([key]) => !definedKeys.has(key)),
    ...definedEntries,
  ]).toString();
  return serializeUrlInput(input);
}
