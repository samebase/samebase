import { Layout, PublicLayoutShell } from "#src/Layout.tsx";
import { SignInForm } from "#src/SignInForm.tsx";
import { ApprovalGate } from "#src/components/ApprovalGate.tsx";
import { useLocation } from "@tanstack/react-router";
import { resolvePageMetadata } from "#src/lib/pageMetadata.ts";
import { usePageMetadata } from "#src/lib/usePageMetadata.ts";
import { useRootRouteSearch } from "#src/lib/rootRouteSearch.ts";
import { useAppAuthRuntimeEffects } from "#src/lib/useAppAuthRuntimeEffects.ts";
import { Authenticated, Unauthenticated, useConvexAuth } from "convex/react";
import { Suspense, useMemo, type ReactNode } from "react";

export function AuthenticatedAppRoutePage({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const rootRouteSearch = useRootRouteSearch();
  const { isAuthenticated } = useConvexAuth();
  const pageMetadata = useMemo(
    () =>
      resolvePageMetadata({
        pathname,
        isAuthenticated,
      }),
    [isAuthenticated, pathname],
  );

  useAppAuthRuntimeEffects(pathname, rootRouteSearch);
  usePageMetadata(pageMetadata);

  return (
    <Layout>
      <Authenticated>
        <ApprovalGate>
          <Suspense fallback={null}>{children}</Suspense>
        </ApprovalGate>
      </Authenticated>
      <Unauthenticated>
        <PublicLayoutShell>
          <Suspense fallback={null}>
            <SignInForm />
          </Suspense>
        </PublicLayoutShell>
      </Unauthenticated>
    </Layout>
  );
}
