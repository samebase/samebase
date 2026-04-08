import { Layout } from "@/Layout";
import { SignInForm } from "@/SignInForm";
import { ApprovalGate } from "@/components/ApprovalGate";
import { shouldShowGlobalChatFab } from "@/lib/globalChatFabVisibility";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { useLocation } from "@/lib/router";
import { Authenticated, Unauthenticated, useConvexAuth } from "convex/react";
import { lazy, Suspense, useMemo } from "react";
import { resolvePageMetadata, type PageMetadata } from "@/lib/pageMetadata";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { shouldRenderPublicLandingWithoutAuthGate } from "@/lib/publicLandingAuthState";
import { usePageMetadata } from "@/lib/usePageMetadata";

const ChatFab = lazy(async () => {
  const module = await import("@/components/ChatFab");
  return { default: module.ChatFab };
});

export default function App() {
  const location = useLocation();
  const rootRouteSearch = useRootRouteSearch();
  const { isAuthenticated } = useConvexAuth();
  useAppAuthRuntimeEffects(location.pathname, rootRouteSearch.auth);
  const showGlobalChatFab = shouldShowGlobalChatFab(location.pathname);
  const showPublicLandingWithoutAuthGate =
    !isAuthenticated &&
    shouldRenderPublicLandingWithoutAuthGate(location, rootRouteSearch);

  const pageMetadata: PageMetadata = useMemo(() => {
    return resolvePageMetadata({
      pathname: location.pathname,
      isAuthenticated,
    });
  }, [isAuthenticated, location.pathname]);
  usePageMetadata(pageMetadata);

  return (
    <Layout>
      {showPublicLandingWithoutAuthGate ? (
        <SignInForm />
      ) : (
        <>
          <Authenticated>
            <ApprovalGate>
              <Suspense fallback={null}>
                {showGlobalChatFab ? <ChatFab /> : null}
              </Suspense>
            </ApprovalGate>
          </Authenticated>
          <Unauthenticated>
            <Suspense fallback={null}>
              <SignInForm />
            </Suspense>
          </Unauthenticated>
        </>
      )}
    </Layout>
  );
}
