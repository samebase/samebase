import { PublicOAuthReturnNotice } from "@/components/PublicOAuthReturnNotice";
import { AuthorizationErrorNotice } from "@/components/AuthorizationErrorNotice";
import { PublicLandingAuthControls } from "@/components/PublicLandingAuthControls";
import {
  RepositoryDashboardAccountSection,
  RepositoryDashboardAccountSectionFrame,
} from "@/components/repository-dashboard/RepositoryDashboardChrome";
import { SignedIn } from "@samebase/convex-auth-tanstack-start";
import { NotSignedIn } from "@/components/NotSignedIn";
import { useQuery } from "@tanstack/react-query";
import { rootQueries } from "@/routes/root.queries";
import { type GetFunctionReferenceReturnType } from "@/lib/convexUtils";
import { shouldRenderOAuthReturnNotice } from "@/lib/publicLandingAuthState";
import { formatAuthorizationErrorMessage } from "@/lib/authorizationErrorMessage";
import { useAuthorizationErrorNotice } from "@/lib/useAuthorizationErrorNotice";
import { useOAuthSignInRejection } from "@/lib/oauthSignInRejection";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "@/lib/publicLanding";
import { clearAuthorizationErrorSearch } from "@/routeSearch/authorizationError";
import { readRootRouteSearch } from "@/routeSearch/root";
import { useLocation, useMatches, useRouter } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "../../convex/_generated/api";
import { AUTHORIZATION_PROVIDERS } from "../../shared/authorizationError";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";
import { isOrganizationInvitationPath } from "@/organization/organizationInvitationRoute";

type PublicLandingSignedInViewer = NonNullable<
  GetFunctionReferenceReturnType<typeof api.users.viewer>
>;

function PublicLandingLoggedOutAccountSection() {
  const router = useRouter();
  const routeIsPublic = useMatches({
    select: (matches) => matches.every((match) => match.staticData.access === "access_public"),
  });
  const location = useLocation({
    select: (currentLocation) => ({
      pathname: currentLocation.pathname,
      searchStr: currentLocation.searchStr,
    }),
  });
  const rootRouteSearch = readRootRouteSearch(location.searchStr);
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
    allowedProviders: AUTHORIZATION_PROVIDERS,
    onConsume: consumeAuthorizationError,
    search: rootRouteSearch,
    scopeKey: location.pathname,
  });
  const signInRejection = useOAuthSignInRejection();
  const showOAuthReturnNotice = shouldRenderOAuthReturnNotice(
    location.pathname,
    rootRouteSearch,
    signInRejection !== null,
  );
  // The provider's return lands on this page with a one-time code that the browser redeems after
  // the page loads, and the auth provider reports loading until the session is minted. The notice
  // is for a return that settled without a session.
  const { isLoading } = useConvexAuth();

  if (showOAuthReturnNotice && isLoading) {
    return <PublicLandingAccountLoadingSection />;
  }

  return (
    <div
      data-testid={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      className="repository-dashboard-sidebar-inset py-3"
    >
      <div
        data-repository-dashboard-account-section-label
        className="min-w-0 line-clamp-2 border-b border-border/50 pb-3 text-center text-sm font-medium [overflow-wrap:anywhere]"
      >
        Sign in or create an account
      </div>
      <div className="mt-3 flex flex-col items-center gap-2">
        {authorizationError !== null ? (
          <AuthorizationErrorNotice>
            {formatAuthorizationErrorMessage(authorizationError)}
          </AuthorizationErrorNotice>
        ) : null}
        {signInRejection !== null ? (
          <AuthorizationErrorNotice>{signInRejection}</AuthorizationErrorNotice>
        ) : null}
        {showOAuthReturnNotice ? (
          <PublicOAuthReturnNotice />
        ) : (
          <PublicLandingAuthControls
            oauthAuthFlow={
              location.pathname === MCP_CONSENT_APP_PATH ||
              isOrganizationInvitationPath(location.pathname) ||
              !routeIsPublic
                ? "current-route"
                : "public-signup"
            }
          />
        )}
      </div>
    </div>
  );
}

export function PublicLandingAccountLoadingSection() {
  return (
    <RepositoryDashboardAccountSectionFrame
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      label="checking login"
      open={false}
      onOpenChange={() => {}}
    >
      {null}
    </RepositoryDashboardAccountSectionFrame>
  );
}

function PublicLandingResolvedSignedInAccountSection({
  viewer,
}: {
  viewer: PublicLandingSignedInViewer;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <RepositoryDashboardAccountSection
      accountPresentation={viewer.accountPresentation}
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      onOpenChange={setAccountOpen}
      open={accountOpen}
    />
  );
}

function PublicLandingSignedInAccountSection() {
  const { data: viewer } = useQuery(rootQueries.viewer);

  if (viewer === undefined || viewer === null) {
    return <PublicLandingAccountLoadingSection />;
  }

  return <PublicLandingResolvedSignedInAccountSection viewer={viewer} />;
}

export function PublicLandingAccountSection() {
  return (
    <>
      <SignedIn>
        <PublicLandingSignedInAccountSection />
      </SignedIn>
      <NotSignedIn>
        <PublicLandingLoggedOutAccountSection />
      </NotSignedIn>
    </>
  );
}
