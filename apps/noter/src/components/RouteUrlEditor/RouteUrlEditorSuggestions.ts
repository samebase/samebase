import { entries } from "@noter-md/dependent/object";
import {
  canAccessNoterRoutePermission,
  type NoterRouteSearchParamSuggestion,
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

export type Suggestion = {
  kind: "path" | "search" | "searchValuePrefix" | "searchValue";
  nextSelectionRouteIndex: number;
  routeAddress: string;
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

/**
Parses the route address into path plus query tokens.

Example: `/logo?top=blue-500&secondary=rose-500` becomes path `/logo`
plus two value tokens, one for `top` and one for `secondary`.
*/
export function parseRouteAddress(routeAddress: string): ParsedRouteAddress {
  const searchStart = routeAddress.indexOf("?");
  if (searchStart === -1) {
    return {
      path: routeAddress,
      search: null,
    };
  }

  const path = routeAddress.slice(0, searchStart);
  const tokens: SearchToken[] = [];
  let tokenStart = searchStart;

  while (tokenStart < routeAddress.length) {
    const nextAmpersandIndex = routeAddress.indexOf("&", tokenStart + 1);
    const tokenEnd = nextAmpersandIndex === -1 ? routeAddress.length : nextAmpersandIndex;
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

function appendSearchParamDelimiter(routeAddress: string): string {
  if (routeAddress === "/" || routeAddress.endsWith("?") || routeAddress.endsWith("&")) {
    return routeAddress;
  }

  return `${routeAddress}${routeAddress.includes("?") ? "&" : "?"}`;
}

function applyPathSuggestion(routeAddress: string, suggestionPath: string): string {
  const parsedRouteAddress = parseRouteAddress(routeAddress);
  if (parsedRouteAddress.search === null) {
    return appendSearchParamDelimiter(suggestionPath);
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

type TailwindColorValueCursor =
  | {
      kind: "family";
      familyPrefix: string;
    }
  | {
      kind: "shade";
      family: string;
      shadePrefix: string;
    };

function readTailwindColorValueCursor(valuePrefix: string): TailwindColorValueCursor {
  const familyEnd = valuePrefix.indexOf("-");
  if (familyEnd === -1) {
    return {
      kind: "family",
      familyPrefix: valuePrefix,
    };
  }

  return {
    kind: "shade",
    family: valuePrefix.slice(0, familyEnd),
    shadePrefix: valuePrefix.slice(familyEnd + 1),
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

/**
Classifies the cursor from the parsed route address.

Example: `/logo?to` with cursor after `to` returns `searchKey` for key `to`.

Example: `/logo?top=blue-500&se` with cursor after `se` returns `searchKey`
for key `se`; the token starts at the `&` delimiter.

Example: `/logo?top=blue-500` with cursor inside `blue-500` returns
`searchValue`, so value suggestions can be added without reparsing strings.
*/
function readCursorContext(
  parsedRouteAddress: ParsedRouteAddress,
  selectionRouteIndex: number,
): CursorContext {
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

/**
Turns route metadata into query-key dropdown rows.

Example: if the active token is `?to`, the `top` metadata becomes a row with
value `?top=` and selecting it replaces the active token in `args.routeAddress`.
*/
function readSearchRows(args: {
  routeAddress: string;
  routeSearchParamSuggestions: readonly NoterRouteSearchParamSuggestion[];
  searchKeyToken: Extract<SearchToken, { kind: "key" }>;
  viewerIsAdmin: boolean;
}): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const searchParamSuggestion of readSearchParams(
    args.routeSearchParamSuggestions,
    args.viewerIsAdmin,
  )) {
    if (!searchParamSuggestion.key.startsWith(args.searchKeyToken.key)) {
      continue;
    }

    const tokenDelimiter = args.routeAddress.slice(
      args.searchKeyToken.tokenStart,
      args.searchKeyToken.tokenStart + 1,
    );
    const tokenSuffix = searchParamSuggestion.searchParamKind === "value" ? "=" : "";
    const value = `${tokenDelimiter}${searchParamSuggestion.key}${tokenSuffix}`;
    const routeAddressBeforeToken = args.routeAddress.slice(0, args.searchKeyToken.tokenStart);
    const routeAddressAfterToken = args.routeAddress.slice(args.searchKeyToken.tokenEnd);
    const selectedRouteAddress = `${routeAddressBeforeToken}${value}${routeAddressAfterToken}`;
    const shouldPromptForNextKey =
      searchParamSuggestion.searchParamKind === "presence" && routeAddressAfterToken.length === 0;
    const routeAddress = shouldPromptForNextKey
      ? appendSearchParamDelimiter(selectedRouteAddress)
      : selectedRouteAddress;

    suggestions.push({
      kind: "search",
      nextSelectionRouteIndex: shouldPromptForNextKey
        ? routeAddress.length
        : routeAddressBeforeToken.length + value.length,
      routeAddress,
      value,
    });
  }

  return suggestions.sort((left, right) => left.value.localeCompare(right.value));
}

/**
Turns a value token into concrete value rows.

Example: `/logo?top=bl` with cursor after `bl` returns `blue-`, because
Tailwind colors are selected as family first, then shade.

Example: `/logo?top=blue-2` with cursor after `2` returns `blue-200`.
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

  if (
    searchParamSuggestion.searchParamKind !== "value" ||
    searchParamSuggestion.valueType !== "completion"
  ) {
    return [];
  }

  const routeAddressBeforeValue = args.routeAddress.slice(0, args.token.valueStart);
  const routeAddressAfterValue = args.routeAddress.slice(args.token.tokenEnd);
  const colorValueCursor = readTailwindColorValueCursor(args.valuePrefix);
  if (colorValueCursor.kind === "family") {
    return readTailwindColorFamilyValues(searchParamSuggestion.valueSuggestions)
      .filter((value) => value.startsWith(colorValueCursor.familyPrefix))
      .map((value): Suggestion => {
        const routeAddress = `${routeAddressBeforeValue}${value}${routeAddressAfterValue}`;

        return {
          kind: "searchValuePrefix",
          nextSelectionRouteIndex: routeAddressBeforeValue.length + value.length,
          routeAddress,
          value,
        };
      });
  }

  const shadePrefix = `${colorValueCursor.family}-`;

  return searchParamSuggestion.valueSuggestions
    .filter(
      (value) =>
        value.startsWith(shadePrefix) &&
        value.slice(shadePrefix.length).startsWith(colorValueCursor.shadePrefix),
    )
    .map((value): Suggestion => {
      const selectedRouteAddress = `${routeAddressBeforeValue}${value}${routeAddressAfterValue}`;
      const shouldPromptForNextKey = routeAddressAfterValue.length === 0;
      const routeAddress = shouldPromptForNextKey
        ? appendSearchParamDelimiter(selectedRouteAddress)
        : selectedRouteAddress;

      return {
        kind: "searchValue",
        nextSelectionRouteIndex: shouldPromptForNextKey
          ? routeAddress.length
          : routeAddressBeforeValue.length + value.length,
        routeAddress,
        value,
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
        routeAddress,
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
  const parsedRouteAddress = parseRouteAddress(args.routeAddress);

  if (args.selection === null) {
    return readPathRows(args);
  }

  const selectionRouteIndex = readSelectionIndex({
    prefix: args.prefix,
    routeAddress: args.routeAddress,
    selection: args.selection,
  });
  const cursorContext = readCursorContext(parsedRouteAddress, selectionRouteIndex);

  if (cursorContext.kind === "path") {
    return readPathRows(args);
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
