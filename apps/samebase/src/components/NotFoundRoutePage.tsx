import { ApprovalGate } from "@/components/ApprovalGate";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import { buttonVariants } from "@/components/ui/button";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { resolveNotFoundPageMetadata } from "@/lib/pageMetadata";
import { NOT_FOUND_LOGO_VIEW_STATE_KEY } from "@/lib/rotatedLogoViewState";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { useRootRouteSearch } from "@/routeSearch/root";
import { type LogoRouteSearch } from "@/routeSearch/logo";
import { Authenticated, Unauthenticated } from "convex/react";
import { useState } from "react";
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

function NotFoundContent(props: {
  primaryActionLabel: string;
  primaryActionTo: "/" | typeof DASHBOARD_ROUTE;
}) {
  // Auth and access gates mount unavailable content only after hydration, so a
  // random colorway can be selected once per client mount without an SSR mismatch.
  const [logoRouteSearch] = useState(() => {
    const remainingColorFamilies = [...NOT_FOUND_LOGO_COLOR_FAMILIES];
    const takeRandomColorFamily = () =>
      remainingColorFamilies.splice(
        Math.floor(Math.random() * remainingColorFamilies.length),
        1,
      )[0] ?? NOT_FOUND_LOGO_COLOR_FAMILIES[0];

    return {
      "auto-shuffle": true,
      primary: `${takeRandomColorFamily()}-800`,
      secondary: `${takeRandomColorFamily()}-500`,
      top: `${takeRandomColorFamily()}-200`,
    } as const satisfies LogoRouteSearch;
  });

  return (
    <div className="container my-auto">
      <div
        data-testid="not-found-route-content"
        className="mx-auto flex max-w-[384px] flex-col items-center gap-4 py-16 text-center"
      >
        <PublicLandingLogo
          autoRotate
          routeSearch={logoRouteSearch}
          routeSearchSource="static"
          viewStateKey={NOT_FOUND_LOGO_VIEW_STATE_KEY}
        />
        <h2 className="text-xl font-semibold tracking-tight">Page not available</h2>
        <Link className={buttonVariants({ variant: "outline" })} to={props.primaryActionTo}>
          {props.primaryActionLabel}
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

  useAppAuthRuntimeEffects(pathname, rootRouteSearch);
  usePageMetadata(resolveNotFoundPageMetadata(pathname));

  return (
    <>
      <Authenticated>
        <ApprovalGate>
          <NotFoundContent primaryActionLabel="Go to vaults" primaryActionTo={DASHBOARD_ROUTE} />
        </ApprovalGate>
      </Authenticated>
      <Unauthenticated>
        <NotFoundContent primaryActionLabel="Go home" primaryActionTo="/" />
      </Unauthenticated>
    </>
  );
}
