import { ApprovalGate } from "@/components/ApprovalGate";
import { buttonVariants } from "@/components/ui/button";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { resolveNotFoundPageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { useRootRouteSearch } from "@/routeSearch/root";
import { Authenticated, Unauthenticated } from "convex/react";
import { Link, useLocation } from "@tanstack/react-router";

function NotFoundContent(props: {
  description: string;
  primaryActionLabel: string;
  primaryActionTo: "/" | typeof DASHBOARD_ROUTE;
  pathname: string;
}) {
  return (
    <div className="container my-auto">
      <div
        data-testid="not-found-route-content"
        className="mx-auto flex max-w-[384px] flex-col items-center gap-4 py-16 text-center"
      >
        <h2 className="text-xl font-semibold tracking-tight">Page not found</h2>
        <p className="text-sm text-muted-foreground">{props.description}</p>
        <code className="max-w-full overflow-x-auto text-xs text-muted-foreground">
          {props.pathname}
        </code>
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
          <NotFoundContent
            description="The requested noter app route does not exist."
            pathname={pathname}
            primaryActionLabel="Go to vaults"
            primaryActionTo={DASHBOARD_ROUTE}
          />
        </ApprovalGate>
      </Authenticated>
      <Unauthenticated>
        <NotFoundContent
          description="The requested noter page does not exist."
          pathname={pathname}
          primaryActionLabel="Go home"
          primaryActionTo="/"
        />
      </Unauthenticated>
    </>
  );
}
