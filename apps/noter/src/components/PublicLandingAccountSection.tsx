import { useNoterAuthActions } from "@/authClient";
import { PublicSignupClosedNotice } from "@/components/PublicSignupClosedNotice";
import {
  VaultDashboardAccountSection,
  VaultDashboardAccountSectionFrame,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import { formatAuthProviderLabel } from "@/lib/authProviderLabel";
import { shouldRenderGoogleSignupClosedState } from "@/lib/publicLandingAuthState";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "@/lib/publicLanding";
import { applySearchPatch, type SearchPatch } from "@/lib/routeSearchFlags";
import { readRootRouteSearch, type RootRouteSearch } from "@/lib/rootRouteSearch";
import { SignInWithGoogle } from "@/SignInWithGoogle";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useMemo, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";

type PublicLandingAccountMode = "links" | "sign-in" | "create-account";

const ACCOUNT_LINK_CLASS_NAME = "text-base underline underline-offset-4";

function resolvePublicLandingAccountMode(
  pathname: string,
  rootRouteSearch: RootRouteSearch,
): PublicLandingAccountMode {
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
        if (!isOpen && mode !== "links") {
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

function PublicLandingSignedInAccountSection() {
  const viewer = useQuery(api.users.viewer);
  const authProviders = useQuery(api.users.getViewerAuthProviders);
  const { signOut } = useNoterAuthActions();
  const [accountOpen, setAccountOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const providerLabel = useMemo(() => {
    const provider = authProviders?.primaryProvider ?? authProviders?.providers[0];
    return formatAuthProviderLabel(provider);
  }, [authProviders?.primaryProvider, authProviders?.providers]);
  const accountEmail = viewer?.email ?? viewer?.githubUsername ?? viewer?.name ?? "Signed in";
  const accountDisplayName = viewer?.name ?? viewer?.email ?? viewer?.githubUsername ?? "Account";

  return (
    <VaultDashboardAccountSection
      dataTestId={PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}
      displayName={accountDisplayName}
      email={accountEmail}
      isSignOutPending={isSigningOut}
      onOpenChange={setAccountOpen}
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
      open={accountOpen}
      providerLabel={providerLabel}
      signOutDisabled={false}
    />
  );
}

export function PublicLandingAccountSection() {
  const { isAuthenticated } = useConvexAuth();

  if (isAuthenticated) {
    return <PublicLandingSignedInAccountSection />;
  }

  return <PublicLandingLoggedOutAccountSection />;
}
