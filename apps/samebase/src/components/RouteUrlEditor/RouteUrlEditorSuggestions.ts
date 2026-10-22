import { readMatchingRouteSearchParamSuggestions } from "@/routing/address";
import {
  ROUTE_SEARCH_PARAM_SUGGESTION_GROUPS,
  canAccessRouteAccess,
  type RouteAccessViewer,
  type RouteSearchParamSuggestion,
  type RouteSearchParamSuggestionGroup,
  type RouteSearchParamValueSuggestion,
} from "@/routing/permissions";
import {
  hasRouteAddressNonEmptySearchTokenAfter,
  isRouteAddressFinalSearchToken,
  openRouteAddressQuerySlot,
  parseRouteAddress,
  readRouteAddressCursorContext,
  readRouteAddressSearchKeysOutsideToken,
  replaceRouteAddressHash,
  replaceRouteAddressPathAndOpenQuerySlot,
  replaceRouteAddressSearchToken,
  replaceRouteAddressSearchValue,
  type RouteAddressSearchToken,
} from "@/routing/addressParts";
import {
  readRoutePathSuggestionForDraft,
  readRouteUrlPathSuggestionEnvironment,
  readRouteUrlPathSuggestions,
} from "@/routing/urlPathSuggestions";
import { ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS } from "@/routeSearch/root";
import type { AppRouter } from "@/router";

type Selection = {
  start: number;
};

/**
One dropdown row has two route addresses:

`previewRouteAddress` is used while hovering, arrowing, or touch-scrolling the row.
`previewSelectionRouteIndex` keeps the cursor at the start of the token being changed:
after `/` for paths, after `?` or `&` for query keys, after `=` for values, and after `-`
for Tailwind shades.

`selectedRouteAddress` is used after click, tap, or Enter.
`nextSelectionRouteIndex` moves the cursor to the next editing slot after that commit. A row such
as `?depth=2` can select `/logo?depth=2` while placing the cursor after `depth=` so value rows stay
visible.
 */
type SuggestionFields = {
  dev?: true;
  nextSelectionRouteIndex: number;
  previewRouteAddress: string;
  previewSelectionRouteIndex: number;
  sampleValueStart?: number;
  selectedRouteAddress: string;
  value: string;
};

export type Suggestion =
  | ({
      kind: "search";
      group: RouteSearchParamSuggestionGroup | null;
    } & SuggestionFields)
  | ({
      kind: "hash" | "path" | "searchValuePrefix" | "searchValue";
    } & SuggestionFields);

type SearchSuggestion = Extract<Suggestion, { kind: "search" }>;

export function readCurrentRouteUrlEditorSuggestionIndex(args: {
  prefix: string;
  routeAddress: string;
  selection: Selection | null;
  suggestions: readonly Suggestion[];
}): number | null {
  const routeAddressParts = parseRouteAddress(args.routeAddress);

  if (args.selection === null) {
    return findSuggestionIndex(args.suggestions, (suggestion) =>
      pathSuggestionMatchesRoutePath(suggestion, routeAddressParts.path),
    );
  }

  const selectionRouteIndex = readSelectionIndex({
    prefix: args.prefix,
    routeAddress: args.routeAddress,
    selection: args.selection,
  });
  const cursorContext = readRouteAddressCursorContext(routeAddressParts, selectionRouteIndex);

  switch (cursorContext.kind) {
    case "path":
      return findSuggestionIndex(args.suggestions, (suggestion) =>
        pathSuggestionMatchesRoutePath(suggestion, routeAddressParts.path),
      );
    case "hash":
      return findSuggestionIndex(
        args.suggestions,
        (suggestion) =>
          suggestion.kind === "hash" && suggestion.value === `#${cursorContext.hash.value}`,
      );
    case "searchKey":
      return findSuggestionIndex(args.suggestions, (suggestion) =>
        searchSuggestionMatchesToken(suggestion, cursorContext.token),
      );
    case "searchValue":
      return findSuggestionIndex(args.suggestions, (suggestion) =>
        searchValueSuggestionMatchesToken({
          suggestion,
          token: cursorContext.token,
          valuePrefix: cursorContext.valuePrefix,
        }),
      );
  }
}

function findSuggestionIndex(
  suggestions: readonly Suggestion[],
  predicate: (suggestion: Suggestion) => boolean,
): number | null {
  const suggestionIndex = suggestions.findIndex(predicate);
  return suggestionIndex === -1 ? null : suggestionIndex;
}

function pathSuggestionMatchesRoutePath(suggestion: Suggestion, path: string): boolean {
  return suggestion.kind === "path" && suggestion.value === path;
}

function searchSuggestionMatchesToken(
  suggestion: Suggestion,
  token: RouteAddressSearchToken,
): boolean {
  if (suggestion.kind !== "search" || token.key.length === 0) {
    return false;
  }

  const tokenValue = `${token.delimiter}${token.key}`;
  return suggestion.value === tokenValue || suggestion.value.startsWith(`${tokenValue}=`);
}

function searchValueSuggestionMatchesToken(args: {
  suggestion: Suggestion;
  token: Extract<RouteAddressSearchToken, { kind: "value" }>;
  valuePrefix: string;
}): boolean {
  if (args.token.value.length === 0) {
    return false;
  }

  const familySeparatorIndex = args.valuePrefix.indexOf("-");
  if (familySeparatorIndex !== -1) {
    const family = args.valuePrefix.slice(0, familySeparatorIndex);
    const shadePrefix = `${family}-`;
    if (args.token.value.startsWith(shadePrefix)) {
      return (
        args.suggestion.kind === "searchValue" &&
        args.suggestion.value === args.token.value.slice(shadePrefix.length)
      );
    }
  }

  if (
    args.suggestion.kind === "searchValuePrefix" &&
    typeof args.suggestion.sampleValueStart === "number"
  ) {
    return args.token.value.startsWith(
      args.suggestion.value.slice(0, args.suggestion.sampleValueStart),
    );
  }

  return args.suggestion.kind === "searchValue" && args.suggestion.value === args.token.value;
}

/**
Converts the input cursor index into a route-address index.

`selection.start` is a cursor boundary between characters, not a character
index.

Example:

`prefix = "https://samebase.com/"`

`inputValue = "https://samebase.com/logo?"`

`routeAddress = "/logo?"`

`selection.start = 16` means `inputValue.slice(0, 16) === "https://samebase.com"`.
That maps to route boundary `0`, before the shared `/`.

`selection.start = 17` means `inputValue.slice(0, 17) === prefix`.
That maps to route boundary `1`, before `l`.

`selection.start = 22` means `inputValue.slice(0, 22) === inputValue`.
That maps to route boundary `6`, after `?`.

The input shows the shared `/` from `prefix`, while `routeAddress` also
stores that same `/`. That is why the formula is:

`routeIndex = selection.start - prefix.length + 1`.
*/
function readSelectionIndex(args: {
  prefix: string;
  routeAddress: string;
  selection: Selection;
}): number {
  const routeIndex = args.selection.start - args.prefix.length + 1;
  return Math.min(Math.max(routeIndex, 0), args.routeAddress.length);
}

type TailwindColorValueCursor =
  | {
      kind: "family";
    }
  | {
      kind: "shade";
      family: string;
    };

function readTailwindColorValueCursor(valuePrefix: string): TailwindColorValueCursor {
  const familyEnd = valuePrefix.indexOf("-");
  if (familyEnd === -1) {
    return {
      kind: "family",
    };
  }

  return {
    kind: "shade",
    family: valuePrefix.slice(0, familyEnd),
  };
}

function readTailwindColorFamilyValues(valueSuggestions: readonly string[]): string[] {
  const families = new Set<string>();

  for (const valueSuggestion of valueSuggestions) {
    const shadeSeparatorIndex = valueSuggestion.lastIndexOf("-");
    if (shadeSeparatorIndex === -1) {
      continue;
    }

    families.add(valueSuggestion.slice(0, shadeSeparatorIndex + 1));
  }

  return [...families];
}

function readTailwindColorFamilySampleValue(
  prefix: string,
  paramSampleValue: string,
  valueSuggestions: readonly string[],
): string {
  const sampleShadeStart = paramSampleValue.lastIndexOf("-") + 1;
  const sampleValue = `${prefix}${paramSampleValue.slice(sampleShadeStart)}`;
  return valueSuggestions.includes(sampleValue) ? sampleValue : prefix;
}

/**
Combines accessible route-specific and global query metadata.

Example: `/logo` owns `top`, while global metadata owns `dev`; both can be
suggested in `/logo?`, and a route-specific duplicate wins after access
filtering.
*/
function readSearchParams(
  routeSearchParamSuggestions: readonly RouteSearchParamSuggestion[],
  viewer: RouteAccessViewer,
): RouteSearchParamSuggestion[] {
  const searchParamSuggestions = [
    ...routeSearchParamSuggestions,
    ...ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS,
  ];
  const seenKeys = new Set<string>();
  const uniqueSuggestions: RouteSearchParamSuggestion[] = [];

  for (const searchParamSuggestion of searchParamSuggestions) {
    if (!canAccessRouteAccess(searchParamSuggestion.access, viewer)) {
      continue;
    }

    if (seenKeys.has(searchParamSuggestion.key)) {
      continue;
    }

    seenKeys.add(searchParamSuggestion.key);
    uniqueSuggestions.push(searchParamSuggestion);
  }

  return uniqueSuggestions;
}

function readSearchParamSampleValue(
  searchParamSuggestion: RouteSearchParamValueSuggestion,
): string | null {
  switch (searchParamSuggestion.valueType) {
    case "manual":
      return null;
    case "completion":
    case "freeform":
    case "numeric":
    case "numeric-options":
    case "options":
      return searchParamSuggestion.sampleValue;
  }
}

function canRecommendSearchParam(
  group: RouteSearchParamSuggestionGroup | undefined,
  routePath: string,
): boolean {
  switch (group) {
    case undefined:
    case "theme":
      return true;
    case "logo":
    case "logo-motion":
    case "logo-view":
      return routePath === "/logo" || routePath.startsWith("/logo/");
  }
}

/**
Turns route metadata into query-key dropdown rows.

Example: in `/logo?dark&depth=2&top=blue-200`, a cursor inside `depth` shows
all query-key rows. The `&border=rose-300` row selects
`/logo?dark&border=rose-300&top=blue-200`, but places the cursor after `border=` so the user can
still choose a different value.
*/
function readSearchRows(args: {
  routeAddress: string;
  routeSearchParamSuggestions: readonly RouteSearchParamSuggestion[];
  searchKeyToken: RouteAddressSearchToken;
  viewer: RouteAccessViewer;
}): SearchSuggestion[] {
  const suggestions: SearchSuggestion[] = [];
  const routePath = parseRouteAddress(args.routeAddress).path;
  const existingKeys = readRouteAddressSearchKeysOutsideToken(
    args.routeAddress,
    args.searchKeyToken,
  );

  for (const searchParamSuggestion of readSearchParams(
    args.routeSearchParamSuggestions,
    args.viewer,
  )) {
    if (!canRecommendSearchParam(searchParamSuggestion.group, routePath)) {
      continue;
    }

    if (existingKeys.has(searchParamSuggestion.key)) {
      continue;
    }

    const tokenSuffix = searchParamSuggestion.searchParamKind === "value" ? "=" : "";
    const selectedTokenText = `${searchParamSuggestion.key}${tokenSuffix}`;
    const selectedValue = `${args.searchKeyToken.delimiter}${selectedTokenText}`;
    const sampleValue =
      searchParamSuggestion.searchParamKind === "value"
        ? readSearchParamSampleValue(searchParamSuggestion)
        : null;
    const previewTokenText =
      typeof sampleValue === "string" ? `${selectedTokenText}${sampleValue}` : selectedTokenText;
    const previewValue = `${args.searchKeyToken.delimiter}${previewTokenText}`;
    const selectedSearchTokenText =
      typeof sampleValue === "string" ? previewTokenText : selectedTokenText;
    const selectedRoute = replaceRouteAddressSearchToken({
      dedupeKey: searchParamSuggestion.key,
      replacementTokenText: selectedSearchTokenText,
      routeAddress: args.routeAddress,
      token: args.searchKeyToken,
    });
    const previewRoute = replaceRouteAddressSearchToken({
      dedupeKey: searchParamSuggestion.key,
      replacementTokenText: previewTokenText,
      routeAddress: args.routeAddress,
      token: args.searchKeyToken,
    });
    const shouldPromptForNextKey =
      searchParamSuggestion.searchParamKind === "presence" &&
      !hasRouteAddressNonEmptySearchTokenAfter({
        routeAddress: selectedRoute.routeAddress,
        tokenStart: selectedRoute.replacementTokenStart,
      });
    const finalSelectedRoute = shouldPromptForNextKey
      ? openRouteAddressQuerySlot(selectedRoute.routeAddress)
      : { routeAddress: selectedRoute.routeAddress, selectionRouteIndex: null };
    const finalPreviewRoute = shouldPromptForNextKey
      ? openRouteAddressQuerySlot(previewRoute.routeAddress)
      : { routeAddress: previewRoute.routeAddress, selectionRouteIndex: null };

    suggestions.push({
      kind: "search",
      group: searchParamSuggestion.group ?? null,
      nextSelectionRouteIndex: shouldPromptForNextKey
        ? (finalSelectedRoute.selectionRouteIndex ?? selectedRoute.replacementTokenStart)
        : selectedRoute.replacementTokenStart + 1 + selectedTokenText.length,
      previewRouteAddress: finalPreviewRoute.routeAddress,
      previewSelectionRouteIndex: previewRoute.replacementTokenStart + 1,
      sampleValueStart: typeof sampleValue === "string" ? selectedValue.length : undefined,
      selectedRouteAddress: finalSelectedRoute.routeAddress,
      value: previewValue,
    });
  }

  return suggestions.sort((left, right) => {
    if (left.group === right.group) {
      return left.value.localeCompare(right.value);
    }

    const leftGroupIndex =
      left.group === null ? -1 : ROUTE_SEARCH_PARAM_SUGGESTION_GROUPS.indexOf(left.group);
    const rightGroupIndex =
      right.group === null ? -1 : ROUTE_SEARCH_PARAM_SUGGESTION_GROUPS.indexOf(right.group);
    return leftGroupIndex - rightGroupIndex;
  });
}

/**
Turns a value token into concrete value rows.

Example: `/logo?top=blue-200` with the cursor before `-` shows color-family
rows such as `red-500`. Selecting it uses `/logo?top=red-500`, but places the
cursor after `red-` so the user can still choose the shade.

Example: `/logo?top=blue-200` with the cursor after `-` shows shade rows for
the `blue` family. Selecting `500` uses `/logo?top=blue-500`.
*/
function readValueRows(args: {
  routeAddress: string;
  routeSearchParamSuggestions: readonly RouteSearchParamSuggestion[];
  token: Extract<RouteAddressSearchToken, { kind: "value" }>;
  valuePrefix: string;
  viewer: RouteAccessViewer;
}): Suggestion[] {
  const searchParamSuggestion = readSearchParams(
    args.routeSearchParamSuggestions,
    args.viewer,
  ).find((suggestion) => suggestion.key === args.token.key);
  if (!searchParamSuggestion) {
    return [];
  }

  if (searchParamSuggestion.searchParamKind !== "value") {
    return [];
  }

  let replacementValues: readonly string[] | null = null;

  switch (searchParamSuggestion.valueType) {
    case "manual":
      return [];
    case "numeric":
      replacementValues = searchParamSuggestion.valueSuggestions ?? [
        searchParamSuggestion.sampleValue,
      ];
      break;
    case "freeform":
      replacementValues = [searchParamSuggestion.sampleValue];
      break;
    case "numeric-options":
    case "options":
      replacementValues = searchParamSuggestion.valueSuggestions;
      break;
    case "completion":
      break;
  }

  if (replacementValues) {
    return replacementValues.map((value): Suggestion => {
      const selectedRouteAddress = replaceRouteAddressSearchValue({
        routeAddress: args.routeAddress,
        token: args.token,
        value,
      });
      const shouldPromptForNextKey = isRouteAddressFinalSearchToken({
        routeAddress: args.routeAddress,
        token: args.token,
      });
      const finalSelectedRoute = shouldPromptForNextKey
        ? openRouteAddressQuerySlot(selectedRouteAddress)
        : { routeAddress: selectedRouteAddress, selectionRouteIndex: null };

      return {
        kind: "searchValue",
        nextSelectionRouteIndex: shouldPromptForNextKey
          ? (finalSelectedRoute.selectionRouteIndex ?? args.token.valueStart)
          : args.token.valueStart + value.length,
        previewRouteAddress: selectedRouteAddress,
        previewSelectionRouteIndex: args.token.valueStart,
        selectedRouteAddress: finalSelectedRoute.routeAddress,
        value,
      };
    });
  }

  if (searchParamSuggestion.valueType !== "completion") {
    return [];
  }

  const colorValueCursor = readTailwindColorValueCursor(args.valuePrefix);
  if (colorValueCursor.kind === "family") {
    return readTailwindColorFamilyValues(searchParamSuggestion.valueSuggestions).map(
      (value): Suggestion => {
        const sampleValue = readTailwindColorFamilySampleValue(
          value,
          searchParamSuggestion.sampleValue,
          searchParamSuggestion.valueSuggestions,
        );

        return {
          kind: "searchValuePrefix",
          nextSelectionRouteIndex: args.token.valueStart + value.length,
          previewRouteAddress: replaceRouteAddressSearchValue({
            routeAddress: args.routeAddress,
            token: args.token,
            value: sampleValue,
          }),
          previewSelectionRouteIndex: args.token.valueStart,
          sampleValueStart: value.length,
          selectedRouteAddress: replaceRouteAddressSearchValue({
            routeAddress: args.routeAddress,
            token: args.token,
            value: sampleValue,
          }),
          value: sampleValue,
        };
      },
    );
  }

  const shadePrefix = `${colorValueCursor.family}-`;

  return searchParamSuggestion.valueSuggestions
    .filter((value) => value.startsWith(shadePrefix))
    .map((value): Suggestion => {
      const selectedRouteAddress = replaceRouteAddressSearchValue({
        routeAddress: args.routeAddress,
        token: args.token,
        value,
      });
      const shouldPromptForNextKey = isRouteAddressFinalSearchToken({
        routeAddress: args.routeAddress,
        token: args.token,
      });
      const finalSelectedRoute = shouldPromptForNextKey
        ? openRouteAddressQuerySlot(selectedRouteAddress)
        : { routeAddress: selectedRouteAddress, selectionRouteIndex: null };
      const shadeValue = value.slice(shadePrefix.length);

      return {
        kind: "searchValue",
        nextSelectionRouteIndex: shouldPromptForNextKey
          ? (finalSelectedRoute.selectionRouteIndex ?? args.token.valueStart)
          : args.token.valueStart + value.length,
        previewRouteAddress: selectedRouteAddress,
        previewSelectionRouteIndex: args.token.valueStart + shadePrefix.length,
        selectedRouteAddress: finalSelectedRoute.routeAddress,
        value: shadeValue,
      };
    });
}

function readHashRows(args: {
  currentRouteAddress: string;
  hashStart: number;
  pageHashKeys: readonly string[];
  routeAddress: string;
}): Suggestion[] {
  const routeAddressParts = parseRouteAddress(args.routeAddress);
  const currentRouteAddressParts = parseRouteAddress(args.currentRouteAddress);
  const pageHashKeys =
    routeAddressParts.path === currentRouteAddressParts.path ? args.pageHashKeys : [];

  return pageHashKeys.map((key): Suggestion => {
    const routeAddress = replaceRouteAddressHash(args.routeAddress, key);

    return {
      kind: "hash",
      nextSelectionRouteIndex: routeAddress.length,
      previewRouteAddress: routeAddress,
      previewSelectionRouteIndex: args.hashStart + 1,
      selectedRouteAddress: routeAddress,
      value: `#${key}`,
    };
  });
}

/**
Reads path dropdown rows from the router registry.

Example: `/terms?top=red-` plus path suggestion `/privacy` becomes
`/privacy?top=red-`, because path suggestions replace only the path part.

Rows only show concrete URL paths. Router template paths like `/repo/$` are registry syntax, not
something the user should select into the URL editor, so a template shows only with its dynamic
segments taken from the draft path (`readRoutePathSuggestionForDraft`): on `/repo/acme/demo`, the
row `/repo/acme/demo/alchemy`. `readRouteAddressReadiness` still needs template paths to decide
whether a user-typed concrete path has enough segments to load.
*/
function readPathRows(args: {
  prefix: string;
  routeAddress: string;
  routesByPath: AppRouter["routesByPath"];
  viewer: RouteAccessViewer;
}): Suggestion[] {
  const origin = args.prefix.slice(0, -1);
  const routeAddressParts = parseRouteAddress(args.routeAddress);

  return readRouteUrlPathSuggestions(
    args.routesByPath,
    args.viewer,
    readRouteUrlPathSuggestionEnvironment({
      currentHref: args.routeAddress,
      draftHref: args.routeAddress,
      origin,
    }),
    routeAddressParts.search?.tokens.some((token) => token.key === "dev") ?? false,
  ).flatMap((routePath): Suggestion[] => {
    const path = readRoutePathSuggestionForDraft(routePath, routeAddressParts.path);
    if (path === null) {
      return [];
    }
    const routeWithQuerySlot = replaceRouteAddressPathAndOpenQuerySlot(args.routeAddress, path);
    const routeStaticData = args.routesByPath[routePath].options.staticData;

    return [
      {
        kind: "path",
        ...(routeStaticData.pathSuggestion === "dev" ? { dev: true as const } : {}),
        nextSelectionRouteIndex:
          routeWithQuerySlot.selectionRouteIndex ?? routeWithQuerySlot.routeAddress.length,
        previewRouteAddress: routeWithQuerySlot.routeAddress,
        previewSelectionRouteIndex: 1,
        selectedRouteAddress: routeWithQuerySlot.routeAddress,
        value: path,
      },
    ];
  });
}

/**
Chooses which suggestions to show for the current cursor position.

Example: `/logo?` with cursor after `?` shows query-key rows like `?top=`.

Example: `/logo?top=blue-500` with cursor in `/logo` shows path rows.

Example: `/logo?top=blue-2` with cursor after `2` shows value rows like
`blue-200`.
*/
export function readSuggestions(args: {
  currentRouteAddress: string;
  pageHashKeys: readonly string[];
  prefix: string;
  routeAddress: string;
  routesByPath: AppRouter["routesByPath"];
  selection: Selection | null;
  viewer: RouteAccessViewer;
}): Suggestion[] {
  const routeAddressParts = parseRouteAddress(args.routeAddress);

  if (args.selection === null) {
    return readPathRows(args);
  }

  const selectionRouteIndex = readSelectionIndex({
    prefix: args.prefix,
    routeAddress: args.routeAddress,
    selection: args.selection,
  });
  const cursorContext = readRouteAddressCursorContext(routeAddressParts, selectionRouteIndex);

  if (cursorContext.kind === "path") {
    return readPathRows(args);
  }

  if (cursorContext.kind === "hash") {
    return readHashRows({
      currentRouteAddress: args.currentRouteAddress,
      hashStart: cursorContext.hash.start,
      pageHashKeys: args.pageHashKeys,
      routeAddress: args.routeAddress,
    });
  }

  const routeSearchParamSuggestions = readMatchingRouteSearchParamSuggestions({
    path: routeAddressParts.path,
    routeEnvironment: readRouteUrlPathSuggestionEnvironment({
      currentHref: args.currentRouteAddress,
      draftHref: args.routeAddress,
      origin: args.prefix,
    }),
    routesByPath: args.routesByPath,
    viewer: args.viewer,
  });

  if (cursorContext.kind === "searchKey") {
    return readSearchRows({
      routeAddress: args.routeAddress,
      routeSearchParamSuggestions,
      searchKeyToken: cursorContext.token,
      viewer: args.viewer,
    });
  }

  return readValueRows({
    routeAddress: args.routeAddress,
    routeSearchParamSuggestions,
    token: cursorContext.token,
    valuePrefix: cursorContext.valuePrefix,
    viewer: args.viewer,
  });
}
