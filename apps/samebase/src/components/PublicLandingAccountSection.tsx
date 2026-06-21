import { useAppAuthActions } from "@/authClient";
import {
  VaultDashboardAccountPrehydrationPlaceholders,
  VaultDashboardAccountSection,
  VaultDashboardAccountSectionFrame,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import {
  useAppAuthPresentation,
  type AppAuthPresentationProfile,
} from "@/lib/appAuthPresentationState";
import { formatAuthProviderLabel } from "@/lib/authProviderLabel";
import { type GetFunctionReferenceReturnType } from "@/lib/convexUtils";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "@/lib/publicLanding";
import { applySearchPatch, type SearchPatch } from "@/routing/searchFlags";
import { type RootRouteSearch } from "@/routeSearch/root";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useMemo, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";

type PublicLandingAccountMode = "sign-in" | "create-account";
type PublicLandingSignedInViewer = NonNullable<
  GetFunctionReferenceReturnType<typeof api.users.viewer>
>;

const ACCOUNT_LINK_CLASS_NAME = "text-base underline underline-offset-4";

function buildPublicAccountModeSearchPatch(
  mode: PublicLandingAccountMode,
): SearchPatch<RootRouteSearch> {
  return {
    auth: null,
    "auth-return": null,
    "create-account": mode === "create-account" ? true : null,
    signup: null,
    "sign-in": mode === "sign-in" ? true : null,
  };
}

function publicAccountModeLink(mode: PublicLandingAccountMode) {
  return (currentSearch: RootRouteSearch) =>
    applySearchPatch(currentSearch, buildPublicAccountModeSearchPatch(mode));
}

function PublicAccountRouteLink({
  children,
  mode,
}: {
  children: ReactNode;
  mode: PublicLandingAccountMode;
}) {
  return (
    <Link className={ACCOUNT_LINK_CLASS_NAME} to="/" search={publicAccountModeLink(mode)}>
      {children}
    </Link>
  );
}

function PublicLandingLoggedOutAccountLinks() {
  return (
    <div className="flex flex-col items-start gap-3">
      <PublicAccountRouteLink mode="sign-in">?sign-in</PublicAccountRouteLink>
      <PublicAccountRouteLink mode="create-account">?create-account</PublicAccountRouteLink>
    </div>
  );
}

function PublicLandingLoggedOutAccountSection() {
  return (
    <VaultDashboardAccountSectionFrame
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      label="not logged in"
    >
      <PublicLandingLoggedOutAccountLinks />
    </VaultDashboardAccountSectionFrame>
  );
}

export function PublicLandingAccountLoadingSection() {
  return (
    <VaultDashboardAccountSectionFrame
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      label="checking login"
    >
      <VaultDashboardAccountPrehydrationPlaceholders
        signedOutLinks={<PublicLandingLoggedOutAccountLinks />}
      />
    </VaultDashboardAccountSectionFrame>
  );
}

function PublicLandingResolvedSignedInAccountSection({
  viewer,
}: {
  viewer: PublicLandingSignedInViewer;
}) {
  const authProviders = useQuery(api.users.getViewerAuthProviders);
  const { signOut } = useAppAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const providerLabel = useMemo(() => {
    const provider = authProviders?.primaryProvider ?? authProviders?.providers[0];
    return formatAuthProviderLabel(provider);
  }, [authProviders?.primaryProvider, authProviders?.providers]);
  const accountEmail = viewer.email ?? viewer.githubUsername ?? viewer.name;

  if (accountEmail === undefined) {
    return <PublicLandingAccountLoadingSection />;
  }

  return (
    <VaultDashboardAccountSection
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      email={accountEmail}
      isSignOutPending={isSigningOut}
      onSignOut={() => {
        if (isSigningOut) {
          return;
        }
        setIsSigningOut(true);
        void signOut()
          .catch((error: unknown) => {
            console.error("Failed to sign out:", error);
          })
          .finally(() => {
            setIsSigningOut(false);
          });
      }}
      providerLabel={providerLabel}
      signOutDisabled={false}
    />
  );
}

function PublicLandingPresentedSignedInAccountSection({
  profile,
}: {
  profile: AppAuthPresentationProfile;
}) {
  const { signOut } = useAppAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const accountEmail = profile.email ?? profile.name;

  if (accountEmail === undefined) {
    return <PublicLandingAccountLoadingSection />;
  }

  return (
    <VaultDashboardAccountSection
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      email={accountEmail}
      isSignOutPending={isSigningOut}
      onSignOut={() => {
        if (isSigningOut) {
          return;
        }
        setIsSigningOut(true);
        void signOut()
          .catch((error: unknown) => {
            console.error("Failed to sign out:", error);
          })
          .finally(() => {
            setIsSigningOut(false);
          });
      }}
      providerLabel={null}
      signOutDisabled={false}
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
