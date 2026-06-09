export type RouteAddressSearchToken =
  | {
      kind: "key";
      delimiter: "?" | "&";
      key: string;
      tokenStart: number;
      tokenEnd: number;
    }
  | {
      kind: "value";
      delimiter: "?" | "&";
      key: string;
      tokenStart: number;
      tokenEnd: number;
      value: string;
      valueStart: number;
    };

export type RouteAddressParts = {
  path: string;
  search: {
    start: number;
    end: number;
    suffix: string;
    tokens: RouteAddressSearchToken[];
  } | null;
  hash: {
    start: number;
    suffix: string;
    value: string;
  } | null;
};

export type RouteAddressCursorContext =
  | {
      kind: "hash";
      hash: NonNullable<RouteAddressParts["hash"]>;
    }
  | {
      kind: "path";
    }
  | {
      kind: "searchKey";
      token: RouteAddressSearchToken;
    }
  | {
      kind: "searchValue";
      token: Extract<RouteAddressSearchToken, { kind: "value" }>;
      valuePrefix: string;
    };

export type RouteAddressSearchSlot = {
  routeAddress: string;
  selectionRouteIndex: number | null;
};

export type RouteAddressSearchTokenReplacement = {
  replacementTokenStart: number;
  routeAddress: string;
};

/**
Parses a route address into path, search, and hash parts while preserving route-address indexes.

The URL editor uses indexes from the original route address for cursor movement, so query token
positions stay in this module instead of being recomputed in suggestion code.
*/
export function parseRouteAddress(routeAddress: string): RouteAddressParts {
  const hashStart = routeAddress.indexOf("#");
  const hash =
    hashStart === -1
      ? null
      : {
          start: hashStart,
          suffix: routeAddress.slice(hashStart),
          value: routeAddress.slice(hashStart + 1),
        };
  const rawSearchStart = routeAddress.indexOf("?");
  const searchStart =
    rawSearchStart === -1 || (hash !== null && rawSearchStart > hash.start) ? null : rawSearchStart;
  const searchEnd = hash?.start ?? routeAddress.length;
  const pathEnd = searchStart ?? searchEnd;

  if (searchStart === null) {
    return {
      path: routeAddress.slice(0, pathEnd) || "/",
      search: null,
      hash,
    };
  }

  const tokens: RouteAddressSearchToken[] = [];
  let tokenStart = searchStart;

  while (tokenStart < searchEnd) {
    const nextAmpersandIndex = routeAddress.indexOf("&", tokenStart + 1);
    const tokenEnd =
      nextAmpersandIndex === -1 || nextAmpersandIndex > searchEnd ? searchEnd : nextAmpersandIndex;
    const tokenText = routeAddress.slice(tokenStart + 1, tokenEnd);
    const equalsIndex = tokenText.indexOf("=");
    const delimiter = routeAddress[tokenStart] === "&" ? "&" : "?";

    if (equalsIndex === -1) {
      tokens.push({
        kind: "key",
        delimiter,
        key: tokenText,
        tokenStart,
        tokenEnd,
      });
    } else {
      tokens.push({
        kind: "value",
        delimiter,
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
    path: routeAddress.slice(0, searchStart) || "/",
    search: {
      start: searchStart,
      end: searchEnd,
      suffix: routeAddress.slice(searchStart, searchEnd),
      tokens,
    },
    hash,
  };
}

export function readRouteAddressCursorContext(
  routeAddressParts: RouteAddressParts,
  selectionRouteIndex: number,
): RouteAddressCursorContext {
  if (routeAddressParts.hash !== null && selectionRouteIndex > routeAddressParts.hash.start) {
    return {
      hash: routeAddressParts.hash,
      kind: "hash",
    };
  }

  if (routeAddressParts.search === null || selectionRouteIndex <= routeAddressParts.search.start) {
    return {
      kind: "path",
    };
  }

  for (const token of routeAddressParts.search.tokens) {
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
        token,
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

export function readRouteAddressWithSearchSlot(routeAddress: string): RouteAddressSearchSlot {
  if (routeAddress === "/") {
    return {
      routeAddress,
      selectionRouteIndex: null,
    };
  }

  const parts = parseRouteAddress(routeAddress);
  const searchEnd = parts.search?.end ?? parts.hash?.start ?? routeAddress.length;
  const routeAddressBeforeHash = routeAddress.slice(0, searchEnd);
  const lastSearchCharacter = routeAddressBeforeHash[routeAddressBeforeHash.length - 1];

  if (lastSearchCharacter === "?" || lastSearchCharacter === "&") {
    return {
      routeAddress,
      selectionRouteIndex: searchEnd,
    };
  }

  return {
    routeAddress: `${routeAddressBeforeHash}${parts.search === null ? "?" : "&"}${
      parts.hash?.suffix ?? ""
    }`,
    selectionRouteIndex: searchEnd + 1,
  };
}

export function replaceRouteAddressPath(routeAddress: string, path: string): string {
  const parts = parseRouteAddress(routeAddress);
  return `${path}${parts.search?.suffix ?? ""}${parts.hash?.suffix ?? ""}`;
}

export function replaceRouteAddressPathWithSearchSlot(
  routeAddress: string,
  path: string,
): RouteAddressSearchSlot {
  const routeAddressWithPath = replaceRouteAddressPath(routeAddress, path);
  const parts = parseRouteAddress(routeAddressWithPath);
  if (parts.search !== null) {
    const lastSearchCharacter = routeAddressWithPath[parts.search.end - 1];

    return {
      routeAddress: routeAddressWithPath,
      selectionRouteIndex:
        lastSearchCharacter === "?" || lastSearchCharacter === "&" ? parts.search.end : null,
    };
  }

  return readRouteAddressWithSearchSlot(routeAddressWithPath);
}

export function replaceRouteAddressHash(routeAddress: string, value: string): string {
  const parts = parseRouteAddress(routeAddress);
  const routeAddressBeforeHash =
    parts.hash === null ? routeAddress : routeAddress.slice(0, parts.hash.start);

  return `${routeAddressBeforeHash}#${value}`;
}

export function appendRouteAddressSearchToken(routeAddress: string, tokenText: string): string {
  const parts = parseRouteAddress(routeAddress);
  const search =
    parts.search === null || parts.search.suffix === "?"
      ? `?${tokenText}`
      : `${parts.search.suffix}&${tokenText}`;

  return `${parts.path}${search}${parts.hash?.suffix ?? ""}`;
}

export function readRouteAddressSearchTokenText(
  routeAddress: string,
  token: RouteAddressSearchToken,
): string {
  return routeAddress.slice(token.tokenStart + 1, token.tokenEnd);
}

export function readRouteAddressSearchKeysOutsideToken(
  routeAddress: string,
  activeToken: RouteAddressSearchToken,
): Set<string> {
  const parts = parseRouteAddress(routeAddress);
  const keys = new Set<string>();

  if (parts.search === null) {
    return keys;
  }

  for (const token of parts.search.tokens) {
    if (routeAddressSearchTokensMatch(token, activeToken) || token.key.length === 0) {
      continue;
    }

    keys.add(token.key);
  }

  return keys;
}

export function replaceRouteAddressSearchToken(args: {
  dedupeKey: string;
  replacementTokenText: string;
  routeAddress: string;
  token: RouteAddressSearchToken;
}): RouteAddressSearchTokenReplacement {
  const parts = parseRouteAddress(args.routeAddress);
  if (parts.search === null) {
    return {
      replacementTokenStart: args.routeAddress.length,
      routeAddress: args.routeAddress,
    };
  }

  let routeAddress = parts.path;
  let replacementTokenStart = routeAddress.length;
  let tokenDelimiter = "?";

  for (const token of parts.search.tokens) {
    const activeToken = routeAddressSearchTokensMatch(token, args.token);
    if (!activeToken && token.key === args.dedupeKey) {
      continue;
    }

    const tokenText = activeToken
      ? args.replacementTokenText
      : readRouteAddressSearchTokenText(args.routeAddress, token);
    const tokenStart = routeAddress.length;

    routeAddress = `${routeAddress}${tokenDelimiter}${tokenText}`;
    tokenDelimiter = "&";

    if (activeToken) {
      replacementTokenStart = tokenStart;
    }
  }

  return {
    replacementTokenStart,
    routeAddress: `${routeAddress}${parts.hash?.suffix ?? ""}`,
  };
}

export function hasRouteAddressNonEmptySearchTokenAfter(args: {
  routeAddress: string;
  tokenStart: number;
}): boolean {
  const parts = parseRouteAddress(args.routeAddress);
  if (parts.search === null) {
    return false;
  }

  const tokenIndex = parts.search.tokens.findIndex((token) => token.tokenStart === args.tokenStart);
  if (tokenIndex === -1) {
    return false;
  }

  return parts.search.tokens
    .slice(tokenIndex + 1)
    .some((token) => readRouteAddressSearchTokenText(args.routeAddress, token).length > 0);
}

export function replaceRouteAddressSearchValue(args: {
  routeAddress: string;
  token: Extract<RouteAddressSearchToken, { kind: "value" }>;
  value: string;
}): string {
  const parts = parseRouteAddress(args.routeAddress);
  const searchEnd = parts.search?.end ?? args.token.tokenEnd;

  return `${args.routeAddress.slice(0, args.token.valueStart)}${args.value}${args.routeAddress.slice(
    args.token.tokenEnd,
    searchEnd,
  )}${parts.hash?.suffix ?? ""}`;
}

export function isRouteAddressFinalSearchToken(args: {
  routeAddress: string;
  token: RouteAddressSearchToken;
}): boolean {
  const parts = parseRouteAddress(args.routeAddress);
  return parts.search?.end === args.token.tokenEnd;
}

function routeAddressSearchTokensMatch(
  left: RouteAddressSearchToken,
  right: RouteAddressSearchToken,
): boolean {
  return left.tokenStart === right.tokenStart && left.tokenEnd === right.tokenEnd;
}
