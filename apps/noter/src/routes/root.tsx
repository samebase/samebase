import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  lazyRouteComponent,
  notFound,
  redirect,
  rootRouteId,
} from "@tanstack/react-router";
import { pick } from "@noter-md/dependent/object";
import { AppBootErrorBoundary } from "@/components/AppBootErrorBoundary";
import { AppRootClient } from "@/components/AppRootClient";
import {
  canAccessNoterRouteMatchesAvailability,
  readNoterRouteSurfaceForRouteGuard,
} from "@/lib/routeAvailability";
import { applySearchPatch } from "@/lib/routeSearchFlags";
import {
  RETAINED_ROOT_SEARCH_KEYS,
  type RootRouteSearch,
  validateRootRouteSearch,
} from "@/lib/rootRouteSearch";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { buildRootHead } from "@/lib/rootHead";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { type AppQueryClients } from "@/lib/appQueryClient";
import { type ReactNode } from "react";

const pathname = "/";

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
        <AppRootClient />
      </AppBootErrorBoundary>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning translate="no">
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

export const Route = createRootRouteWithContext<AppQueryClients>()({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  beforeLoad: ({ location, matches, search }) => {
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

    const routeSurface = readNoterRouteSurfaceForRouteGuard();
    if (routeSurface !== null && !canAccessNoterRouteMatchesAvailability(matches, routeSurface)) {
      throw notFound({ routeId: rootRouteId });
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
