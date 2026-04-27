import { Layout, PublicLayoutShell } from "@/Layout";
import { SignInForm } from "@/SignInForm";
import { ApprovalGate } from "@/components/ApprovalGate";
import { PermissionGate } from "@/components/PermissionGate";
import { useLocation } from "@tanstack/react-router";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { Authenticated, Unauthenticated, useConvexAuth } from "convex/react";
import { Suspense, useMemo, type ReactNode } from "react";
import type { UserPermission } from "../../shared/userPermissions";

export function AuthenticatedAppRoutePage({
  children,
  requiredPermission,
}: {
  children: ReactNode;
  requiredPermission?: UserPermission;
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
          <PermissionGate requiredPermission={requiredPermission}>
            <Suspense fallback={null}>{children}</Suspense>
          </PermissionGate>
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
