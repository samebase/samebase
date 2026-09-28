import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  lazyRouteComponent,
  notFound,
  redirect,
  rootRouteId,
} from "@tanstack/react-router";
import { pick } from "@samebase/dependent/object";
import { AppBootErrorBoundary } from "@/appShell/AppBootErrorBoundary";
import { AppRootClient } from "@/appShell/AppRootClient";
import {
  canAccessRouteMatchesAvailability,
  readRouteEnvironmentForRouteGuard,
} from "@/routing/availability";
import {
  RETAINED_ROOT_SEARCH_KEYS,
  clearConflictingRootThemeModeSearch,
  readRootRouteSearch,
  readCanonicalRouteAddressForRootSearch,
  type RootRouteSearch,
  useRootRouteSearch,
  validateRootRouteSearch,
} from "@/routeSearch/root";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { buildRootHead } from "@/lib/rootHead";
import { isBrowserProductionPublicOrigin } from "@/lib/prodUiMode";
import { clearRotatedLogoViewStates } from "@/logo/rotatedLogoViewState";
import { type AppQueryClients } from "@/lib/appQueryClient";
import { type ReactNode, useEffect } from "react";

const pathname = "/";
const REACT_SCAN_HOOK_INTEGRITY =
  "sha384-gtx085UgMdaRetpZlCm2iy6u+Te8ZsKK0xhjG8ybjt2JfW7adJJf0gfOFkAjC0dK";
const REACT_SCAN_HOOK_SRC = "https://unpkg.com/react-scan@0.5.7/dist/install-hook.global.js";
const REACT_SCAN_LOADER_INTEGRITY =
  "sha384-DDZCsimcjpG92OUulxf7DHi4rGS/fNIW7lC5DT8+5ftaTDiUKfzIq+pDTUbPjC86";
const REACT_SCAN_LOADER_SRC = "https://unpkg.com/react-scan@0.5.7/dist/auto.global.js";

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
  const { devtools } = useRootRouteSearch();

  return (
    <RootDocument reactScanEnabled={devtools}>
      <AppBootErrorBoundary>
        <AppRootClient />
      </AppBootErrorBoundary>
    </RootDocument>
  );
}

function RootDocument({
  children,
  reactScanEnabled,
}: Readonly<{ children: ReactNode; reactScanEnabled?: true }>) {
  const shouldEnableReactScan = import.meta.env.DEV && reactScanEnabled;

  return (
    <html lang="en" suppressHydrationWarning translate="no">
      <head>
        {shouldEnableReactScan ? (
          <script
            crossOrigin="anonymous"
            integrity={REACT_SCAN_HOOK_INTEGRITY}
            referrerPolicy="no-referrer"
            src={REACT_SCAN_HOOK_SRC}
          />
        ) : null}
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        {shouldEnableReactScan ? <ReactScanLoader /> : null}
      </body>
    </html>
  );
}

function ReactScanLoader() {
  useEffect(() => {
    // React Scan is document-lifetime. Reuse the loader so Strict Mode does not run it twice.
    if (document.querySelector("script[data-react-scan-loader]")) {
      return;
    }

    const script = document.createElement("script");
    script.setAttribute("crossorigin", "anonymous");
    script.setAttribute("data-react-scan-loader", "");
    script.setAttribute("integrity", REACT_SCAN_LOADER_INTEGRITY);
    script.setAttribute("referrerpolicy", "no-referrer");
    script.src = REACT_SCAN_LOADER_SRC;
    document.head.append(script);
  }, []);

  return null;
}

export const Route = createRootRouteWithContext<AppQueryClients>()({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  beforeLoad: ({ location, matches }) => {
    const rootSearch = readRootRouteSearch(location.searchStr);
    if (rootSearch.reset) {
      clearRotatedLogoViewStates();
    }

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

    const routeEnvironment = readRouteEnvironmentForRouteGuard();
    if (
      routeEnvironment !== null &&
      !canAccessRouteMatchesAvailability(matches, routeEnvironment)
    ) {
      throw notFound({ routeId: rootRouteId });
    }
  },
  component: RootComponent,
  head: ({ matches }) =>
    buildRootHead({
      includeHomeCanonical: matches.at(-1)?.pathname === "/",
    }),
  notFoundComponent: lazyRouteComponent(
    () => import("@/appShell/NotFoundRoutePage"),
    "NotFoundRoutePage",
  ),
  search: {
    middlewares: [retainRootSearchParams],
  },
  validateSearch: validateRootRouteSearch,
});
