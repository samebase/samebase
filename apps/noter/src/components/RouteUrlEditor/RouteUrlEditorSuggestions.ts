import { entries } from "@noter-md/dependent/object";
import {
  canAccessNoterRoutePermission,
  canAccessNoterRouteStaticData,
  type NoterRouteSearchParamSuggestion,
  type NoterRouteSearchParamValueSuggestion,
} from "@/lib/routePermissions";
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

/**
Query token ranges use the same half-open indexes as `String.prototype.slice`.

Example: `/logo?`

```txt
index:  0 1 2 3 4 5
char:   / l o g o ?
```

The empty key token has `tokenStart: 5` and `tokenEnd: 6`.
`tokenStart` points at the token delimiter, `?` or `&`, and is inclusive.
`tokenEnd` points one character after the token and is exclusive.
*/
export type SearchToken =
  | {
      kind: "key";
      key: string;
      tokenStart: number;
      tokenEnd: number;
    }
  | {
      kind: "value";
      key: string;
      tokenStart: number;
      tokenEnd: number;
      value: string;
      valueStart: number;
    };

export type ParsedRouteAddress = {
  path: string;
  search: {
    start: number;
    tokens: SearchToken[];
  } | null;
};

type CursorContext =
  | {
      hashStart: number;
      kind: "hash";
    }
  | {
      kind: "path";
    }
  | {
      kind: "searchKey";
      token: Extract<SearchToken, { kind: "key" }>;
    }
  | {
      kind: "searchValue";
      token: Extract<SearchToken, { kind: "value" }>;
      valuePrefix: string;
    };

const GLOBAL_ROUTE_URL_HASH_KEYS = ["top"] as const;

const ROUTE_URL_HASH_KEYS_BY_PATH: Readonly<Record<string, readonly string[]>> = {
  "/machines/connect": ["connected-machines"],
} as const;

/**
Parses the route address into path plus query tokens.

Example: `/logo?top=blue-500&secondary=rose-500` becomes path `/logo`
plus two value tokens, one for `top` and one for `secondary`.
*/
export function parseRouteAddress(routeAddress: string): ParsedRouteAddress {
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

  if (searchStart === null) {
    return {
      path: routeAddress.slice(0, pathEnd) || "/",
      search: null,
    };
  }

  const path = routeAddress.slice(0, searchStart) || "/";
  const searchEnd = hashStart === -1 ? routeAddress.length : hashStart;
  const tokens: SearchToken[] = [];
  let tokenStart = searchStart;

  while (tokenStart < searchEnd) {
    const nextAmpersandIndex = routeAddress.indexOf("&", tokenStart + 1);
    const tokenEnd =
      nextAmpersandIndex === -1 || nextAmpersandIndex > searchEnd ? searchEnd : nextAmpersandIndex;
    const tokenText = routeAddress.slice(tokenStart + 1, tokenEnd);
    const equalsIndex = tokenText.indexOf("=");

    if (equalsIndex === -1) {
      tokens.push({
        kind: "key",
        key: tokenText,
        tokenStart,
        tokenEnd,
      });
    } else {
      tokens.push({
        kind: "value",
        key: tokenText.slice(0, equalsIndex),
        tokenStart,
        tokenEnd,
        value: tokenText.slice(equalsIndex + 1),
        valueStart: tokenStart + 1 + equalsIndex + 1,
      });
    }

    tokenStart = tokenEnd;
  }

  return {
    path,
    search: {
      start: searchStart,
      tokens,
    },
  };
}

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

function readHashStart(routeAddress: string): number | null {
  const hashStart = routeAddress.indexOf("#");
  return hashStart === -1 ? null : hashStart;
}

function readHashSuffix(routeAddress: string): string {
  const hashStart = readHashStart(routeAddress);
  return hashStart === null ? "" : routeAddress.slice(hashStart);
}

function readSearchEnd(routeAddress: string): number {
  return readHashStart(routeAddress) ?? routeAddress.length;
}

function appendSearchParamDelimiter(routeAddress: string): string {
  const hashStart = readHashStart(routeAddress);
  const searchEnd = hashStart ?? routeAddress.length;
  const routeAddressBeforeHash = routeAddress.slice(0, searchEnd);
  const hash = routeAddress.slice(searchEnd);

  if (
    routeAddressBeforeHash === "/" ||
    routeAddressBeforeHash.endsWith("?") ||
    routeAddressBeforeHash.endsWith("&")
  ) {
    return routeAddress;
  }

  return `${routeAddressBeforeHash}${routeAddressBeforeHash.includes("?") ? "&" : "?"}${hash}`;
}

function applyPathSuggestion(routeAddress: string, suggestionPath: string): string {
  const parsedRouteAddress = parseRouteAddress(routeAddress);
  if (parsedRouteAddress.search === null) {
    return appendSearchParamDelimiter(`${suggestionPath}${readHashSuffix(routeAddress)}`);
  }

  return `${suggestionPath}${routeAddress.slice(parsedRouteAddress.search.start)}`;
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

function areSearchTokensEqual(left: SearchToken, right: SearchToken): boolean {
  return left.tokenStart === right.tokenStart && left.tokenEnd === right.tokenEnd;
}

function readSearchTokenText(routeAddress: string, token: SearchToken): string {
  return routeAddress.slice(token.tokenStart + 1, token.tokenEnd);
}

function readSearchKeysOutsideToken(routeAddress: string, activeToken: SearchToken): Set<string> {
  const parsedRouteAddress = parseRouteAddress(routeAddress);
  const keys = new Set<string>();

  if (parsedRouteAddress.search === null) {
    return keys;
  }

  for (const token of parsedRouteAddress.search.tokens) {
    if (areSearchTokensEqual(token, activeToken) || token.key.length === 0) {
      continue;
    }

    keys.add(token.key);
  }

  return keys;
}

/**
Replaces one query token and removes duplicate tokens for the replacement key.

Example: replacing `border=stone-300` with `dev` in
`/terms?border=stone-300&dev&depth=2&light&` returns
`/terms?dev&depth=2&light&`, not `/terms?dev&dev&depth=2&light&`.
*/
function replaceSearchToken(args: {
  replacementKey: string;
  replacementTokenText: string;
  routeAddress: string;
  token: SearchToken;
}) {
  const parsedRouteAddress = parseRouteAddress(args.routeAddress);
  if (parsedRouteAddress.search === null) {
    return {
      replacementTokenStart: args.routeAddress.length,
      routeAddress: args.routeAddress,
    };
  }

  let routeAddress = parsedRouteAddress.path;
  let replacementTokenStart = routeAddress.length;
  let tokenDelimiter = "?";

  for (const token of parsedRouteAddress.search.tokens) {
    const activeToken = areSearchTokensEqual(token, args.token);
    if (!activeToken && token.key === args.replacementKey) {
      continue;
    }

    const tokenText = activeToken
      ? args.replacementTokenText
      : readSearchTokenText(args.routeAddress, token);
    const tokenStart = routeAddress.length;

    routeAddress = `${routeAddress}${tokenDelimiter}${tokenText}`;
    tokenDelimiter = "&";

    if (activeToken) {
      replacementTokenStart = tokenStart;
    }
  }

  return {
    replacementTokenStart,
    routeAddress: `${routeAddress}${readHashSuffix(args.routeAddress)}`,
  };
}

/**
Checks the rebuilt route, not the original route.

Example: replacing `border=stone-300` with `dev` in `/terms?border=stone-300&dev&`
rebuilds `/terms?dev&`. The old `dev` was removed, and the remaining empty token is the next
editable slot, so this returns false.
*/
function hasNonEmptySearchTokenAfterReplacement(args: {
  replacementTokenStart: number;
  routeAddress: string;
}): boolean {
  const parsedRouteAddress = parseRouteAddress(args.routeAddress);
  if (parsedRouteAddress.search === null) {
    return false;
  }

  const replacementTokenIndex = parsedRouteAddress.search.tokens.findIndex(
    (token) => token.tokenStart === args.replacementTokenStart,
  );
  if (replacementTokenIndex === -1) {
    return false;
  }

  return parsedRouteAddress.search.tokens
    .slice(replacementTokenIndex + 1)
    .some((token) => readSearchTokenText(args.routeAddress, token).length > 0);
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
Classifies the cursor from the parsed route address.

Example: `/logo?to` with cursor after `to` returns `searchKey` for key `to`.

Example: `/logo?top=blue-500&se` with cursor after `se` returns `searchKey`
for key `se`; the token starts at the `&` delimiter.

Example: `/logo?top=blue-500` with cursor inside `blue-500` returns
`searchValue`, so value suggestions can be added without reparsing strings.
*/
function readCursorContext(
  routeAddress: string,
  parsedRouteAddress: ParsedRouteAddress,
  selectionRouteIndex: number,
): CursorContext {
  const hashStart = readHashStart(routeAddress);
  if (hashStart !== null && selectionRouteIndex > hashStart) {
    return {
      hashStart,
      kind: "hash",
    };
  }

  if (
    parsedRouteAddress.search === null ||
    selectionRouteIndex <= parsedRouteAddress.search.start
  ) {
    return {
      kind: "path",
    };
  }

  for (const token of parsedRouteAddress.search.tokens) {
    if (selectionRouteIndex <= token.tokenStart || selectionRouteIndex > token.tokenEnd) {
      continue;
    }

    if (token.kind === "key") {
      return {
        kind: "searchKey",
        token,
      };
    }

    if (selectionRouteIndex < token.valueStart) {
      return {
        kind: "searchKey",
        token: {
          kind: "key",
          key: token.key,
          tokenStart: token.tokenStart,
          tokenEnd: token.tokenEnd,
        },
      };
    }

    return {
      kind: "searchValue",
      token,
      valuePrefix: token.value.slice(0, selectionRouteIndex - token.valueStart),
    };
  }

  return {
    kind: "path",
  };
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
  searchKeyToken: Extract<SearchToken, { kind: "key" }>;
  viewerIsAdmin: boolean;
}): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const existingKeys = readSearchKeysOutsideToken(args.routeAddress, args.searchKeyToken);

  for (const searchParamSuggestion of readSearchParams(
    args.routeSearchParamSuggestions,
    args.viewerIsAdmin,
  )) {
    if (existingKeys.has(searchParamSuggestion.key)) {
      continue;
    }

    const tokenDelimiter = args.routeAddress.slice(
      args.searchKeyToken.tokenStart,
      args.searchKeyToken.tokenStart + 1,
    );
    const tokenSuffix = searchParamSuggestion.searchParamKind === "value" ? "=" : "";
    const selectedTokenText = `${searchParamSuggestion.key}${tokenSuffix}`;
    const selectedValue = `${tokenDelimiter}${selectedTokenText}`;
    const sampleValue =
      searchParamSuggestion.searchParamKind === "value"
        ? readSearchParamSampleValue(searchParamSuggestion)
        : null;
    const previewTokenText =
      typeof sampleValue === "string" ? `${selectedTokenText}${sampleValue}` : selectedTokenText;
    const previewValue = `${tokenDelimiter}${previewTokenText}`;
    const selectedSearchTokenText =
      typeof sampleValue === "string" ? previewTokenText : selectedTokenText;
    const selectedRoute = replaceSearchToken({
      replacementKey: searchParamSuggestion.key,
      replacementTokenText: selectedSearchTokenText,
      routeAddress: args.routeAddress,
      token: args.searchKeyToken,
    });
    const previewRoute = replaceSearchToken({
      replacementKey: searchParamSuggestion.key,
      replacementTokenText: previewTokenText,
      routeAddress: args.routeAddress,
      token: args.searchKeyToken,
    });
    const shouldPromptForNextKey =
      searchParamSuggestion.searchParamKind === "presence" &&
      !hasNonEmptySearchTokenAfterReplacement({
        replacementTokenStart: selectedRoute.replacementTokenStart,
        routeAddress: selectedRoute.routeAddress,
      });
    const finalSelectedRouteAddress = shouldPromptForNextKey
      ? appendSearchParamDelimiter(selectedRoute.routeAddress)
      : selectedRoute.routeAddress;
    const finalPreviewRouteAddress = shouldPromptForNextKey
      ? appendSearchParamDelimiter(previewRoute.routeAddress)
      : previewRoute.routeAddress;

    suggestions.push({
      kind: "search",
      nextSelectionRouteIndex: shouldPromptForNextKey
        ? readSearchEnd(finalSelectedRouteAddress)
        : selectedRoute.replacementTokenStart + 1 + selectedTokenText.length,
      previewRouteAddress: finalPreviewRouteAddress,
      previewSelectionRouteIndex: previewRoute.replacementTokenStart + 1,
      sampleValueStart: typeof sampleValue === "string" ? selectedValue.length : undefined,
      selectedRouteAddress: finalSelectedRouteAddress,
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
  token: Extract<SearchToken, { kind: "value" }>;
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

  const routeAddressBeforeValue = args.routeAddress.slice(0, args.token.valueStart);
  const searchEnd = readSearchEnd(args.routeAddress);
  const routeAddressAfterValue = args.routeAddress.slice(args.token.tokenEnd, searchEnd);
  const routeAddressHash = args.routeAddress.slice(searchEnd);
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
      const selectedRouteAddress = `${routeAddressBeforeValue}${value}${routeAddressAfterValue}${routeAddressHash}`;
      const shouldPromptForNextKey = routeAddressAfterValue.length === 0;
      const finalSelectedRouteAddress = shouldPromptForNextKey
        ? appendSearchParamDelimiter(selectedRouteAddress)
        : selectedRouteAddress;

      return {
        kind: "searchValue",
        nextSelectionRouteIndex: shouldPromptForNextKey
          ? readSearchEnd(finalSelectedRouteAddress)
          : routeAddressBeforeValue.length + value.length,
        previewRouteAddress: selectedRouteAddress,
        previewSelectionRouteIndex: routeAddressBeforeValue.length,
        selectedRouteAddress: finalSelectedRouteAddress,
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
          nextSelectionRouteIndex: routeAddressBeforeValue.length + value.length,
          previewRouteAddress: `${routeAddressBeforeValue}${sampleValue}${routeAddressAfterValue}${routeAddressHash}`,
          previewSelectionRouteIndex: routeAddressBeforeValue.length,
          sampleValueStart: value.length,
          selectedRouteAddress: `${routeAddressBeforeValue}${sampleValue}${routeAddressAfterValue}${routeAddressHash}`,
          value: sampleValue,
        };
      },
    );
  }

  const shadePrefix = `${colorValueCursor.family}-`;

  return searchParamSuggestion.valueSuggestions
    .filter((value) => value.startsWith(shadePrefix))
    .map((value): Suggestion => {
      const selectedRouteAddress = `${routeAddressBeforeValue}${value}${routeAddressAfterValue}${routeAddressHash}`;
      const shouldPromptForNextKey = routeAddressAfterValue.length === 0;
      const finalSelectedRouteAddress = shouldPromptForNextKey
        ? appendSearchParamDelimiter(selectedRouteAddress)
        : selectedRouteAddress;
      const shadeValue = value.slice(shadePrefix.length);

      return {
        kind: "searchValue",
        nextSelectionRouteIndex: shouldPromptForNextKey
          ? readSearchEnd(finalSelectedRouteAddress)
          : routeAddressBeforeValue.length + value.length,
        previewRouteAddress: selectedRouteAddress,
        previewSelectionRouteIndex: routeAddressBeforeValue.length + shadePrefix.length,
        selectedRouteAddress: finalSelectedRouteAddress,
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
  committedRouteAddress: string;
  hashKeys: readonly string[];
  hashStart: number;
  prefix: string;
  routeAddress: string;
  routesByPath: AppRouter["routesByPath"];
  viewerIsAdmin: boolean;
}): Suggestion[] {
  const origin = args.prefix.slice(0, -1);
  const parsedRouteAddress = parseRouteAddress(args.routeAddress);
  const parsedCommittedRouteAddress = parseRouteAddress(args.committedRouteAddress);
  const documentHashKeys =
    parsedRouteAddress.path === parsedCommittedRouteAddress.path ? args.hashKeys : [];
  const routeAddressBeforeHash = args.routeAddress.slice(0, args.hashStart);

  return uniqueStrings([
    ...GLOBAL_ROUTE_URL_HASH_KEYS,
    ...readRouteHashKeys({
      origin,
      routeAddress: args.routeAddress,
      routesByPath: args.routesByPath,
      viewerIsAdmin: args.viewerIsAdmin,
    }),
    ...documentHashKeys,
  ]).map((key): Suggestion => {
    const routeAddress = `${routeAddressBeforeHash}#${key}`;

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
      const routeAddress = applyPathSuggestion(args.routeAddress, suggestionRouteAddress);

      return {
        kind: "path",
        nextSelectionRouteIndex: routeAddress.length,
        previewRouteAddress: routeAddress,
        previewSelectionRouteIndex: 1,
        selectedRouteAddress: routeAddress,
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
  committedRouteAddress: string;
  hashKeys: readonly string[];
  prefix: string;
  routeAddress: string;
  routesByPath: AppRouter["routesByPath"];
  selection: Selection | null;
  viewerIsAdmin: boolean;
}): Suggestion[] {
  const parsedRouteAddress = parseRouteAddress(args.routeAddress);

  if (args.selection === null) {
    return readPathRows(args);
  }

  const selectionRouteIndex = readSelectionIndex({
    prefix: args.prefix,
    routeAddress: args.routeAddress,
    selection: args.selection,
  });
  const cursorContext = readCursorContext(
    args.routeAddress,
    parsedRouteAddress,
    selectionRouteIndex,
  );

  if (cursorContext.kind === "path") {
    return readPathRows(args);
  }

  if (cursorContext.kind === "hash") {
    return readHashRows({
      committedRouteAddress: args.committedRouteAddress,
      hashKeys: args.hashKeys,
      hashStart: cursorContext.hashStart,
      prefix: args.prefix,
      routeAddress: args.routeAddress,
      routesByPath: args.routesByPath,
      viewerIsAdmin: args.viewerIsAdmin,
    });
  }

  const routeByPathEntry = entries(args.routesByPath).find(
    ([path]) => path === parsedRouteAddress.path,
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
