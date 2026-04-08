import { Layout } from "@/Layout";
import { SignInForm } from "@/SignInForm";
import { ApprovalGate } from "@/components/ApprovalGate";
import { resolveAuthenticatedAppRoute } from "@/lib/appRouteResolution";
import { shouldShowGlobalChatFab } from "@/lib/globalChatFabVisibility";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { useLocation } from "@/lib/router";
import { Authenticated, Unauthenticated, useConvexAuth } from "convex/react";
import { lazy, Suspense, useMemo } from "react";
import { resolvePageMetadata, type PageMetadata } from "@/lib/pageMetadata";
import { shouldRenderPublicLandingWithoutAuthGate } from "@/lib/publicLandingAuthState";
import { usePageMetadata } from "@/lib/usePageMetadata";

const VaultDashboard = lazy(async () => {
  const module = await import("@/components/VaultDashboard");
  return { default: module.VaultDashboard };
});
const FileView = lazy(async () => {
  const module = await import("@/components/FileView");
  return { default: module.FileView };
});
const ChatFab = lazy(async () => {
  const module = await import("@/components/ChatFab");
  return { default: module.ChatFab };
});
const CodespaceChatOnlyView = lazy(async () => {
  const module = await import("@/components/CodespaceChatOnlyView");
  return { default: module.CodespaceChatOnlyView };
});

export default function App() {
  const location = useLocation();
  const { isAuthenticated } = useConvexAuth();
  useAppAuthRuntimeEffects(location.pathname);
  const showGlobalChatFab = shouldShowGlobalChatFab(location.pathname);
  const authenticatedRoute = resolveAuthenticatedAppRoute(location.pathname);
  const showPublicLandingWithoutAuthGate =
    !isAuthenticated && shouldRenderPublicLandingWithoutAuthGate(location);

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
                {authenticatedRoute === "dashboard" ? <VaultDashboard /> : null}
                {authenticatedRoute === "codespaceChat" ? (
                  <CodespaceChatOnlyView />
                ) : null}
                {authenticatedRoute === "fileView" ? <FileView /> : null}
                {authenticatedRoute === "test" ? <div>Test</div> : null}
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
