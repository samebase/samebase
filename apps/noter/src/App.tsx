import { Layout } from "@/Layout";
import { useAutoSignIn } from "@/authClient";
import { SignInForm } from "@/SignInForm";
import { ApprovalGate } from "@/components/ApprovalGate";
import { resolveAuthenticatedAppRoute } from "@/lib/appRouteResolution";
import { shouldShowGlobalChatFab } from "@/lib/globalChatFabVisibility";
import { useCloseOAuthPopup } from "@/lib/useCloseOAuthPopup";
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
const AddRepository = lazy(async () => {
  const module = await import("@/components/AddRepository");
  return { default: module.AddRepository };
});
const ChatFab = lazy(async () => {
  const module = await import("@/components/ChatFab");
  return { default: module.ChatFab };
});
const CodespaceChatOnlyView = lazy(async () => {
  const module = await import("@/components/CodespaceChatOnlyView");
  return { default: module.CodespaceChatOnlyView };
});
const PricingPage = lazy(async () => {
  const module = await import("@/components/PricingPage");
  return { default: module.PricingPage };
});
const MachineConnectPage = lazy(async () => {
  const module = await import("@/components/MachineConnectPage");
  return { default: module.MachineConnectPage };
});
const MachinesWorkspacePage = lazy(async () => {
  const module = await import("@/components/MachinesWorkspacePage");
  return { default: module.MachinesWorkspacePage };
});

export default function App() {
  useAutoSignIn();
  const location = useLocation();
  const { isAuthenticated } = useConvexAuth();
  useCloseOAuthPopup(location.pathname, true);
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
                {authenticatedRoute === "machines" ? (
                  <MachinesWorkspacePage />
                ) : null}
                {authenticatedRoute === "machineConnect" ? (
                  <MachineConnectPage />
                ) : null}
                {authenticatedRoute === "pricing" ? <PricingPage /> : null}
                {authenticatedRoute === "addRepository" ? (
                  <AddRepository />
                ) : null}
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
