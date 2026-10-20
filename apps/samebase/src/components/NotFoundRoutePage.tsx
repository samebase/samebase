import { ApprovalGate } from "@/components/ApprovalGate";
import { APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME } from "@/components/appSidebarNavigation";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import { MENGER_SPONGE_VOXEL_STATE } from "@samebase/logo-model/voxel";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { resolveNotFoundPageMetadata } from "@/lib/pageMetadata";
import { NOT_FOUND_LOGO_VIEW_STATE_KEY } from "@/lib/rotatedLogoViewState";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { useRootRouteSearch } from "@/routeSearch/root";
import { type LogoRouteSearch } from "@/routeSearch/logo";
import { SignedIn, SignedOut } from "@samebase/convex-auth-tanstack-start";
import { useLayoutEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";

const NOT_FOUND_LOGO_COLOR_FAMILIES = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

type NotFoundLogoColorFamily = (typeof NOT_FOUND_LOGO_COLOR_FAMILIES)[number];

function buildNotFoundLogoRouteSearch(
  primaryFamily: NotFoundLogoColorFamily,
  secondaryFamily: NotFoundLogoColorFamily,
  topFamily: NotFoundLogoColorFamily,
) {
  return {
    "auto-rotate": true,
    "auto-shuffle": true,
    depth: 2,
    primary: `${primaryFamily}-800`,
    secondary: `${secondaryFamily}-500`,
    shuffleMoves: 1,
    top: `${topFamily}-200`,
    vox: MENGER_SPONGE_VOXEL_STATE,
  } as const satisfies LogoRouteSearch;
}

function NotFoundContent(props: {
  routeLabel: "/landing" | typeof DASHBOARD_ROUTE;
  routeTo: "/" | typeof DASHBOARD_ROUTE;
}) {
  // The server render and the hydration render share the first three color families; the layout
  // effect then picks three distinct random families once per mount, before the browser paints.
  const [logoRouteSearch, setLogoRouteSearch] = useState(() =>
    buildNotFoundLogoRouteSearch("red", "orange", "amber"),
  );

  useLayoutEffect(() => {
    const remainingColorFamilies = [...NOT_FOUND_LOGO_COLOR_FAMILIES];
    const takeUnusedRandomColorFamily = () =>
      remainingColorFamilies.splice(
        Math.floor(Math.random() * remainingColorFamilies.length),
        1,
      )[0] ?? NOT_FOUND_LOGO_COLOR_FAMILIES[0];

    setLogoRouteSearch(
      buildNotFoundLogoRouteSearch(
        takeUnusedRandomColorFamily(),
        takeUnusedRandomColorFamily(),
        takeUnusedRandomColorFamily(),
      ),
    );
  }, []);

  return (
    <div className="container my-auto">
      <div
        data-testid="not-found-route-content"
        className="mx-auto flex max-w-[384px] flex-col items-center gap-4 py-16 text-center"
      >
        <PublicLandingLogo
          routeSearch={logoRouteSearch}
          routeSearchSource="static"
          viewStateKey={NOT_FOUND_LOGO_VIEW_STATE_KEY}
        />
        <h2 className="text-xl font-semibold tracking-tight">Page not available</h2>
        <Link className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME} to={props.routeTo}>
          {props.routeLabel}
        </Link>
      </div>
    </div>
  );
}

export function NotFoundRoutePage() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const rootRouteSearch = useRootRouteSearch();

  useAppAuthRuntimeEffects(rootRouteSearch);
  usePageMetadata(resolveNotFoundPageMetadata(pathname));

  return (
    <>
      <SignedIn>
        <ApprovalGate>
          <NotFoundContent routeLabel={DASHBOARD_ROUTE} routeTo={DASHBOARD_ROUTE} />
        </ApprovalGate>
      </SignedIn>
      <SignedOut>
        <NotFoundContent routeLabel="/landing" routeTo="/" />
      </SignedOut>
    </>
  );
}
