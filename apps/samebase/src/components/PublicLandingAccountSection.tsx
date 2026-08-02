import { PublicSignupClosedNotice } from "@/components/PublicSignupClosedNotice";
import { PublicLandingAuthControls } from "@/components/PublicLandingAuthControls";
import {
  VaultDashboardAccountSection,
  VaultDashboardAccountSectionFrame,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import {
  useAppAuthPresentation,
  type AppAuthPresentationProfile,
} from "@/lib/appAuthPresentationState";
import { formatAuthProviderLabel } from "@/lib/authProviderLabel";
import { type GetFunctionReferenceReturnType } from "@/lib/convexUtils";
import { shouldRenderGoogleSignupClosedState } from "@/lib/publicLandingAuthState";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "@/lib/publicLanding";
import { readRootRouteSearch } from "@/routeSearch/root";
import { useLocation, useMatches } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";

type PublicLandingSignedInViewer = NonNullable<
  GetFunctionReferenceReturnType<typeof api.users.viewer>
>;

function PublicLandingLoggedOutAccountSection() {
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
  const showGoogleSignupClosedState = shouldRenderGoogleSignupClosedState(
    location.pathname,
    rootRouteSearch,
  );

  return (
    <div
      data-testid={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      className="vault-dashboard-sidebar-inset py-3"
    >
      <div
        data-vault-dashboard-account-section-label
        className="min-w-0 line-clamp-2 border-b border-border/50 pb-3 text-sm font-medium [overflow-wrap:anywhere]"
      >
        Sign in or create an account
      </div>
      <div className="mt-3">
        {showGoogleSignupClosedState ? (
          <PublicSignupClosedNotice />
        ) : (
          <PublicLandingAuthControls
            googleAuthFlow={
              location.pathname === MCP_CONSENT_APP_PATH || !routeIsPublic
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
    <VaultDashboardAccountSectionFrame
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      label="checking login"
      open={false}
      onOpenChange={() => {}}
    >
      {null}
    </VaultDashboardAccountSectionFrame>
  );
}

function PublicLandingResolvedSignedInAccountSection({
  viewer,
}: {
  viewer: PublicLandingSignedInViewer;
}) {
  const authProviders = useQuery(api.users.getViewerAuthProviders);
  const [accountOpen, setAccountOpen] = useState(false);
  const providerLabel = useMemo(() => {
    const provider = authProviders?.primaryProvider ?? authProviders?.providers[0];
    return formatAuthProviderLabel(provider);
  }, [authProviders?.primaryProvider, authProviders?.providers]);
  return (
    <VaultDashboardAccountSection
      accountPresentation={viewer.accountPresentation}
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      onOpenChange={setAccountOpen}
      open={accountOpen}
      providerLabel={providerLabel}
    />
  );
}

function PublicLandingPresentedSignedInAccountSection({
  profile,
}: {
  profile: AppAuthPresentationProfile;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <VaultDashboardAccountSection
      accountPresentation={profile.accountPresentation}
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      onOpenChange={setAccountOpen}
      open={accountOpen}
      providerLabel={null}
    />
  );
}

function PublicLandingSignedInAccountSection({
  loadViewer,
  profile,
}: {
  loadViewer: boolean;
  profile: AppAuthPresentationProfile | null;
}) {
  const viewer = useQuery(api.users.viewer, loadViewer ? {} : "skip");

  if (viewer === undefined || viewer === null) {
    return profile === null ? (
      <PublicLandingAccountLoadingSection />
    ) : (
      <PublicLandingPresentedSignedInAccountSection profile={profile} />
    );
  }

  return <PublicLandingResolvedSignedInAccountSection viewer={viewer} />;
}

export function PublicLandingAccountSection() {
  const authPresentation = useAppAuthPresentation();

  if (authPresentation.kind === "unknown") {
    return <PublicLandingAccountLoadingSection />;
  }

  if (authPresentation.kind === "temporaryAuthenticated") {
    return (
      <PublicLandingSignedInAccountSection loadViewer={false} profile={authPresentation.profile} />
    );
  }

  if (authPresentation.kind === "confirmedAuthenticated") {
    return <PublicLandingSignedInAccountSection loadViewer profile={authPresentation.profile} />;
  }

  return <PublicLandingLoggedOutAccountSection />;
}
