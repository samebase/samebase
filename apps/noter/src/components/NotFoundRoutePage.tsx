import { Layout, PublicLayoutShell } from "#src/Layout.tsx";
import { ApprovalGate } from "#src/components/ApprovalGate.tsx";
import { buttonVariants } from "#src/components/ui/button.tsx";
import { resolveNotFoundPageMetadata } from "#src/lib/pageMetadata.ts";
import { usePageMetadata } from "#src/lib/usePageMetadata.ts";
import { useAppAuthRuntimeEffects } from "#src/lib/useAppAuthRuntimeEffects.ts";
import { useRootRouteSearch } from "#src/lib/rootRouteSearch.ts";
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
        <Link className={buttonVariants({ variant: "outline" })} to="/">
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
        <PublicLayoutShell>
          <NotFoundContent
            description="The requested noter page does not exist."
            pathname={pathname}
            primaryActionLabel="Go home"
          />
        </PublicLayoutShell>
      </Unauthenticated>
    </Layout>
  );
}
