import {
  ClientOnly,
  HeadContent,
  Scripts,
  createRootRoute,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import { pick } from "@noter-md/dependent/object";
import { AppBootErrorBoundary } from "#src/components/AppBootErrorBoundary.tsx";
import { LOGO_THEME_COLOR_SEARCH_KEYS } from "#src/lib/appThemeColorSearch.ts";
import { applySearchPatch } from "#src/lib/routeSearchFlags.ts";
import {
  type RootRouteSearch,
  validateRootRouteSearch,
} from "#src/lib/rootRouteSearch.ts";
import { ROOT_THEME_MODE_SEARCH_KEYS } from "#src/lib/rootThemeModeSearch.ts";
import { buildRootHead } from "#src/lib/rootHead.ts";
import { buildPathWithTanStackSearch } from "#src/lib/tanstackSearchParams.ts";
import { Suspense, lazy, type ReactNode } from "react";

const LazyAppRootClient = lazy(() =>
  import("#src/components/AppRootClient.tsx").then((module) => ({
    default: module.AppRootClient,
  })),
);
/**
 * Root-level preview/debug/theme controls should follow public-route
 * navigation until a caller clears the key with a route-search patch tombstone.
 */
const RETAINED_ROOT_SEARCH_KEYS = [
  "dev",
  "devtools",
  ...ROOT_THEME_MODE_SEARCH_KEYS,
  ...LOGO_THEME_COLOR_SEARCH_KEYS,
] as const satisfies readonly (keyof RootRouteSearch)[];

type RootSearchMiddlewareArgs = {
  next: (search: RootRouteSearch) => RootRouteSearch;
  search: RootRouteSearch;
};

function retainRootSearchParams({
  next,
  search,
}: RootSearchMiddlewareArgs): RootRouteSearch {
  let nextSearch: RootRouteSearch = {
    ...pick(search, RETAINED_ROOT_SEARCH_KEYS),
    ...next(search),
  };

  if (nextSearch.light && nextSearch.dark) {
    nextSearch = applySearchPatch(nextSearch, {
      dark: null,
      light: null,
    });
  }

  return nextSearch;
}

function RootComponent() {
  return (
    <RootDocument>
      <AppBootErrorBoundary>
        <ClientOnly>
          <Suspense fallback={null}>
            <LazyAppRootClient />
          </Suspense>
        </ClientOnly>
      </AppBootErrorBoundary>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" translate="no">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRoute({
  beforeLoad: ({ location, search }) => {
    if (search.reset) {
      throw redirect({
        href: buildPathWithTanStackSearch({
          pathname: location.pathname,
          hash: location.hash,
        }),
        replace: true,
      });
    }

    if (search.light && search.dark) {
      throw redirect({
        href: buildPathWithTanStackSearch({
          pathname: location.pathname,
          search: {
            ...search,
            dark: null,
            light: null,
          },
          hash: location.hash,
        }),
        replace: true,
      });
    }
  },
  component: RootComponent,
  head: buildRootHead,
  notFoundComponent: lazyRouteComponent(
    () => import("#src/components/NotFoundRoutePage.tsx"),
    "NotFoundRoutePage",
  ),
  search: {
    middlewares: [retainRootSearchParams],
  },
  validateSearch: validateRootRouteSearch,
});
