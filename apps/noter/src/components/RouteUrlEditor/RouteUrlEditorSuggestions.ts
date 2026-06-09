import { entries } from "@noter-md/dependent/object";
import {
  canAccessNoterRoutePermission,
  canAccessNoterRouteStaticData,
  type NoterRouteSearchParamSuggestion,
  type NoterRouteSearchParamValueSuggestion,
} from "@/lib/routePermissions";
import {
  hasRouteAddressNonEmptySearchTokenAfter,
  isRouteAddressFinalSearchToken,
  parseRouteAddress,
  readRouteAddressCursorContext,
  readRouteAddressSearchKeysOutsideToken,
  readRouteAddressWithSearchSlot,
  replaceRouteAddressHash,
  replaceRouteAddressPathWithSearchSlot,
  replaceRouteAddressSearchToken,
  replaceRouteAddressSearchValue,
  type RouteAddressSearchToken,
} from "@/lib/routeAddressParts";
import {
  readRouteUrlPathSuggestionSurface,
  readRouteUrlPathSuggestions,
} from "@/lib/routeUrlPathSuggestions";
import { ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS } from "@/lib/rootRouteSearch";
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
export type Suggestion = {
  kind: "hash" | "path" | "search" | "searchValuePrefix" | "searchValue";
  nextSelectionRouteIndex: number;
  previewRouteAddress: string;
  previewSelectionRouteIndex: number;
  sampleValueStart?: number;
  selectedRouteAddress: string;
  value: string;
};

const GLOBAL_ROUTE_URL_HASH_KEYS = ["top"] as const;

const ROUTE_URL_HASH_KEYS_BY_PATH: Readonly<Record<string, readonly string[]>> = {
  "/machines/connect": ["connected-machines"],
} as const;

/**
Converts the input cursor index into a route-address index.

`selection.start` is a cursor boundary between characters, not a character
index.

Example:

`prefix = "https://noter.md/"`

`inputValue = "https://noter.md/logo?"`

`routeAddress = "/logo?"`

`selection.start = 16` means `inputValue.slice(0, 16) === "https://noter.md"`.
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

/**
Current implementation: path dropdown rows only show concrete URL paths.

Router template paths like `/vault/$` are registry syntax, not something the
user should select into the URL editor. Keep this filter at the dropdown-row
boundary: `readRouteAddressReadiness` still needs template paths to decide
whether a user-typed concrete path has enough segments to load.
*/
function canShowPathSuggestionRow(routePath: string): boolean {
  return !routePath.includes("$");
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
  valueSuggestions: readonly string[],
): string {
  const sampleValue = `${prefix}500`;
  return valueSuggestions.includes(sampleValue) ? sampleValue : prefix;
}

/**
Combines accessible route-specific and global query metadata.

Example: `/logo` owns `top`, while global metadata owns `dev`; both can be
suggested in `/logo?`, and a route-specific duplicate wins after access
filtering.
*/
function readSearchParams(
  routeSearchParamSuggestions: readonly NoterRouteSearchParamSuggestion[],
  viewerIsAdmin: boolean,
): NoterRouteSearchParamSuggestion[] {
  const searchParamSuggestions = [
    ...routeSearchParamSuggestions,
    ...ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS,
  ];
  const seenKeys = new Set<string>();
  const uniqueSuggestions: NoterRouteSearchParamSuggestion[] = [];

  for (const searchParamSuggestion of searchParamSuggestions) {
    if (
      !canAccessNoterRoutePermission(searchParamSuggestion.permission, {
        isAdmin: viewerIsAdmin,
      })
    ) {
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
  searchParamSuggestion: NoterRouteSearchParamValueSuggestion,
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

/**
Turns route metadata into query-key dropdown rows.

Example: in `/logo?dark&depth=2&top=blue-200`, a cursor inside `depth` shows
all query-key rows. The `&border=stone-300` row selects
`/logo?dark&border=stone-300&top=blue-200`, but places the cursor after `border=` so the user can
still choose a different value.
*/
function readSearchRows(args: {
  routeAddress: string;
  routeSearchParamSuggestions: readonly NoterRouteSearchParamSuggestion[];
  searchKeyToken: Extract<RouteAddressSearchToken, { kind: "key" }>;
  viewerIsAdmin: boolean;
}): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const existingKeys = readRouteAddressSearchKeysOutsideToken(
    args.routeAddress,
    args.searchKeyToken,
  );

  for (const searchParamSuggestion of readSearchParams(
    args.routeSearchParamSuggestions,
    args.viewerIsAdmin,
  )) {
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
      ? readRouteAddressWithSearchSlot(selectedRoute.routeAddress)
      : { routeAddress: selectedRoute.routeAddress, selectionRouteIndex: null };
    const finalPreviewRoute = shouldPromptForNextKey
      ? readRouteAddressWithSearchSlot(previewRoute.routeAddress)
      : { routeAddress: previewRoute.routeAddress, selectionRouteIndex: null };

    suggestions.push({
      kind: "search",
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

  return suggestions.sort((left, right) => left.value.localeCompare(right.value));
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
  routeSearchParamSuggestions: readonly NoterRouteSearchParamSuggestion[];
  token: Extract<RouteAddressSearchToken, { kind: "value" }>;
  valuePrefix: string;
  viewerIsAdmin: boolean;
}): Suggestion[] {
  const searchParamSuggestion = readSearchParams(
    args.routeSearchParamSuggestions,
    args.viewerIsAdmin,
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
        ? readRouteAddressWithSearchSlot(selectedRouteAddress)
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
        ? readRouteAddressWithSearchSlot(selectedRouteAddress)
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

function readRouteHashKeys(args: {
  origin: string;
  routeAddress: string;
  routesByPath: AppRouter["routesByPath"];
  viewerIsAdmin: boolean;
}): readonly string[] {
  const parsedRouteAddress = parseRouteAddress(args.routeAddress);
  const routeSurface = readRouteUrlPathSuggestionSurface({
    currentHref: args.routeAddress,
    draftHref: args.routeAddress,
    origin: args.origin,
  });
  const routeEntry = entries(args.routesByPath).find(
    ([routePath, route]) =>
      routePath === parsedRouteAddress.path &&
      canAccessNoterRouteStaticData(
        route.options.staticData,
        { isAdmin: args.viewerIsAdmin },
        routeSurface,
      ),
  );

  return typeof routeEntry === "undefined"
    ? []
    : (ROUTE_URL_HASH_KEYS_BY_PATH[routeEntry[0]] ?? []);
}

function readHashRows(args: {
  hashStart: number;
  prefix: string;
  routeAddress: string;
  routesByPath: AppRouter["routesByPath"];
  viewerIsAdmin: boolean;
}): Suggestion[] {
  const origin = args.prefix.slice(0, -1);

  return uniqueStrings([
    ...GLOBAL_ROUTE_URL_HASH_KEYS,
    ...readRouteHashKeys({
      origin,
      routeAddress: args.routeAddress,
      routesByPath: args.routesByPath,
      viewerIsAdmin: args.viewerIsAdmin,
    }),
  ]).map((key): Suggestion => {
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
*/
function readPathRows(args: {
  prefix: string;
  routeAddress: string;
  routesByPath: AppRouter["routesByPath"];
  viewerIsAdmin: boolean;
}): Suggestion[] {
  const origin = args.prefix.slice(0, -1);

  return readRouteUrlPathSuggestions(
    args.routesByPath,
    { isAdmin: args.viewerIsAdmin },
    readRouteUrlPathSuggestionSurface({
      currentHref: args.routeAddress,
      draftHref: args.routeAddress,
      origin,
    }),
  )
    .filter(canShowPathSuggestionRow)
    .map((suggestionRouteAddress) => {
      const routeWithSearchSlot = replaceRouteAddressPathWithSearchSlot(
        args.routeAddress,
        suggestionRouteAddress,
      );

      return {
        kind: "path",
        nextSelectionRouteIndex:
          routeWithSearchSlot.selectionRouteIndex ?? routeWithSearchSlot.routeAddress.length,
        previewRouteAddress: routeWithSearchSlot.routeAddress,
        previewSelectionRouteIndex: 1,
        selectedRouteAddress: routeWithSearchSlot.routeAddress,
        value: suggestionRouteAddress,
      };
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
  prefix: string;
  routeAddress: string;
  routesByPath: AppRouter["routesByPath"];
  selection: Selection | null;
  viewerIsAdmin: boolean;
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
      hashStart: cursorContext.hash.start,
      prefix: args.prefix,
      routeAddress: args.routeAddress,
      routesByPath: args.routesByPath,
      viewerIsAdmin: args.viewerIsAdmin,
    });
  }

  const routeByPathEntry = entries(args.routesByPath).find(
    ([path]) => path === routeAddressParts.path,
  );
  const routeSearchParamSuggestions =
    routeByPathEntry?.[1].options.staticData.searchParamSuggestions ?? [];

  if (cursorContext.kind === "searchKey") {
    return readSearchRows({
      routeAddress: args.routeAddress,
      routeSearchParamSuggestions,
      searchKeyToken: cursorContext.token,
      viewerIsAdmin: args.viewerIsAdmin,
    });
  }

  return readValueRows({
    routeAddress: args.routeAddress,
    routeSearchParamSuggestions,
    token: cursorContext.token,
    valuePrefix: cursorContext.valuePrefix,
    viewerIsAdmin: args.viewerIsAdmin,
  });
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
