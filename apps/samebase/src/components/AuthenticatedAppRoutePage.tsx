import { SignInForm } from "@/SignInForm";
import { ApprovalGate } from "@/components/ApprovalGate";
import { useLocation } from "@tanstack/react-router";
import { landingPageMarkdown } from "@/lib/landingCopy";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { type RootRouteSearch, useRootRouteSearch } from "@/routeSearch/root";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import {
  isAppPresentationAuthenticated,
  useAppAuthPresentation,
} from "@/lib/appAuthPresentationState";
import { Authenticated, Unauthenticated } from "convex/react";
import { Suspense, useMemo, type ReactNode } from "react";
import { useCallback, useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useAuthorizationErrorNotice } from "@/lib/useAuthorizationErrorNotice";
import { clearAuthorizationErrorSearch } from "@/routeSearch/authorizationError";
import { readAuthorizationError } from "@/routeSearch/authorizationError";
import { formatAuthorizationErrorMessage } from "@/lib/authorizationErrorMessage";
import { toast } from "@/components/ui/use-toast";

const ALL_AUTHORIZATION_SOURCES = [
  "convex",
  "cloudflare",
  "github-app",
  "github-user",
  "google-sign-in",
  "github-sign-in",
] as const;
const NO_AUTHORIZATION_SOURCES = [] as const;

function isAuthorizationErrorHandledByRoute(
  pathname: string,
  provider: (typeof ALL_AUTHORIZATION_SOURCES)[number],
): boolean {
  switch (provider) {
    case "convex":
    case "cloudflare":
      return /^\/org\/[^/]+\/providers\/?$/.test(pathname);
    case "github-app":
      return /^\/org\/[^/]+\/providers\/?$/.test(pathname);
    case "github-user":
    case "google-sign-in":
    case "github-sign-in":
      return pathname === "/settings";
    default:
      provider satisfies never;
      return false;
  }
}

function FallbackAuthorizationErrorNotice({
  pathname,
  rootRouteSearch,
}: {
  pathname: string;
  rootRouteSearch: RootRouteSearch;
}) {
  const router = useRouter();
  const currentAuthorizationError = readAuthorizationError(rootRouteSearch);
  const consumeAuthorizationError = useCallback(() => {
    void router.navigate({
      hash: true,
      replace: true,
      resetScroll: false,
      search: clearAuthorizationErrorSearch,
      to: ".",
    });
  }, [router]);
  const authorizationError = useAuthorizationErrorNotice({
    allowedProviders:
      currentAuthorizationError !== null &&
      isAuthorizationErrorHandledByRoute(pathname, currentAuthorizationError.provider)
        ? NO_AUTHORIZATION_SOURCES
        : ALL_AUTHORIZATION_SOURCES,
    onConsume: consumeAuthorizationError,
    search: rootRouteSearch,
    scopeKey: pathname,
  });

  useEffect(() => {
    if (authorizationError === null) {
      return;
    }
    toast({
      description: formatAuthorizationErrorMessage(authorizationError),
      priority: "high",
      title: "Authorization not completed",
      variant: "destructive",
    });
  }, [authorizationError]);

  return null;
}

function AuthenticatedRouteSignInForm() {
  return (
    <Suspense fallback={null}>
      <SignInForm
        authPlacement="inline"
        landingPageMarkdown={landingPageMarkdown}
        logo="classic"
        topNotice={null}
      />
    </Suspense>
  );
}

function AuthenticatedRoutePage({
  approvalRequired,
  children,
}: {
  approvalRequired: boolean;
  children: ReactNode;
}) {
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

  const fallbackAuthorizationErrorNotice = (
    <FallbackAuthorizationErrorNotice pathname={pathname} rootRouteSearch={rootRouteSearch} />
  );

  if (authPresentation.kind === "temporaryAuthenticated") {
    return (
      <>
        {fallbackAuthorizationErrorNotice}
        <div data-testid="temporary-auth-route-shell" />
      </>
    );
  }

  if (authPresentation.kind === "signedOut") {
    return (
      <>
        {fallbackAuthorizationErrorNotice}
        <AuthenticatedRouteSignInForm />
      </>
    );
  }

  return (
    <>
      {fallbackAuthorizationErrorNotice}
      <Authenticated>
        {approvalRequired ? (
          <ApprovalGate>
            <Suspense fallback={null}>{children}</Suspense>
          </ApprovalGate>
        ) : (
          <Suspense fallback={null}>{children}</Suspense>
        )}
      </Authenticated>
      <Unauthenticated>
        <AuthenticatedRouteSignInForm />
      </Unauthenticated>
    </>
  );
}

export function AuthenticatedAppRoutePage({ children }: { children: ReactNode }) {
  return <AuthenticatedRoutePage approvalRequired>{children}</AuthenticatedRoutePage>;
}

export function AuthenticatedUserRoutePage({ children }: { children: ReactNode }) {
  return <AuthenticatedRoutePage approvalRequired={false}>{children}</AuthenticatedRoutePage>;
}
