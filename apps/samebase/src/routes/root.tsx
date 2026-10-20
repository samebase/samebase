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
import { SessionProvider, sessionBeforeLoad } from "@samebase/convex-auth-tanstack-start";
import { AppBootErrorBoundary } from "@/components/AppBootErrorBoundary";
import { AppRootClient } from "@/components/AppRootClient";
import { canAccessRouteMatchesAvailability, readRouteEnvironment } from "@/routing/availability";
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
import { NOT_FOUND_PAGE_METADATA } from "@/lib/pageMetadata";
import { isProductionPublicOrigin } from "@/lib/prodUiMode";
import { readRootThemeMode, type RootThemeMode } from "@/lib/rootThemeModeSearch";
import { rootQueries } from "@/routes/root.queries";
import { clearRotatedLogoViewStates } from "@/lib/rotatedLogoViewState";
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
  const { dark, devtools, light } = useRootRouteSearch();
  const { convexQueryClient, token } = Route.useRouteContext();

  return (
    <SessionProvider client={convexQueryClient.convexClient} token={token}>
      <RootDocument reactScanEnabled={devtools} themeMode={readRootThemeMode({ dark, light })}>
        <AppBootErrorBoundary>
          <AppRootClient />
        </AppBootErrorBoundary>
      </RootDocument>
    </SessionProvider>
  );
}

function RootDocument({
  children,
  reactScanEnabled,
  themeMode,
}: Readonly<{ children: ReactNode; reactScanEnabled?: true; themeMode: RootThemeMode }>) {
  const shouldEnableReactScan = import.meta.env.DEV && reactScanEnabled;

  return (
    // `?light` and `?dark` force the theme in the rendered document; for the system theme, the
    // head's theme script applies the stored or the system preference before the first paint.
    <html
      className={themeMode === "system" ? undefined : themeMode}
      lang="en"
      suppressHydrationWarning
      translate="no"
    >
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
  beforeLoad: ({ context, location, matches, serverContext }) => {
    const session = sessionBeforeLoad({ context, serverContext });
    const rootSearch = readRootRouteSearch(location.searchStr);
    if (rootSearch.reset) {
      clearRotatedLogoViewStates();
    }

    const rootCanonicalRouteAddress = readCanonicalRouteAddressForRootSearch({
      acceptedSearchKeys: matches.flatMap((match) => match.staticData.acceptedSearchKeys ?? []),
      pathname: location.pathname,
      searchStr: location.searchStr,
      hash: location.hash,
      stripProdUi: isProductionPublicOrigin(),
    });
    if (rootCanonicalRouteAddress !== null) {
      throw redirect({
        href: rootCanonicalRouteAddress,
        replace: true,
      });
    }

    if (!canAccessRouteMatchesAvailability(matches, readRouteEnvironment())) {
      throw notFound({ routeId: rootRouteId });
    }

    return session;
  },
  // The server render queries as the user, so the account chrome and the route access checks have
  // their data in the first HTML; a visitor without a session gets the sign-in methods instead. The
  // browser's navigations have no token here and read the cache, which the subscriptions keep live.
  loader: async ({ context: { queryClient, token } }) => {
    if (token) {
      await Promise.all([
        queryClient.query(rootQueries.viewer),
        queryClient.query(rootQueries.viewerAccess),
      ]);
    } else if (token === null) {
      await queryClient.query(rootQueries.deploymentAuthPolicy);
    }
  },
  component: RootComponent,
  head: ({ matches }) => {
    // A path without a route renders the root's not-found page, which the server answers with a
    // 404: its head names the missing page, without a canonical link, and asks for no index.
    if (matches.some((match) => match._notFound)) {
      const rootHead = buildRootHead({ includeHomeCanonical: false });
      return {
        ...rootHead,
        meta: [
          ...rootHead.meta,
          { title: NOT_FOUND_PAGE_METADATA.title },
          { name: "description", content: NOT_FOUND_PAGE_METADATA.description },
          { name: "robots", content: NOT_FOUND_PAGE_METADATA.robots },
        ],
      };
    }
    return buildRootHead({
      includeHomeCanonical: matches.at(-1)?.pathname === "/",
    });
  },
  notFoundComponent: lazyRouteComponent(
    () => import("@/components/NotFoundRoutePage"),
    "NotFoundRoutePage",
  ),
  search: {
    middlewares: [retainRootSearchParams],
  },
  validateSearch: validateRootRouteSearch,
});
