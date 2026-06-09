import type { AppRouter } from "@/router";
import { entries } from "@noter-md/dependent/object";
import { type NoterRouteSurface } from "@/lib/routeAvailability";
import {
  filterRouteUrlPathSuggestions,
  readRouteUrlPathSuggestionSurface,
} from "@/lib/routeUrlPathSuggestions";
import {
  canAccessNoterRoutePermission,
  canAccessNoterRouteStaticData,
  type NoterRouteSearchParamNumericRange,
  type NoterRouteSearchParamSuggestion,
  type NoterRouteSearchParamValueSuggestion,
  type NoterRoutePermissionViewer,
  type NoterRouteStaticData,
} from "@/lib/routePermissions";
import {
  appendRouteAddressSearchToken,
  parseRouteAddress,
  readRouteAddressCursorContext,
  readRouteAddressSearchTokenText,
  replaceRouteAddressHash,
  replaceRouteAddressPath,
  replaceRouteAddressSearchValue,
  type RouteAddressSearchToken,
} from "@/lib/routeAddressParts";
import { ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS } from "@/lib/rootRouteSearch";

type RouteUrlEditorHashOrPathSuggestion = {
  detail?: string;
  kind: "hash" | "path";
  key: string;
  value: string;
};

type RouteUrlEditorSearchSuggestion =
  | {
      detail?: string;
      kind: "search";
      key: string;
      value: string;
      searchParamKind: "presence";
    }
  | RouteUrlEditorValueSearchSuggestion;

type RouteUrlEditorValueSearchSuggestion = {
  detail?: string;
  kind: "search";
  key: string;
  value: string;
  searchParamKind: "value";
};

type RouteUrlEditorSearchValueSuggestion = {
  detail?: string;
  kind: "search-value";
  key: string;
  previewReplacementValue?: string;
  replacementValue: string;
  sampleValueStart?: number;
  value: string;
};

export type RouteUrlEditorSuggestion =
  | RouteUrlEditorHashOrPathSuggestion
  | RouteUrlEditorSearchSuggestion
  | RouteUrlEditorSearchValueSuggestion;

export type RouteUrlEditorSuggestionKind = RouteUrlEditorSuggestion["kind"];

type RouteUrlEditorSuggestionsInput = {
  currentHref: string;
  draftEditedSinceFocus: boolean;
  draftRouteAddress: string;
  hashKeys: readonly string[];
  kind: RouteUrlEditorSuggestionKind;
  origin: string;
  routesByPath: AppRouter["routesByPath"];
  selectionRouteIndex: number;
  viewer: NoterRoutePermissionViewer;
};

type RouteUrlEditorSuggestionSelectionInput = {
  mode: "preview" | "select";
  routeAddress: string;
  selectionRouteIndex: number;
  suggestion: RouteUrlEditorSuggestion;
};

type SearchToken = {
  editing: "key" | "value";
  first: boolean;
  hasValueSeparator: boolean;
  key: string;
  routeToken: RouteAddressSearchToken;
  tokenEnd: number;
  tokenStart: number;
  value: string;
  valueStart: number;
};

type NumericSearchParamValue = {
  number: number;
  raw: string;
};

type SearchSuggestionToken = {
  prefix: "first" | "next";
  text: string;
};

const GLOBAL_ROUTE_URL_HASH_KEYS = ["top"] as const;

const ROUTE_URL_HASH_KEYS_BY_PATH: Readonly<Record<string, readonly string[]>> = {
  "/machines/connect": ["connected-machines"],
} as const;

export function readRouteUrlEditorSuggestionKind(
  routeAddress: string,
  selectionRouteIndex: number,
): RouteUrlEditorSuggestionKind {
  const cursorContext = readRouteAddressCursorContext(
    parseRouteAddress(routeAddress),
    selectionRouteIndex,
  );

  switch (cursorContext.kind) {
    case "hash":
      return "hash";
    case "path":
      return "path";
    case "searchKey":
      return "search";
    case "searchValue":
      return "search-value";
  }
}

export function readRouteUrlEditorSuggestions({
  currentHref,
  draftEditedSinceFocus,
  draftRouteAddress,
  hashKeys,
  kind,
  origin,
  routesByPath,
  selectionRouteIndex,
  viewer,
}: RouteUrlEditorSuggestionsInput): readonly RouteUrlEditorSuggestion[] {
  switch (kind) {
    case "path":
      return filterRouteUrlPathSuggestions({
        currentHref,
        draftHref: draftEditedSinceFocus ? draftRouteAddress : "",
        origin,
        routesByPath,
        viewer,
      }).map((path) => ({
        key: path,
        kind: "path",
        value: path,
      }));
    case "search":
      return readRouteUrlEditorSearchSuggestions({
        currentHref,
        draftRouteAddress,
        origin,
        routesByPath,
        selectionRouteIndex,
        viewer,
      });
    case "search-value":
      return readRouteUrlEditorSearchValueSuggestions({
        currentHref,
        draftRouteAddress,
        origin,
        routesByPath,
        selectionRouteIndex,
        viewer,
      });
    case "hash":
      return readRouteUrlEditorHashSuggestions({
        currentHref,
        draftRouteAddress,
        hashKeys,
        origin,
        routesByPath,
        selectionRouteIndex,
        viewer,
      });
  }
}

export function applyRouteUrlEditorSuggestion({
  mode,
  routeAddress,
  selectionRouteIndex,
  suggestion,
}: RouteUrlEditorSuggestionSelectionInput): string {
  switch (suggestion.kind) {
    case "path": {
      return replaceRouteAddressPath(routeAddress, suggestion.value);
    }
    case "search": {
      const token = readRouteUrlEditorSearchToken(routeAddress, selectionRouteIndex);
      if (token === null) {
        return routeAddress;
      }

      return applyRouteUrlEditorSearchSuggestion({
        mode,
        routeAddress,
        suggestion,
        token,
      });
    }
    case "search-value": {
      const token = readRouteUrlEditorSearchToken(routeAddress, selectionRouteIndex);
      if (token === null || token.editing !== "value") {
        return routeAddress;
      }

      const replacementValue =
        mode === "preview"
          ? (suggestion.previewReplacementValue ?? suggestion.replacementValue)
          : suggestion.replacementValue;
      if (token.routeToken.kind !== "value") {
        return routeAddress;
      }

      return replaceRouteAddressSearchValue({
        routeAddress,
        token: token.routeToken,
        value: replacementValue,
      });
    }
    case "hash": {
      return replaceRouteAddressHash(routeAddress, suggestion.key);
    }
  }
}

function applyRouteUrlEditorSearchSuggestion(args: {
  mode: "preview" | "select";
  routeAddress: string;
  suggestion: RouteUrlEditorSearchSuggestion;
  token: SearchToken;
}): string {
  if (args.suggestion.searchParamKind === "value") {
    if (args.mode === "preview") {
      return previewRouteUrlEditorSearchValueSuggestion({
        routeAddress: args.routeAddress,
        suggestion: args.suggestion,
        token: args.token,
      });
    }

    return applyRouteUrlEditorSearchValueKeySuggestion({
      routeAddress: args.routeAddress,
      suggestion: args.suggestion,
      token: args.token,
    });
  }

  const suggestionToken = readRouteUrlEditorSearchSuggestionToken(args.suggestion.value);
  if (shouldAppendRouteUrlEditorSearchSuggestion(suggestionToken, args.token)) {
    return appendRouteUrlEditorSearchSuggestion({
      routeAddress: args.routeAddress,
      suggestionToken,
    });
  }

  const nextToken = formatRouteUrlEditorSearchToken({
    first: args.token.first,
    text: suggestionToken.text,
  });
  return `${args.routeAddress.slice(0, args.token.tokenStart)}${nextToken}${args.routeAddress.slice(
    args.token.tokenEnd,
  )}`;
}

function applyRouteUrlEditorSearchValueKeySuggestion(args: {
  routeAddress: string;
  suggestion: RouteUrlEditorValueSearchSuggestion;
  token: SearchToken;
}): string {
  const displayToken = readRouteUrlEditorSearchSuggestionToken(args.suggestion.value);
  const suggestionToken: SearchSuggestionToken = {
    prefix: displayToken.prefix,
    text: `${args.suggestion.key}=`,
  };
  if (shouldAppendRouteUrlEditorSearchSuggestion(suggestionToken, args.token)) {
    return appendRouteUrlEditorSearchSuggestion({
      routeAddress: args.routeAddress,
      suggestionToken,
    });
  }

  const nextToken = formatRouteUrlEditorSearchToken({
    first: args.token.first,
    text: suggestionToken.text,
  });
  return `${args.routeAddress.slice(0, args.token.tokenStart)}${nextToken}${args.routeAddress.slice(
    args.token.tokenEnd,
  )}`;
}

function previewRouteUrlEditorSearchValueSuggestion(args: {
  routeAddress: string;
  suggestion: RouteUrlEditorValueSearchSuggestion;
  token: SearchToken;
}): string {
  const searchTokens = readRouteUrlEditorSearchTokens(args.routeAddress);
  const replacementToken =
    searchTokens.find(
      (candidate) =>
        candidate.key === args.suggestion.key &&
        candidate.hasValueSeparator &&
        !areRouteUrlEditorSearchTokensEqual(candidate, args.token),
    ) ??
    searchTokens.find(
      (candidate) =>
        candidate.key === args.suggestion.key &&
        areRouteUrlEditorSearchTokensEqual(candidate, args.token),
    );
  const suggestionToken = readRouteUrlEditorSearchSuggestionToken(args.suggestion.value);

  if (
    shouldAppendRouteUrlEditorSearchSuggestion(suggestionToken, args.token) &&
    typeof replacementToken === "undefined"
  ) {
    return appendRouteUrlEditorSearchSuggestion({
      routeAddress: args.routeAddress,
      suggestionToken,
    });
  }

  const tokenTexts: string[] = [];

  for (const searchToken of searchTokens) {
    const activeToken = areRouteUrlEditorSearchTokensEqual(searchToken, args.token);
    const replaceToken =
      typeof replacementToken !== "undefined" &&
      areRouteUrlEditorSearchTokensEqual(searchToken, replacementToken);

    if (replaceToken || (activeToken && typeof replacementToken === "undefined")) {
      tokenTexts.push(suggestionToken.text);
      continue;
    }

    if (activeToken && typeof replacementToken !== "undefined") {
      continue;
    }

    const tokenText = readRouteAddressSearchTokenText(args.routeAddress, searchToken.routeToken);
    if (tokenText.length > 0) {
      tokenTexts.push(tokenText);
    }
  }

  const parts = parseRouteAddress(args.routeAddress);
  const search = tokenTexts.length > 0 ? `?${tokenTexts.join("&")}` : "";
  const hash = parts.hash?.suffix ?? "";

  return `${parts.path}${search}${hash}`;
}

function appendRouteUrlEditorSearchSuggestion(args: {
  routeAddress: string;
  suggestionToken: SearchSuggestionToken;
}): string {
  return appendRouteAddressSearchToken(args.routeAddress, args.suggestionToken.text);
}

function readRouteUrlEditorSearchSuggestionToken(value: string): SearchSuggestionToken {
  if (value.startsWith("&")) {
    return {
      prefix: "next",
      text: value.slice(1),
    };
  }

  return {
    prefix: "first",
    text: value.startsWith("?") ? value.slice(1) : value,
  };
}

function shouldAppendRouteUrlEditorSearchSuggestion(
  suggestionToken: SearchSuggestionToken,
  token: SearchToken,
): boolean {
  return suggestionToken.prefix === "next" && token.first;
}

function formatRouteUrlEditorSearchToken(args: { first: boolean; text: string }): string {
  return `${args.first ? "?" : "&"}${args.text}`;
}

function areRouteUrlEditorSearchTokensEqual(left: SearchToken, right: SearchToken): boolean {
  return left.tokenStart === right.tokenStart && left.tokenEnd === right.tokenEnd;
}

export function isRouteUrlEditorRouteUpdateReady(args: {
  currentHref: string;
  draftRouteAddress: string;
  origin: string;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRoutePermissionViewer;
}): boolean {
  return readRouteUrlEditorRouteUpdateDraft(args) === args.draftRouteAddress;
}

export function readRouteUrlEditorRouteUpdateDraft(args: {
  currentHref: string;
  draftRouteAddress: string;
  origin: string;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRoutePermissionViewer;
}): string {
  const parts = parseRouteAddress(args.draftRouteAddress);
  if (parts.search === null) {
    return args.draftRouteAddress;
  }

  const searchParamSuggestions = readRouteUrlEditorSearchParamSuggestions(args);
  const routeUpdateSearchTokens = readRouteUrlEditorSearchTokens(args.draftRouteAddress)
    .filter((token) => isRouteUrlEditorSearchTokenReady(token, searchParamSuggestions))
    .map((token) => readRouteAddressSearchTokenText(args.draftRouteAddress, token.routeToken))
    .filter((tokenText) => tokenText.length > 0);
  const search = routeUpdateSearchTokens.length > 0 ? `?${routeUpdateSearchTokens.join("&")}` : "";
  const hash = parts.hash?.suffix ?? "";

  return `${parts.path}${search}${hash}`;
}

function isRouteUrlEditorSearchTokenReady(
  token: SearchToken,
  suggestions: readonly NoterRouteSearchParamSuggestion[],
): boolean {
  const suggestion = suggestions.find((value) => value.key === token.key);
  if (!token.hasValueSeparator) {
    if (suggestion?.searchParamKind === "presence") {
      return true;
    }

    return !(
      suggestion?.searchParamKind === "value" ||
      (token.key.length > 0 && suggestions.some((value) => value.key.startsWith(token.key)))
    );
  }

  if (!suggestion || suggestion.searchParamKind === "presence") {
    return true;
  }

  if (token.value.length === 0) {
    return false;
  }

  const valueSuggestions = readRouteUrlEditorValueSuggestions(suggestion);
  return valueSuggestions.length === 0 || valueSuggestions.includes(token.value);
}

function readRouteUrlEditorSearchSuggestions(args: {
  currentHref: string;
  draftRouteAddress: string;
  origin: string;
  routesByPath: AppRouter["routesByPath"];
  selectionRouteIndex: number;
  viewer: NoterRoutePermissionViewer;
}): readonly RouteUrlEditorSuggestion[] {
  const token = readRouteUrlEditorSearchToken(args.draftRouteAddress, args.selectionRouteIndex);
  if (token === null) {
    return [];
  }

  if (token.editing !== "key") {
    return [];
  }

  const searchParamSuggestions = readRouteUrlEditorSearchParamSuggestions(args);
  return searchParamSuggestions
    .filter((suggestion) => suggestion.key.startsWith(token.key))
    .flatMap((suggestion): RouteUrlEditorSearchSuggestion[] => {
      if (suggestion.searchParamKind === "presence") {
        return [
          {
            key: suggestion.key,
            kind: "search",
            value: formatRouteUrlEditorSearchSuggestionValue(
              suggestion.key,
              suggestion.searchParamKind,
              token.first,
            ),
            searchParamKind: "presence",
          },
        ];
      }

      const exampleSuggestion = readRouteUrlEditorValueSearchSuggestion({
        currentHref: args.currentHref,
        draftRouteAddress: args.draftRouteAddress,
        origin: args.origin,
        suggestion,
        token,
      });

      return [exampleSuggestion];
    });
}

function readRouteUrlEditorValueSearchSuggestion(args: {
  currentHref: string;
  draftRouteAddress: string;
  origin: string;
  suggestion: NoterRouteSearchParamValueSuggestion;
  token: SearchToken;
}): RouteUrlEditorValueSearchSuggestion {
  return (
    readRouteUrlEditorNumericSearchSuggestion(args) ??
    readRouteUrlEditorSampleSearchSuggestion(args)
  );
}

function readRouteUrlEditorNumericSearchSuggestion(args: {
  currentHref: string;
  draftRouteAddress: string;
  origin: string;
  suggestion: NoterRouteSearchParamValueSuggestion;
  token: SearchToken;
}): RouteUrlEditorValueSearchSuggestion | null {
  if (args.suggestion.valueType !== "numeric" && args.suggestion.valueType !== "numeric-options") {
    return null;
  }

  const currentValue = readRouteUrlEditorNumericSearchParamValue({
    currentHref: args.currentHref,
    draftRouteAddress: args.draftRouteAddress,
    key: args.suggestion.key,
    origin: args.origin,
    suggestion: args.suggestion,
  });
  if (currentValue === null) {
    return null;
  }

  const valueSuggestions =
    args.suggestion.valueType === "numeric-options" ? args.suggestion.valueSuggestions : [];
  const numericStepValue =
    args.suggestion.valueType === "numeric" ? args.suggestion.numericStepValue : 1;
  if (!Number.isFinite(numericStepValue) || numericStepValue <= 0) {
    return null;
  }

  const deltas = [numericStepValue, -numericStepValue] as const;
  for (const delta of deltas) {
    const nextNumericValue = currentValue.number + delta;
    const nextValue =
      args.suggestion.valueType === "numeric-options"
        ? readRouteUrlEditorNumericValueSuggestion(valueSuggestions, nextNumericValue)
        : readRouteUrlEditorRangedNumericValueSuggestion(args.suggestion, nextNumericValue);

    if (nextValue === null) {
      continue;
    }

    return {
      detail: `${currentValue.raw} ${delta > 0 ? "+" : ""}${formatRouteUrlEditorNumericSearchValue(delta)}`,
      key: args.suggestion.key,
      kind: "search",
      value: `${args.token.first ? "?" : "&"}${args.suggestion.key}=${nextValue}`,
      searchParamKind: "value",
    };
  }

  return null;
}

function readRouteUrlEditorSampleSearchSuggestion(args: {
  currentHref: string;
  draftRouteAddress: string;
  origin: string;
  suggestion: NoterRouteSearchParamValueSuggestion;
  token: SearchToken;
}): RouteUrlEditorValueSearchSuggestion {
  const currentValue = readRouteUrlEditorSearchParamValue({
    currentHref: args.currentHref,
    draftRouteAddress: args.draftRouteAddress,
    key: args.suggestion.key,
    origin: args.origin,
  });
  const sampleValue = readRouteUrlEditorSearchSampleValue(args.suggestion, currentValue);

  return {
    key: args.suggestion.key,
    kind: "search",
    value: `${args.token.first ? "?" : "&"}${args.suggestion.key}=${sampleValue}`,
    searchParamKind: "value",
  };
}

function readRouteUrlEditorSearchSampleValue(
  suggestion: NoterRouteSearchParamValueSuggestion,
  currentValue: string | null,
): string {
  if (suggestion.valueType === "manual") {
    return "";
  }

  if (currentValue === null || suggestion.sampleValue !== currentValue) {
    return suggestion.sampleValue;
  }

  const valueSuggestions = readRouteUrlEditorValueSuggestions(suggestion);
  return (
    valueSuggestions.find((valueSuggestion) => valueSuggestion !== currentValue) ??
    suggestion.sampleValue
  );
}

function readRouteUrlEditorNumericSearchParamValue(args: {
  currentHref: string;
  draftRouteAddress: string;
  key: string;
  origin: string;
  suggestion: NoterRouteSearchParamValueSuggestion;
}): NumericSearchParamValue | null {
  return (
    readRouteUrlEditorRouteSearchParamNumber({
      key: args.key,
      origin: args.origin,
      routeAddress: args.draftRouteAddress,
    }) ??
    readRouteUrlEditorRouteSearchParamNumber({
      key: args.key,
      origin: args.origin,
      routeAddress: args.currentHref,
    }) ??
    readRouteUrlEditorNumericDefaultSearchParamValue(args.suggestion)
  );
}

function readRouteUrlEditorSearchParamValue(args: {
  currentHref: string;
  draftRouteAddress: string;
  key: string;
  origin: string;
}): string | null {
  return (
    readRouteUrlEditorRouteSearchParamValue({
      key: args.key,
      origin: args.origin,
      routeAddress: args.draftRouteAddress,
    }) ??
    readRouteUrlEditorRouteSearchParamValue({
      key: args.key,
      origin: args.origin,
      routeAddress: args.currentHref,
    })
  );
}

function readRouteUrlEditorRouteSearchParamValue(args: {
  key: string;
  origin: string;
  routeAddress: string;
}): string | null {
  const url = new URL(args.routeAddress, new URL(args.origin));
  const raw = url.searchParams.get(args.key);
  if (raw === null) {
    return null;
  }

  const trimmedRaw = raw.trim();
  return trimmedRaw.length > 0 ? raw : null;
}

function readRouteUrlEditorNumericDefaultSearchParamValue(
  suggestion: NoterRouteSearchParamValueSuggestion,
): NumericSearchParamValue | null {
  if (suggestion.valueType !== "numeric" && suggestion.valueType !== "numeric-options") {
    return null;
  }

  const numericDefaultValue =
    suggestion.valueType === "numeric"
      ? readRouteUrlEditorRangedNumericValue(
          suggestion.numericRange,
          suggestion.numericDefaultValue,
        )
      : suggestion.numericDefaultValue;
  if (numericDefaultValue === null || !Number.isFinite(numericDefaultValue)) {
    return null;
  }

  return {
    number: numericDefaultValue,
    raw: formatRouteUrlEditorNumericSearchValue(numericDefaultValue),
  };
}

function readRouteUrlEditorRouteSearchParamNumber(args: {
  key: string;
  origin: string;
  routeAddress: string;
}): NumericSearchParamValue | null {
  const url = new URL(args.routeAddress, new URL(args.origin));
  const raw = url.searchParams.get(args.key);
  if (raw === null) {
    return null;
  }

  const trimmedRaw = raw.trim();
  if (trimmedRaw.length === 0) {
    return null;
  }

  const numericValue = Number(trimmedRaw);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return {
    number: numericValue,
    raw,
  };
}

function readRouteUrlEditorNumericValueSuggestion(
  valueSuggestions: readonly string[],
  numericValue: number,
): string | null {
  for (const valueSuggestion of valueSuggestions) {
    const numericSuggestion = Number(valueSuggestion.trim());
    if (Number.isFinite(numericSuggestion) && numericSuggestion === numericValue) {
      return valueSuggestion;
    }
  }

  return null;
}

function readRouteUrlEditorRangedNumericValueSuggestion(
  suggestion: Extract<NoterRouteSearchParamValueSuggestion, { valueType: "numeric" }>,
  numericValue: number,
): string | null {
  const rangedNumericValue = readRouteUrlEditorRangedNumericValue(
    suggestion.numericRange,
    numericValue,
  );
  return rangedNumericValue === null
    ? null
    : formatRouteUrlEditorNumericSearchValue(rangedNumericValue);
}

function readRouteUrlEditorRangedNumericValue(
  numericRange: NoterRouteSearchParamNumericRange,
  numericValue: number,
): number | null {
  if (!Number.isFinite(numericValue) || !Number.isFinite(numericRange.minValue)) {
    return null;
  }

  switch (numericRange.rangeType) {
    case "closed":
      if (!Number.isFinite(numericRange.maxValue)) {
        return null;
      }

      return numericValue >= numericRange.minValue && numericValue <= numericRange.maxValue
        ? numericValue
        : null;
    case "min":
      return numericValue >= numericRange.minValue ? numericValue : null;
    case "wrap": {
      if (
        !Number.isFinite(numericRange.maxValue) ||
        numericRange.maxValue <= numericRange.minValue
      ) {
        return null;
      }

      const span = numericRange.maxValue - numericRange.minValue;
      const offset = numericValue - numericRange.minValue;
      return (((offset % span) + span) % span) + numericRange.minValue;
    }
  }
}

function formatRouteUrlEditorNumericSearchValue(value: number): string {
  if (Number.isInteger(value)) {
    return `${value}`;
  }

  return `${Number(value.toFixed(12))}`;
}

function readRouteUrlEditorSearchValueSuggestions(args: {
  currentHref: string;
  draftRouteAddress: string;
  origin: string;
  routesByPath: AppRouter["routesByPath"];
  selectionRouteIndex: number;
  viewer: NoterRoutePermissionViewer;
}): readonly RouteUrlEditorSuggestion[] {
  const token = readRouteUrlEditorSearchToken(args.draftRouteAddress, args.selectionRouteIndex);
  if (token === null || token.editing !== "value" || token.key.length === 0) {
    return [];
  }

  for (const searchParamSuggestion of readRouteUrlEditorSearchParamSuggestions(args)) {
    if (
      searchParamSuggestion.key !== token.key ||
      searchParamSuggestion.searchParamKind !== "value"
    ) {
      continue;
    }

    switch (searchParamSuggestion.valueType) {
      case "completion":
        return readTailwindColorTokenSearchValueSuggestions({
          key: token.key,
          tokenValue: token.value,
          valueSuggestions: searchParamSuggestion.valueSuggestions,
        });
      case "numeric-options":
      case "options":
        return searchParamSuggestion.valueSuggestions
          .filter((value) => value.startsWith(token.value))
          .map((value) => createRouteUrlEditorSearchValueSuggestion(token.key, value, value));
      case "manual":
      case "numeric":
      case "freeform":
        return [];
    }
  }

  return [];
}

function readRouteUrlEditorValueSuggestions(
  suggestion: NoterRouteSearchParamValueSuggestion,
): readonly string[] {
  switch (suggestion.valueType) {
    case "completion":
    case "numeric-options":
    case "options":
      return suggestion.valueSuggestions;
    case "manual":
    case "numeric":
    case "freeform":
      return [];
  }
}

function createRouteUrlEditorSearchValueSuggestion(
  key: string,
  value: string,
  replacementValue: string,
  options: {
    previewReplacementValue?: string;
    sampleValueStart?: number;
  } = {},
): RouteUrlEditorSearchValueSuggestion {
  return {
    key: `${key}=${replacementValue}`,
    kind: "search-value",
    ...options,
    replacementValue,
    value,
  };
}

function readTailwindColorTokenSearchValueSuggestions(args: {
  key: string;
  tokenValue: string;
  valueSuggestions: readonly string[];
}): readonly RouteUrlEditorSearchValueSuggestion[] {
  const dashIndex = args.tokenValue.indexOf("-");

  if (dashIndex === -1) {
    const suggestedPrefixes = new Set<string>();
    const suggestions: RouteUrlEditorSearchValueSuggestion[] = [];

    for (const valueSuggestion of args.valueSuggestions) {
      const parsedSuggestion = readTailwindColorTokenSuggestion(valueSuggestion);
      if (parsedSuggestion === null || suggestedPrefixes.has(parsedSuggestion.prefix)) {
        continue;
      }

      if (!parsedSuggestion.prefix.startsWith(args.tokenValue)) {
        continue;
      }

      suggestedPrefixes.add(parsedSuggestion.prefix);
      const sampleValue = readTailwindColorTokenFamilySampleValue(
        parsedSuggestion.prefix,
        args.valueSuggestions,
      );
      suggestions.push(
        createRouteUrlEditorSearchValueSuggestion(args.key, sampleValue, parsedSuggestion.prefix, {
          previewReplacementValue: sampleValue,
          sampleValueStart: parsedSuggestion.prefix.length,
        }),
      );
    }

    return suggestions;
  }

  const prefix = args.tokenValue.slice(0, dashIndex + 1);
  const shadeDraft = args.tokenValue.slice(dashIndex + 1);

  return args.valueSuggestions.flatMap((valueSuggestion) => {
    const parsedSuggestion = readTailwindColorTokenSuggestion(valueSuggestion);
    if (
      parsedSuggestion === null ||
      parsedSuggestion.prefix !== prefix ||
      !parsedSuggestion.shade.startsWith(shadeDraft)
    ) {
      return [];
    }

    return [
      createRouteUrlEditorSearchValueSuggestion(args.key, parsedSuggestion.shade, valueSuggestion),
    ];
  });
}

function readTailwindColorTokenFamilySampleValue(
  prefix: string,
  valueSuggestions: readonly string[],
): string {
  const sampleValue = `${prefix}500`;
  return valueSuggestions.includes(sampleValue) ? sampleValue : prefix;
}

function readTailwindColorTokenSuggestion(value: string): { prefix: string; shade: string } | null {
  const dashIndex = value.indexOf("-");
  if (dashIndex === -1) {
    return null;
  }

  return {
    prefix: value.slice(0, dashIndex + 1),
    shade: value.slice(dashIndex + 1),
  };
}

function readRouteUrlEditorHashSuggestions(args: {
  currentHref: string;
  draftRouteAddress: string;
  hashKeys: readonly string[];
  origin: string;
  routesByPath: AppRouter["routesByPath"];
  selectionRouteIndex: number;
  viewer: NoterRoutePermissionViewer;
}): readonly RouteUrlEditorSuggestion[] {
  const parts = parseRouteAddress(args.draftRouteAddress);
  if (parts.hash === null || args.selectionRouteIndex <= parts.hash.start) {
    return [];
  }

  const routePath = readMatchingRoutePath({
    path: parts.path,
    routeSurface: readRouteUrlPathSuggestionSurface({
      currentHref: args.currentHref,
      draftHref: args.draftRouteAddress,
      origin: args.origin,
    }),
    routesByPath: args.routesByPath,
    viewer: args.viewer,
  });
  const routeHashKeys =
    typeof routePath === "string" ? (ROUTE_URL_HASH_KEYS_BY_PATH[routePath] ?? []) : [];
  const currentRouteParts = parseRouteAddress(args.currentHref);
  const documentHashKeys = parts.path === currentRouteParts.path ? args.hashKeys : [];

  return uniqueStrings([...GLOBAL_ROUTE_URL_HASH_KEYS, ...routeHashKeys, ...documentHashKeys]).map(
    (key) => ({
      key,
      kind: "hash",
      value: `#${key}`,
    }),
  );
}

function readRouteUrlEditorSearchParamSuggestions(args: {
  currentHref: string;
  draftRouteAddress: string;
  origin: string;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRoutePermissionViewer;
}): readonly NoterRouteSearchParamSuggestion[] {
  const parts = parseRouteAddress(args.draftRouteAddress);
  const routeSearchParamSuggestions = readMatchingRouteSearchParamSuggestions({
    path: parts.path,
    routeSurface: readRouteUrlPathSuggestionSurface({
      currentHref: args.currentHref,
      draftHref: args.draftRouteAddress,
      origin: args.origin,
    }),
    routesByPath: args.routesByPath,
    viewer: args.viewer,
  });

  return uniqueRouteUrlSearchParamSuggestions([
    ...readAccessibleRouteUrlSearchParamSuggestions(routeSearchParamSuggestions, args.viewer),
    ...readAccessibleRouteUrlSearchParamSuggestions(
      ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS,
      args.viewer,
    ),
  ]).sort(compareRouteUrlSearchParamSuggestions);
}

function readAccessibleRouteUrlSearchParamSuggestions(
  suggestions: readonly NoterRouteSearchParamSuggestion[],
  viewer: NoterRoutePermissionViewer,
): NoterRouteSearchParamSuggestion[] {
  return suggestions.filter((suggestion) =>
    canAccessNoterRoutePermission(suggestion.permission, viewer),
  );
}

function compareRouteUrlSearchParamSuggestions(
  left: NoterRouteSearchParamSuggestion,
  right: NoterRouteSearchParamSuggestion,
): number {
  return left.key.localeCompare(right.key);
}

function uniqueRouteUrlSearchParamSuggestions(
  values: readonly NoterRouteSearchParamSuggestion[],
): NoterRouteSearchParamSuggestion[] {
  const keys = new Set<string>();
  const uniqueValues: NoterRouteSearchParamSuggestion[] = [];

  for (const value of values) {
    if (keys.has(value.key)) {
      continue;
    }

    keys.add(value.key);
    uniqueValues.push(value);
  }

  return uniqueValues;
}

function readMatchingRouteSearchParamSuggestions(args: {
  path: string;
  routeSurface: NoterRouteSurface;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRoutePermissionViewer;
}): readonly NoterRouteSearchParamSuggestion[] {
  const matches = entries(args.routesByPath)
    .filter(
      ([routePath, route]) =>
        isUserFacingAccessibleRoute(
          routePath,
          route.options.staticData,
          args.viewer,
          args.routeSurface,
        ) && routePathTemplateMatchesPath(routePath, args.path),
    )
    .map(([routePath, route]) => ({
      routePath,
      searchParamSuggestions: route.options.staticData.searchParamSuggestions ?? [],
    }))
    .sort((left, right) => compareRoutePathSpecificity(left.routePath, right.routePath));

  return matches[0]?.searchParamSuggestions ?? [];
}

function readMatchingRoutePath(args: {
  path: string;
  routeSurface: NoterRouteSurface;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRoutePermissionViewer;
}): string | null {
  const matches = entries(args.routesByPath)
    .filter(
      ([routePath, route]) =>
        isUserFacingAccessibleRoute(
          routePath,
          route.options.staticData,
          args.viewer,
          args.routeSurface,
        ) && routePathTemplateMatchesPath(routePath, args.path),
    )
    .map(([routePath]) => routePath)
    .sort(compareRoutePathSpecificity);

  return matches[0] ?? null;
}

function isUserFacingAccessibleRoute(
  path: string,
  staticData: NoterRouteStaticData,
  viewer: NoterRoutePermissionViewer,
  routeSurface: NoterRouteSurface,
): boolean {
  return (
    (path === "/" || (path.startsWith("/") && !path.startsWith("/_"))) &&
    canAccessNoterRouteStaticData(staticData, viewer, routeSurface)
  );
}

function routePathTemplateMatchesPath(templatePath: string, path: string): boolean {
  if (templatePath === "/") {
    return path === "/";
  }

  const templateSegments = readRoutePathSegments(templatePath);
  const pathSegments = readRoutePathSegments(path);

  for (const [index, templateSegment] of templateSegments.entries()) {
    const pathSegment = pathSegments[index];
    if (templateSegment === "$" && index === templateSegments.length - 1) {
      return typeof pathSegment === "string";
    }

    if (typeof pathSegment !== "string" || pathSegment.length === 0) {
      return false;
    }

    if (templateSegment.startsWith("$")) {
      continue;
    }

    if (templateSegment !== pathSegment) {
      return false;
    }
  }

  return templateSegments.length === pathSegments.length;
}

function compareRoutePathSpecificity(left: string, right: string): number {
  return readRoutePathSpecificity(right) - readRoutePathSpecificity(left);
}

function readRoutePathSpecificity(path: string): number {
  return readRoutePathSegments(path).reduce((score, segment) => {
    if (segment === "$") {
      return score - 1;
    }

    if (segment.startsWith("$")) {
      return score + 1;
    }

    return score + 10;
  }, 0);
}

function readRouteUrlEditorSearchToken(
  routeAddress: string,
  selectionRouteIndex: number,
): SearchToken | null {
  const cursorContext = readRouteAddressCursorContext(
    parseRouteAddress(routeAddress),
    selectionRouteIndex,
  );
  if (cursorContext.kind !== "searchKey" && cursorContext.kind !== "searchValue") {
    return null;
  }

  return readRouteUrlEditorSearchTokenView({
    editing: cursorContext.kind === "searchValue" ? "value" : "key",
    routeToken: cursorContext.token,
  });
}

function readRouteUrlEditorSearchTokens(routeAddress: string): readonly SearchToken[] {
  return (
    parseRouteAddress(routeAddress).search?.tokens.map((routeToken) =>
      readRouteUrlEditorSearchTokenView({
        editing: routeToken.kind === "value" ? "value" : "key",
        routeToken,
      }),
    ) ?? []
  );
}

function readRouteUrlEditorSearchTokenView(args: {
  editing: "key" | "value";
  routeToken: RouteAddressSearchToken;
}): SearchToken {
  return {
    editing: args.editing,
    first: args.routeToken.delimiter === "?",
    hasValueSeparator: args.routeToken.kind === "value",
    key: args.routeToken.key,
    routeToken: args.routeToken,
    tokenEnd: args.routeToken.tokenEnd,
    tokenStart: args.routeToken.tokenStart,
    value: args.routeToken.kind === "value" ? args.routeToken.value : "",
    valueStart:
      args.routeToken.kind === "value" ? args.routeToken.valueStart : args.routeToken.tokenEnd,
  };
}

function formatRouteUrlEditorSearchSuggestionValue(
  key: string,
  searchParamKind: NoterRouteSearchParamSuggestion["searchParamKind"],
  first: boolean,
): string {
  const prefix = first ? "?" : "&";
  const suffix = searchParamKind === "presence" ? "" : "=";
  return `${prefix}${key}${suffix}`;
}

function readRoutePathSegments(path: string): readonly string[] {
  return path.slice(1).split("/");
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
