import { SignInForm } from "@/SignInForm";
import { ApprovalGate } from "@/components/ApprovalGate";
import { useLocation } from "@tanstack/react-router";
import { landingPageMarkdown } from "@/lib/landingCopy";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useRootRouteSearch } from "@/routeSearch/root";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import {
  isAppPresentationAuthenticated,
  useAppAuthPresentation,
} from "@/lib/appAuthPresentationState";
import { Authenticated, Unauthenticated } from "convex/react";
import { Suspense, useMemo, type ReactNode } from "react";

function AuthenticatedRouteSignInForm() {
  return (
    <Suspense fallback={null}>
      <SignInForm
        authPlacement="inline"
        landingPageMarkdown={landingPageMarkdown}
        topNotice={null}
      />
    </Suspense>
  );
}

export function AuthenticatedAppRoutePage({ children }: { children: ReactNode }) {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const rootRouteSearch = useRootRouteSearch();
  const authPresentation = useAppAuthPresentation();
  const isPresentedAuthenticated = isAppPresentationAuthenticated(authPresentation);
  const pageMetadata = useMemo(
    () =>
      resolvePageMetadata({
        pathname,
        isAuthenticated: isPresentedAuthenticated,
      }),
    [isPresentedAuthenticated, pathname],
  );

  useAppAuthRuntimeEffects(pathname, rootRouteSearch);
  usePageMetadata(pageMetadata);

  if (authPresentation.kind === "temporaryAuthenticated") {
    return <div data-testid="temporary-auth-route-shell" />;
  }

  if (authPresentation.kind === "signedOut") {
    return <AuthenticatedRouteSignInForm />;
  }

  return (
    <>
      <Authenticated>
        <ApprovalGate>
          <Suspense fallback={null}>{children}</Suspense>
        </ApprovalGate>
      </Authenticated>
      <Unauthenticated>
        <AuthenticatedRouteSignInForm />
      </Unauthenticated>
    </>
  );
}
