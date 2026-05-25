import { SignInForm } from "@/SignInForm";
import { ApprovalGate } from "@/components/ApprovalGate";
import { useLocation } from "@tanstack/react-router";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { Authenticated, Unauthenticated, useConvexAuth } from "convex/react";
import { Suspense, useMemo, type ReactNode } from "react";

export function AuthenticatedAppRoutePage({ children }: { children: ReactNode }) {
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
    <>
      <Authenticated>
        <ApprovalGate>
          <Suspense fallback={null}>{children}</Suspense>
        </ApprovalGate>
      </Authenticated>
      <Unauthenticated>
        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>
      </Unauthenticated>
    </>
  );
}
