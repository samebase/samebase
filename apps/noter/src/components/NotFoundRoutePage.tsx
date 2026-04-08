import { Layout } from "@/Layout";
import { ApprovalGate } from "@/components/ApprovalGate";
import { Button } from "@/components/ui/button";
import { resolveNotFoundPageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { Authenticated, Unauthenticated } from "convex/react";
import { Link, useLocation } from "@tanstack/react-router";

function NotFoundContent(props: {
  description: string;
  primaryActionLabel: string;
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
        <Button asChild variant="outline">
          <Link to="/">{props.primaryActionLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

export function NotFoundRoutePage() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const rootRouteSearch = useRootRouteSearch();

  useAppAuthRuntimeEffects(pathname, rootRouteSearch.auth);
  usePageMetadata(resolveNotFoundPageMetadata(pathname));

  return (
    <Layout>
      <Authenticated>
        <ApprovalGate>
          <NotFoundContent
            description="The requested noter app route does not exist."
            pathname={pathname}
            primaryActionLabel="Go to vaults"
          />
        </ApprovalGate>
      </Authenticated>
      <Unauthenticated>
        <NotFoundContent
          description="The requested noter page does not exist."
          pathname={pathname}
          primaryActionLabel="Go home"
        />
      </Unauthenticated>
    </Layout>
  );
}
