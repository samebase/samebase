import type { AppRouter } from "@/router";
import {
  APP_THEME_COLOR_SEARCH_KEYS,
  LOGO_THEME_COLOR_SEARCH_KEYS,
} from "@/lib/appThemeColorSearch";
import { LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM } from "@/lib/landingMarkdownPreview";
import { LANDING_DEV_MODE_QUERY_PARAM } from "@/lib/landingDevMode";
import { FORCE_PROD_UI_QUERY_PARAM } from "@/lib/prodUiMode";
import { PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM } from "@/lib/publicLayoutSidebarPreferences";
import { filterRouteUrlPathSuggestions } from "@/lib/routeUrlPathSuggestions";
import {
  canAccessNoterRoutePermission,
  type NoterRoutePermission,
  type NoterRoutePermissionViewer,
} from "@/lib/routePermissions";
import { ROUTE_SEARCH_PRESENCE_FLAG_KEYS } from "@/lib/routeSearchFlags";
import { ROOT_THEME_MODE_SEARCH_KEYS } from "@/lib/rootThemeModeSearch";
import { SEARCH_RESET_QUERY_PARAM } from "@/lib/searchReset";

export type RouteUrlEditorSuggestionKind = "hash" | "path" | "search";

export type RouteUrlEditorSuggestion = {
  kind: RouteUrlEditorSuggestionKind;
  key: string;
  value: string;
};

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
  editingKey: boolean;
  first: boolean;
  key: string;
  tokenEnd: number;
  tokenStart: number;
};

const GLOBAL_ROUTE_URL_SEARCH_PARAM_KEYS = [
  LANDING_DEV_MODE_QUERY_PARAM,
  "devtools",
  FORCE_PROD_UI_QUERY_PARAM,
  SEARCH_RESET_QUERY_PARAM,
  ...ROOT_THEME_MODE_SEARCH_KEYS,
  ...APP_THEME_COLOR_SEARCH_KEYS,
  ...LOGO_THEME_COLOR_SEARCH_KEYS,
] as const;

const ROOT_ROUTE_URL_SEARCH_PARAM_KEYS = [
  "auth",
  "connect-cloudflare",
  "delete",
  "depth",
  "dist",
  "new-app",
  PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM,
  "signup",
] as const;

const LOGO_ROUTE_URL_SEARCH_PARAM_KEYS = [
  "axis",
  "depth",
  "dist",
  "elev",
  "freeView",
  "isoSide",
  "isoStyle",
  "leftFace",
  "rot",
  "stripeA",
  "stripeBasis",
  "stripeG",
  "stripeLink",
  "stripeO",
  "stripeW",
  "vox",
] as const;

const ROUTE_URL_SEARCH_PARAM_KEYS_BY_PATH: Readonly<Record<string, readonly string[]>> = {
  "/": ROOT_ROUTE_URL_SEARCH_PARAM_KEYS,
  "/landing-preview": [LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM],
  "/logo": LOGO_ROUTE_URL_SEARCH_PARAM_KEYS,
  "/logo/iso": LOGO_ROUTE_URL_SEARCH_PARAM_KEYS,
  "/logo/raster": LOGO_ROUTE_URL_SEARCH_PARAM_KEYS,
  "/logo/raster-seams": LOGO_ROUTE_URL_SEARCH_PARAM_KEYS,
  "/logo/single-cube": LOGO_ROUTE_URL_SEARCH_PARAM_KEYS,
  "/logo/svg": LOGO_ROUTE_URL_SEARCH_PARAM_KEYS,
  "/logo/transition": LOGO_ROUTE_URL_SEARCH_PARAM_KEYS,
  "/logo/transition/transforms": LOGO_ROUTE_URL_SEARCH_PARAM_KEYS,
  "/machines": ["machineId", "threadId"],
  "/machines/connect": ["openedByCli", "requestId"],
  "/oauth/mcp/consent": ["mcp_consent_request"],
  "/pricing": ["checkout"],
  "/research/codex-app-server": ["threadId"],
  "/research/codex-app-server/browser": ["threadId"],
  "/vault/$": ["compare", "diff", "mobileLineNumbers", "review"],
  "/visual-fixture": ["mode"],
} as const;

const ROUTE_URL_PRESENCE_SEARCH_PARAM_KEYS = new Set<string>([
  ...ROUTE_SEARCH_PRESENCE_FLAG_KEYS,
  "connect-cloudflare",
  "sidebar-reset",
  "stripeLink",
]);

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
    return "search";
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
        draftRouteAddress,
        routesByPath,
        selectionRouteIndex,
        viewer,
      });
    case "hash":
      return readRouteUrlEditorHashSuggestions({
        currentHref,
        draftRouteAddress,
        hashKeys,
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

      const nextToken = formatRouteUrlEditorSearchSuggestionValue(suggestion.key, token.first);
      return `${routeAddress.slice(0, token.tokenStart)}${nextToken}${routeAddress.slice(
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

function readRouteUrlEditorSearchSuggestions(args: {
  draftRouteAddress: string;
  routesByPath: AppRouter["routesByPath"];
  selectionRouteIndex: number;
  viewer: NoterRoutePermissionViewer;
}): readonly RouteUrlEditorSuggestion[] {
  const token = readRouteUrlEditorSearchToken(args.draftRouteAddress, args.selectionRouteIndex);
  if (token === null) {
    return [];
  }

  if (!token.editingKey) {
    return [];
  }

  const searchKeys = readRouteUrlEditorSearchParamKeys(args);
  return searchKeys
    .filter((key) => key.startsWith(token.key))
    .map((key) => ({
      key,
      kind: "search",
      value: formatRouteUrlEditorSearchSuggestionValue(key, token.first),
    }));
}

function readRouteUrlEditorHashSuggestions(args: {
  currentHref: string;
  draftRouteAddress: string;
  hashKeys: readonly string[];
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

function readRouteUrlEditorSearchParamKeys(args: {
  draftRouteAddress: string;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRoutePermissionViewer;
}): readonly string[] {
  const parts = readRouteUrlEditorParts(args.draftRouteAddress);
  const routePath = readMatchingRoutePath({
    path: parts.path,
    routesByPath: args.routesByPath,
    viewer: args.viewer,
  });
  const routeSearchKeys =
    typeof routePath === "string" ? (ROUTE_URL_SEARCH_PARAM_KEYS_BY_PATH[routePath] ?? []) : [];

  return uniqueStrings([...GLOBAL_ROUTE_URL_SEARCH_PARAM_KEYS, ...routeSearchKeys]).sort();
}

function readMatchingRoutePath(args: {
  path: string;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRoutePermissionViewer;
}): string | null {
  const matches = Object.entries(args.routesByPath)
    .filter(
      ([routePath, route]) =>
        isUserFacingAccessibleRoute(routePath, route.options.staticData.permission, args.viewer) &&
        routePathTemplateMatchesPath(routePath, args.path),
    )
    .map(([routePath]) => routePath)
    .sort(compareRoutePathSpecificity);

  return matches[0] ?? null;
}

function isUserFacingAccessibleRoute(
  path: string,
  permission: NoterRoutePermission,
  viewer: NoterRoutePermissionViewer,
): boolean {
  return (
    (path === "/" || (path.startsWith("/") && !path.startsWith("/_"))) &&
    canAccessNoterRoutePermission(permission, viewer)
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

  return {
    editingKey: equalsIndex === -1 || selectionOffset <= equalsIndex,
    first: tokenStart === parts.searchStart,
    key,
    tokenEnd,
    tokenStart,
  };
}

function formatRouteUrlEditorSearchSuggestionValue(key: string, first: boolean): string {
  const prefix = first ? "?" : "&";
  const suffix = ROUTE_URL_PRESENCE_SEARCH_PARAM_KEYS.has(key) ? "" : "=";
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
