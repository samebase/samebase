import { PublicSignupClosedNotice } from "@/components/PublicSignupClosedNotice";
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
import { applySearchPatch, type SearchPatch } from "@/routing/searchFlags";
import { readRootRouteSearch, type RootRouteSearch } from "@/routeSearch/root";
import { SignInWithGoogle } from "@/SignInWithGoogle";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useMemo, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";
import { useWorkspacePaneActions } from "@/components/workspace-layout-v2/WorkspacePaneRuntime";

type PublicLandingAccountMode = "links" | "sign-in" | "create-account" | "mcp-consent";
type PublicLandingSignedInViewer = NonNullable<
  GetFunctionReferenceReturnType<typeof api.users.viewer>
>;

const ACCOUNT_LINK_CLASS_NAME = "text-base underline underline-offset-4";

function resolvePublicLandingAccountMode(
  pathname: string,
  rootRouteSearch: RootRouteSearch,
): PublicLandingAccountMode {
  if (pathname === MCP_CONSENT_APP_PATH) {
    return "mcp-consent";
  }
  if (shouldRenderGoogleSignupClosedState(pathname, rootRouteSearch)) {
    return "create-account";
  }
  if (pathname === "/" && rootRouteSearch["sign-in"]) {
    return "sign-in";
  }
  return "links";
}

function buildPublicAccountModeSearchPatch(
  mode: Exclude<PublicLandingAccountMode, "links">,
): SearchPatch<RootRouteSearch> {
  return {
    auth: null,
    "auth-return": null,
    "create-account": mode === "create-account" ? true : null,
    signup: null,
    "sign-in": mode === "sign-in" ? true : null,
  };
}

function publicAccountModeLink(mode: Exclude<PublicLandingAccountMode, "links">) {
  return (currentSearch: RootRouteSearch) =>
    applySearchPatch(currentSearch, buildPublicAccountModeSearchPatch(mode));
}

function clearPublicAccountModeSearch(currentSearch: RootRouteSearch) {
  return applySearchPatch(currentSearch, {
    auth: null,
    "auth-return": null,
    "create-account": null,
    signup: null,
    "sign-in": null,
  });
}

function PublicAccountRouteLink({
  children,
  mode,
}: {
  children: ReactNode;
  mode: Exclude<PublicLandingAccountMode, "links">;
}) {
  return (
    <Link className={ACCOUNT_LINK_CLASS_NAME} to="/" search={publicAccountModeLink(mode)}>
      {children}
    </Link>
  );
}

function PublicLandingLoggedOutAccountContent({ mode }: { mode: PublicLandingAccountMode }) {
  if (mode === "mcp-consent") {
    return <SignInWithGoogle visible />;
  }

  if (mode === "create-account") {
    return (
      <PublicSignupClosedNotice
        footer={<PublicAccountRouteLink mode="sign-in">?sign-in</PublicAccountRouteLink>}
      />
    );
  }

  if (mode === "sign-in") {
    return (
      <div className="flex flex-col gap-3">
        <SignInWithGoogle authReturn="dashboard" visible markPublicSignupReturn />
        <PublicAccountRouteLink mode="create-account">?create-account</PublicAccountRouteLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <PublicAccountRouteLink mode="sign-in">?sign-in</PublicAccountRouteLink>
      <PublicAccountRouteLink mode="create-account">?create-account</PublicAccountRouteLink>
    </div>
  );
}

function PublicLandingLoggedOutAccountSection() {
  const location = useLocation({
    select: (currentLocation) => ({
      pathname: currentLocation.pathname,
      searchStr: currentLocation.searchStr,
    }),
  });
  const navigate = useNavigate();
  const rootRouteSearch = readRootRouteSearch(location.searchStr);
  const mode = resolvePublicLandingAccountMode(location.pathname, rootRouteSearch);
  const [accountOpen, setAccountOpen] = useState(false);
  const open = mode === "links" ? accountOpen : true;

  return (
    <VaultDashboardAccountSectionFrame
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      label="not logged in"
      open={open}
      onOpenChange={(isOpen) => {
        setAccountOpen(isOpen);
        if (!isOpen && (mode === "sign-in" || mode === "create-account")) {
          void navigate({
            replace: true,
            search: clearPublicAccountModeSearch,
            state: true,
            to: "/",
          });
        }
      }}
    >
      <PublicLandingLoggedOutAccountContent mode={mode} />
    </VaultDashboardAccountSectionFrame>
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
  const { setMobilePane } = useWorkspacePaneActions();
  const providerLabel = useMemo(() => {
    const provider = authProviders?.primaryProvider ?? authProviders?.providers[0];
    return formatAuthProviderLabel(provider);
  }, [authProviders?.primaryProvider, authProviders?.providers]);
  return (
    <VaultDashboardAccountSection
      accountPresentation={viewer.accountPresentation}
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      onOpenChange={setAccountOpen}
      onSettings={() => setMobilePane("main")}
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
  const { setMobilePane } = useWorkspacePaneActions();
  return (
    <VaultDashboardAccountSection
      accountPresentation={profile.accountPresentation}
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      onOpenChange={setAccountOpen}
      onSettings={() => setMobilePane("main")}
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
