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
  type NoterRouteSearchParamSuggestion,
  type NoterRoutePermissionViewer,
  type NoterRouteStaticData,
} from "@/lib/routePermissions";
import { ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS } from "@/lib/rootRouteSearch";

export type RouteUrlEditorSuggestionKind = "hash" | "path" | "search" | "search-value";

type RouteUrlEditorHashOrPathSuggestion = {
  detail?: string;
  kind: Exclude<RouteUrlEditorSuggestionKind, "search" | "search-value">;
  key: string;
  value: string;
};

type RouteUrlEditorSearchSuggestion =
  | {
      detail?: string;
      kind: "search";
      key: string;
      value: string;
      valueKind: "presence";
    }
  | {
      commitsValue?: true;
      detail?: string;
      kind: "search";
      key: string;
      value: string;
      valueKind: "value";
      valueSuggestions: readonly string[];
    };

type RouteUrlEditorSearchValueSuggestion = {
  detail?: string;
  kind: "search-value";
  key: string;
  replacementValue: string;
  value: string;
};

export type RouteUrlEditorSuggestion =
  | RouteUrlEditorHashOrPathSuggestion
  | RouteUrlEditorSearchSuggestion
  | RouteUrlEditorSearchValueSuggestion;

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
  routeAddress: string;
  selectionRouteIndex: number;
  suggestion: RouteUrlEditorSuggestion;
};

type RouteUrlEditorParts = {
  hash: string;
  hashStart: number | null;
  path: string;
  search: string;
  searchStart: number | null;
};

type SearchToken = {
  editing: "key" | "value";
  first: boolean;
  hasValueSeparator: boolean;
  key: string;
  tokenEnd: number;
  tokenStart: number;
  value: string;
  valueStart: number;
};

type NumericSearchParamValue = {
  number: number;
  raw: string;
};

const GLOBAL_ROUTE_URL_HASH_KEYS = ["top"] as const;

const ROUTE_URL_HASH_KEYS_BY_PATH: Readonly<Record<string, readonly string[]>> = {
  "/machines/connect": ["connected-machines"],
} as const;

export function readRouteUrlEditorSuggestionKind(
  routeAddress: string,
  selectionRouteIndex: number,
): RouteUrlEditorSuggestionKind {
  const hashIndex = routeAddress.indexOf("#");
  if (hashIndex !== -1 && selectionRouteIndex > hashIndex) {
    return "hash";
  }

  const searchIndex = routeAddress.indexOf("?");
  if (
    searchIndex !== -1 &&
    selectionRouteIndex > searchIndex &&
    (hashIndex === -1 || selectionRouteIndex <= hashIndex)
  ) {
    const token = readRouteUrlEditorSearchToken(routeAddress, selectionRouteIndex);
    return token?.editing === "value" ? "search-value" : "search";
  }

  return "path";
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
  routeAddress,
  selectionRouteIndex,
  suggestion,
}: RouteUrlEditorSuggestionSelectionInput): string {
  switch (suggestion.kind) {
    case "path": {
      const parts = readRouteUrlEditorParts(routeAddress);
      const search = parts.searchStart === null ? "" : `?${parts.search}`;
      const hash = parts.hashStart === null ? "" : `#${parts.hash}`;
      return `${suggestion.value}${search}${hash}`;
    }
    case "search": {
      const token = readRouteUrlEditorSearchToken(routeAddress, selectionRouteIndex);
      if (token === null) {
        return routeAddress;
      }

      if (suggestion.valueKind === "value" && suggestion.commitsValue) {
        return applyRouteUrlEditorCommittedSearchSuggestion({
          routeAddress,
          suggestion,
          token,
        });
      }

      const nextToken = suggestion.value;
      return `${routeAddress.slice(0, token.tokenStart)}${nextToken}${routeAddress.slice(
        token.tokenEnd,
      )}`;
    }
    case "search-value": {
      const token = readRouteUrlEditorSearchToken(routeAddress, selectionRouteIndex);
      if (token === null || token.editing !== "value") {
        return routeAddress;
      }

      return `${routeAddress.slice(0, token.valueStart)}${suggestion.replacementValue}${routeAddress.slice(
        token.tokenEnd,
      )}`;
    }
    case "hash": {
      const parts = readRouteUrlEditorParts(routeAddress);
      if (parts.hashStart === null) {
        return `${routeAddress}#${suggestion.key}`;
      }

      return `${routeAddress.slice(0, parts.hashStart)}#${suggestion.key}`;
    }
  }
}

function applyRouteUrlEditorCommittedSearchSuggestion(args: {
  routeAddress: string;
  suggestion: Extract<RouteUrlEditorSearchSuggestion, { valueKind: "value" }>;
  token: SearchToken;
}): string {
  const searchTokens = readRouteUrlEditorSearchTokens(args.routeAddress);
  const replacementToken =
    searchTokens.find(
      (candidate) =>
        candidate.key === args.suggestion.key &&
        areRouteUrlEditorSearchTokensEqual(candidate, args.token),
    ) ??
    searchTokens.find(
      (candidate) => candidate.key === args.suggestion.key && candidate.hasValueSeparator,
    );
  const suggestionTokenText = args.suggestion.value.slice(1);
  const tokenTexts: string[] = [];

  for (const searchToken of searchTokens) {
    const activeToken = areRouteUrlEditorSearchTokensEqual(searchToken, args.token);
    const replaceToken =
      typeof replacementToken !== "undefined" &&
      areRouteUrlEditorSearchTokensEqual(searchToken, replacementToken);

    if (replaceToken || (activeToken && typeof replacementToken === "undefined")) {
      tokenTexts.push(suggestionTokenText);
      continue;
    }

    if (activeToken && typeof replacementToken !== "undefined") {
      continue;
    }

    const tokenText = args.routeAddress.slice(searchToken.tokenStart + 1, searchToken.tokenEnd);
    if (tokenText.length > 0) {
      tokenTexts.push(tokenText);
    }
  }

  const parts = readRouteUrlEditorParts(args.routeAddress);
  const search = tokenTexts.length > 0 ? `?${tokenTexts.join("&")}` : "";
  const hash = parts.hashStart === null ? "" : `#${parts.hash}`;

  return `${parts.path}${search}${hash}`;
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
  const parts = readRouteUrlEditorParts(args.draftRouteAddress);
  if (parts.searchStart === null) {
    return args.draftRouteAddress;
  }

  const searchParamSuggestions = readRouteUrlEditorSearchParamSuggestions(args);
  const routeUpdateSearchTokens = readRouteUrlEditorSearchTokens(args.draftRouteAddress)
    .filter((token) => isRouteUrlEditorSearchTokenReady(token, searchParamSuggestions))
    .map((token) => args.draftRouteAddress.slice(token.tokenStart + 1, token.tokenEnd))
    .filter((tokenText) => tokenText.length > 0);
  const search = routeUpdateSearchTokens.length > 0 ? `?${routeUpdateSearchTokens.join("&")}` : "";
  const hash = parts.hashStart === null ? "" : `#${parts.hash}`;

  return `${parts.path}${search}${hash}`;
}

function isRouteUrlEditorSearchTokenReady(
  token: SearchToken,
  suggestions: readonly NoterRouteSearchParamSuggestion[],
): boolean {
  const suggestion = suggestions.find((value) => value.key === token.key);
  if (!token.hasValueSeparator) {
    if (suggestion?.valueKind === "presence") {
      return true;
    }

    return !(
      suggestion?.valueKind === "value" ||
      (token.key.length > 0 && suggestions.some((value) => value.key.startsWith(token.key)))
    );
  }

  if (!suggestion || suggestion.valueKind === "presence") {
    return true;
  }

  if (token.value.length === 0) {
    return false;
  }

  return (
    suggestion.valueSuggestions.length === 0 || suggestion.valueSuggestions.includes(token.value)
  );
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
      if (suggestion.valueKind === "presence") {
        return [
          {
            key: suggestion.key,
            kind: "search",
            value: formatRouteUrlEditorSearchSuggestionValue(
              suggestion.key,
              suggestion.valueKind,
              token.first,
            ),
            valueKind: "presence",
          },
        ];
      }

      const baseSuggestion: RouteUrlEditorSearchSuggestion = {
        key: suggestion.key,
        kind: "search",
        value: formatRouteUrlEditorSearchSuggestionValue(
          suggestion.key,
          suggestion.valueKind,
          token.first,
        ),
        valueKind: "value",
        valueSuggestions: suggestion.valueSuggestions,
      };

      return [
        ...readRouteUrlEditorNumericSearchSuggestions({
          currentHref: args.currentHref,
          draftRouteAddress: args.draftRouteAddress,
          origin: args.origin,
          suggestion,
          token,
        }),
        baseSuggestion,
      ];
    });
}

function readRouteUrlEditorNumericSearchSuggestions(args: {
  currentHref: string;
  draftRouteAddress: string;
  origin: string;
  suggestion: Extract<NoterRouteSearchParamSuggestion, { valueKind: "value" }>;
  token: SearchToken;
}): RouteUrlEditorSearchSuggestion[] {
  const currentValue = readRouteUrlEditorNumericSearchParamValue({
    currentHref: args.currentHref,
    draftRouteAddress: args.draftRouteAddress,
    key: args.suggestion.key,
    origin: args.origin,
  });
  if (currentValue === null) {
    return [];
  }

  const deltas = [1, -1] as const;
  const suggestions: RouteUrlEditorSearchSuggestion[] = [];

  for (const delta of deltas) {
    const nextNumericValue = currentValue.number + delta;
    const nextValue =
      args.suggestion.valueSuggestions.length === 0
        ? formatRouteUrlEditorNumericSearchValue(nextNumericValue)
        : readRouteUrlEditorNumericValueSuggestion(
            args.suggestion.valueSuggestions,
            nextNumericValue,
          );

    if (nextValue === null) {
      continue;
    }

    suggestions.push({
      commitsValue: true,
      detail: `${currentValue.raw} ${delta > 0 ? "+" : ""}${delta}`,
      key: args.suggestion.key,
      kind: "search",
      value: `${args.token.first ? "?" : "&"}${args.suggestion.key}=${nextValue}`,
      valueKind: "value",
      valueSuggestions: args.suggestion.valueSuggestions,
    });
  }

  return suggestions;
}

function readRouteUrlEditorNumericSearchParamValue(args: {
  currentHref: string;
  draftRouteAddress: string;
  key: string;
  origin: string;
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
    })
  );
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
    if (searchParamSuggestion.key !== token.key || searchParamSuggestion.valueKind !== "value") {
      continue;
    }

    if (searchParamSuggestion.valueCompletion === "tailwind-color-token") {
      return readTailwindColorTokenSearchValueSuggestions({
        key: token.key,
        tokenValue: token.value,
        valueSuggestions: searchParamSuggestion.valueSuggestions,
      });
    }

    return searchParamSuggestion.valueSuggestions
      .filter((value) => value.startsWith(token.value))
      .map((value) => createRouteUrlEditorSearchValueSuggestion(token.key, value, value));
  }

  return [];
}

function createRouteUrlEditorSearchValueSuggestion(
  key: string,
  value: string,
  replacementValue: string,
): RouteUrlEditorSearchValueSuggestion {
  return {
    key: `${key}=${replacementValue}`,
    kind: "search-value",
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
      suggestions.push(
        createRouteUrlEditorSearchValueSuggestion(
          args.key,
          parsedSuggestion.prefix,
          parsedSuggestion.prefix,
        ),
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
  const parts = readRouteUrlEditorParts(args.draftRouteAddress);
  if (parts.hashStart === null || args.selectionRouteIndex <= parts.hashStart) {
    return [];
  }

  const hashDraft = args.draftRouteAddress.slice(parts.hashStart + 1);
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
  const currentRouteParts = readRouteUrlEditorParts(args.currentHref);
  const documentHashKeys = parts.path === currentRouteParts.path ? args.hashKeys : [];

  return uniqueStrings([...GLOBAL_ROUTE_URL_HASH_KEYS, ...routeHashKeys, ...documentHashKeys])
    .filter((key) => key.startsWith(hashDraft))
    .map((key) => ({
      key,
      kind: "hash",
      value: `#${key}`,
    }));
}

function readRouteUrlEditorSearchParamSuggestions(args: {
  currentHref: string;
  draftRouteAddress: string;
  origin: string;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRoutePermissionViewer;
}): readonly NoterRouteSearchParamSuggestion[] {
  const parts = readRouteUrlEditorParts(args.draftRouteAddress);
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
    ...readAccessibleRouteUrlSearchParamSuggestions(
      ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS,
      args.viewer,
    ),
    ...readAccessibleRouteUrlSearchParamSuggestions(routeSearchParamSuggestions, args.viewer),
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
  const parts = readRouteUrlEditorParts(routeAddress);
  if (parts.searchStart === null) {
    return null;
  }

  const searchEnd = parts.hashStart ?? routeAddress.length;
  if (selectionRouteIndex <= parts.searchStart || selectionRouteIndex > searchEnd) {
    return null;
  }

  const boundedSelectionIndex = Math.min(selectionRouteIndex, searchEnd);
  const previousAmpersandIndex = routeAddress.lastIndexOf("&", boundedSelectionIndex - 1);
  const tokenStart =
    previousAmpersandIndex > parts.searchStart ? previousAmpersandIndex : parts.searchStart;
  const nextAmpersandIndex = routeAddress.indexOf("&", boundedSelectionIndex);
  const tokenEnd =
    nextAmpersandIndex === -1 || nextAmpersandIndex > searchEnd ? searchEnd : nextAmpersandIndex;
  const tokenText = routeAddress.slice(tokenStart + 1, tokenEnd);
  const equalsIndex = tokenText.indexOf("=");
  const selectionOffset = boundedSelectionIndex - tokenStart - 1;
  const key = equalsIndex === -1 ? tokenText : tokenText.slice(0, equalsIndex);
  const valueStart = equalsIndex === -1 ? tokenEnd : tokenStart + 1 + equalsIndex + 1;

  return {
    editing: equalsIndex === -1 || selectionOffset <= equalsIndex ? "key" : "value",
    first: tokenStart === parts.searchStart,
    hasValueSeparator: equalsIndex !== -1,
    key,
    tokenEnd,
    tokenStart,
    value: equalsIndex === -1 ? "" : tokenText.slice(equalsIndex + 1),
    valueStart,
  };
}

function readRouteUrlEditorSearchTokens(routeAddress: string): readonly SearchToken[] {
  const parts = readRouteUrlEditorParts(routeAddress);
  if (parts.searchStart === null) {
    return [];
  }

  const searchEnd = parts.hashStart ?? routeAddress.length;
  const tokens: SearchToken[] = [];
  let tokenStart = parts.searchStart;

  while (tokenStart < searchEnd) {
    const nextAmpersandIndex = routeAddress.indexOf("&", tokenStart + 1);
    const tokenEnd =
      nextAmpersandIndex === -1 || nextAmpersandIndex > searchEnd ? searchEnd : nextAmpersandIndex;
    const tokenText = routeAddress.slice(tokenStart + 1, tokenEnd);
    const equalsIndex = tokenText.indexOf("=");
    const key = equalsIndex === -1 ? tokenText : tokenText.slice(0, equalsIndex);
    const valueStart = equalsIndex === -1 ? tokenEnd : tokenStart + 1 + equalsIndex + 1;

    tokens.push({
      editing: equalsIndex === -1 ? "key" : "value",
      first: tokenStart === parts.searchStart,
      hasValueSeparator: equalsIndex !== -1,
      key,
      tokenEnd,
      tokenStart,
      value: equalsIndex === -1 ? "" : tokenText.slice(equalsIndex + 1),
      valueStart,
    });

    tokenStart = tokenEnd;
  }

  return tokens;
}

function formatRouteUrlEditorSearchSuggestionValue(
  key: string,
  valueKind: NoterRouteSearchParamSuggestion["valueKind"],
  first: boolean,
): string {
  const prefix = first ? "?" : "&";
  const suffix = valueKind === "presence" ? "" : "=";
  return `${prefix}${key}${suffix}`;
}

function readRouteUrlEditorParts(routeAddress: string): RouteUrlEditorParts {
  const hashStart = routeAddress.indexOf("#");
  const rawSearchStart = routeAddress.indexOf("?");
  const searchStart =
    rawSearchStart === -1 || (hashStart !== -1 && rawSearchStart > hashStart)
      ? null
      : rawSearchStart;
  const pathEnd = Math.min(
    searchStart ?? routeAddress.length,
    hashStart === -1 ? routeAddress.length : hashStart,
  );
  const searchEnd = hashStart === -1 ? routeAddress.length : hashStart;

  return {
    hash: hashStart === -1 ? "" : routeAddress.slice(hashStart + 1),
    hashStart: hashStart === -1 ? null : hashStart,
    path: routeAddress.slice(0, pathEnd) || "/",
    search: searchStart === null ? "" : routeAddress.slice(searchStart + 1, searchEnd),
    searchStart,
  };
}

function readRoutePathSegments(path: string): readonly string[] {
  return path.slice(1).split("/");
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
