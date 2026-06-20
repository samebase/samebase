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
  readNoterRouteEnvironmentForRouteGuard,
} from "@/routing/availability";
import {
  RETAINED_ROOT_SEARCH_KEYS,
  clearConflictingRootThemeModeSearch,
  readCanonicalRouteAddressForRootSearch,
  type RootRouteSearch,
  validateRootRouteSearch,
} from "@/routeSearch/root";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { buildRootHead } from "@/lib/rootHead";
import { isBrowserProductionPublicOrigin } from "@/lib/prodUiMode";
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

  nextSearch = clearConflictingRootThemeModeSearch(nextSearch);

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
  beforeLoad: ({ location, matches }) => {
    const rootCanonicalRouteAddress = readCanonicalRouteAddressForRootSearch({
      acceptedSearchKeys: matches.flatMap((match) => match.staticData.acceptedSearchKeys ?? []),
      pathname: location.pathname,
      searchStr: location.searchStr,
      hash: location.hash,
      stripProdUi: isBrowserProductionPublicOrigin(),
    });
    if (rootCanonicalRouteAddress !== null) {
      throw redirect({
        href: rootCanonicalRouteAddress,
        replace: true,
      });
    }

    const routeEnvironment = readNoterRouteEnvironmentForRouteGuard();
    if (
      routeEnvironment !== null &&
      !canAccessNoterRouteMatchesAvailability(matches, routeEnvironment)
    ) {
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
