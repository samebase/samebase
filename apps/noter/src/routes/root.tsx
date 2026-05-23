import {
  ClientOnly,
  HeadContent,
  Scripts,
  createRootRoute,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import { pick } from "@noter-md/dependent/object";
import { AppBootErrorBoundary } from "@/components/AppBootErrorBoundary";
import { applySearchPatch } from "@/lib/routeSearchFlags";
import {
  RETAINED_ROOT_SEARCH_KEYS,
  type RootRouteSearch,
  validateRootRouteSearch,
} from "@/lib/rootRouteSearch";
import { buildRootHead } from "@/lib/rootHead";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { Suspense, lazy, type ReactNode } from "react";

const LazyAppRootClient = lazy(() =>
  import("@/components/AppRootClient").then((module) => ({
    default: module.AppRootClient,
  })),
);
type RootSearchMiddlewareArgs = {
  next: (search: RootRouteSearch) => RootRouteSearch;
  search: RootRouteSearch;
};

function retainRootSearchParams({ next, search }: RootSearchMiddlewareArgs): RootRouteSearch {
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
    () => import("@/components/NotFoundRoutePage"),
    "NotFoundRoutePage",
  ),
  search: {
    middlewares: [retainRootSearchParams],
  },
  validateSearch: validateRootRouteSearch,
});
