import { Layout } from "@/Layout";
import { SignInForm } from "@/SignInForm";
import { ApprovalGate } from "@/components/ApprovalGate";
import { shouldShowGlobalChatFab } from "@/lib/globalChatFabVisibility";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useLocation } from "@/lib/router";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { Authenticated, Unauthenticated, useConvexAuth } from "convex/react";
import { lazy, Suspense, useMemo, type ReactNode } from "react";

const ChatFab = lazy(async () => {
  const module = await import("@/components/ChatFab");
  return { default: module.ChatFab };
});

export function AuthenticatedAppRoutePage({
  children,
}: {
  children: ReactNode;
}) {
  const location = useLocation();
  const rootRouteSearch = useRootRouteSearch();
  const { isAuthenticated } = useConvexAuth();
  const pageMetadata = useMemo(
    () =>
      resolvePageMetadata({
        pathname: location.pathname,
        isAuthenticated,
      }),
    [isAuthenticated, location.pathname],
  );
  const showGlobalChatFab = shouldShowGlobalChatFab(location.pathname);

  useAppAuthRuntimeEffects(location.pathname, rootRouteSearch.auth);
  usePageMetadata(pageMetadata);

  return (
    <Layout>
      <Authenticated>
        <ApprovalGate>
          <Suspense fallback={null}>
            {children}
            {showGlobalChatFab ? <ChatFab /> : null}
          </Suspense>
        </ApprovalGate>
      </Authenticated>
      <Unauthenticated>
        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>
      </Unauthenticated>
    </Layout>
  );
}
