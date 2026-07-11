import { useAppAuthActions } from "@/authClient";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { PublicLandingAccountSection } from "@/components/PublicLandingAccountSection";
import { PublicLandingPasswordAuthControls } from "@/components/PublicLandingAuthControls";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import {
  VaultDashboardSidebarContent,
  VaultDashboardStaticAccountLoadingSection,
  VaultDashboardStaticAccountSection,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import { CONNECT_REPO_ROUTE } from "@/lib/connectRepoRoute";
import {
  useAppAuthPresentation,
  type AppAuthPresentationProfile,
} from "@/lib/appAuthPresentationState";
import { formatAuthProviderLabel } from "@/lib/authProviderLabel";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { NEW_APP_ROUTE } from "@/lib/newAppRoute";
import { PROVIDERS_ROUTE } from "@/lib/providersRoute";
import { APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID } from "@/lib/publicLanding";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { useQuery as useConvexQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

type AppRightSidebarAuthProviders = (typeof api.users.getViewerAuthProviders)["_returnType"];
type AppRightSidebarViewerAccess = (typeof api.users.currentViewerAccess)["_returnType"];
type AppRightSidebarViewer = NonNullable<(typeof api.users.viewer)["_returnType"]>;

function hasProviderSidebarAccess(viewerAccess: AppRightSidebarViewerAccess | undefined) {
  return viewerAccess?.accessKeys.includes("access_provider_connections") ?? false;
}

function AppRightSidebarAccountLoadingSection() {
  return (
    <VaultDashboardStaticAccountLoadingSection
      dataTestId={APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID}
      label="checking login"
    />
  );
}

function PublicAppRightSidebarContent({ accountPending }: { accountPending: boolean }) {
  return (
    <VaultDashboardSidebarContent>
      {accountPending ? <AppRightSidebarAccountLoadingSection /> : <PublicLandingAccountSection />}
      <PublicLandingPasswordAuthControls />
      <div className="mt-auto">
        <AppSidebarMetaSection linkAlignment="left" />
      </div>
    </VaultDashboardSidebarContent>
  );
}

function AppRightSidebarSignedInAccountSection({
  authProviders,
  isSignOutPending,
  onSignOut,
  profile,
  user,
}: {
  authProviders: AppRightSidebarAuthProviders | undefined;
  isSignOutPending: boolean;
  onSignOut: () => void;
  profile: AppAuthPresentationProfile | null;
  user: AppRightSidebarViewer | null | undefined;
}) {
  const accountPresentation = user?.accountPresentation ?? profile?.accountPresentation;
  const accountProvider = authProviders?.primaryProvider ?? profile?.authProvider;
  const accountProviderLabel = accountProvider ? formatAuthProviderLabel(accountProvider) : null;

  if (accountPresentation === undefined) {
    return <AppRightSidebarAccountLoadingSection />;
  }

  return (
    <VaultDashboardStaticAccountSection
      accountPresentation={accountPresentation}
      dataTestId={APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID}
      isSignOutPending={isSignOutPending}
      onSignOut={onSignOut}
      providerLabel={accountProviderLabel}
    />
  );
}

function GenericSignedInAccountSection({
  authProviders,
  profile,
  user,
}: {
  authProviders?: AppRightSidebarAuthProviders;
  profile: AppAuthPresentationProfile | null;
  user?: AppRightSidebarViewer | null;
}) {
  const { signOut } = useAppAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const handleSignOut = () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    void signOut()
      .catch((error: unknown) => {
        toast({
          description: error instanceof Error ? error.message : "Please try again.",
          title: "Could not sign out",
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsSigningOut(false);
      });
  };

  return (
    <AppRightSidebarSignedInAccountSection
      authProviders={authProviders}
      isSignOutPending={isSigningOut}
      onSignOut={handleSignOut}
      profile={profile}
      user={user}
    />
  );
}

function TemporaryAuthenticatedAppRightSidebarContent({
  profile,
}: {
  profile: AppAuthPresentationProfile | null;
}) {
  return (
    <VaultDashboardSidebarContent>
      <GenericSignedInAccountSection profile={profile} />
      <div className="mt-auto">
        <AppSidebarMetaSection linkAlignment="left" />
      </div>
    </VaultDashboardSidebarContent>
  );
}

function AccountOnlyAuthenticatedAppRightSidebarContent({
  profile,
}: {
  profile: AppAuthPresentationProfile | null;
}) {
  const user = useConvexQuery(api.users.viewer);
  const authProviders = useConvexQuery(api.users.getViewerAuthProviders);

  return (
    <VaultDashboardSidebarContent>
      <GenericSignedInAccountSection authProviders={authProviders} profile={profile} user={user} />
      <div className="mt-auto">
        <AppSidebarMetaSection linkAlignment="left" />
      </div>
    </VaultDashboardSidebarContent>
  );
}

function AppRightSidebarPrimaryLinks() {
  return (
    <>
      <nav
        aria-label="App"
        className="vault-dashboard-sidebar-inset flex flex-col items-start gap-3 border-b border-border/50 py-3 text-sm"
      >
        <Link to={DASHBOARD_ROUTE}>Vaults</Link>
        <Link to={PROVIDERS_ROUTE}>Providers</Link>
      </nav>
      <div className="vault-dashboard-sidebar-inset flex w-full flex-col items-stretch gap-2 py-3">
        <Button className="w-full" asChild>
          <Link to={NEW_APP_ROUTE}>New App</Link>
        </Button>
        <Link
          className={clsx(
            buttonVariants({ variant: "outline" }),
            "h-auto min-h-8 w-full whitespace-normal py-2",
          )}
          to={CONNECT_REPO_ROUTE}
        >
          <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">
            Connect existing app
          </span>
        </Link>
      </div>
    </>
  );
}

function AuthenticatedAppRightSidebarContent({
  profile,
}: {
  profile: AppAuthPresentationProfile | null;
}) {
  const user = useConvexQuery(api.users.viewer);
  const authProviders = useConvexQuery(api.users.getViewerAuthProviders);
  const { signOut } = useAppAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    void signOut()
      .catch((error: unknown) => {
        toast({
          description: error instanceof Error ? error.message : "Please try again.",
          title: "Could not sign out",
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsSigningOut(false);
      });
  };

  return (
    <VaultDashboardSidebarContent>
      <AppRightSidebarSignedInAccountSection
        authProviders={user ? authProviders : undefined}
        isSignOutPending={isSigningOut}
        onSignOut={handleSignOut}
        profile={profile}
        user={user}
      />
      <AppRightSidebarPrimaryLinks />
      <div className="mt-auto">
        <AppSidebarMetaSection linkAlignment="left" />
      </div>
    </VaultDashboardSidebarContent>
  );
}

export function AppRightSidebarContent() {
  const authPresentation = useAppAuthPresentation();
  const viewerAccess = useConvexQuery(
    api.users.currentViewerAccess,
    authPresentation.kind === "confirmedAuthenticated" ? {} : "skip",
  );

  if (authPresentation.kind === "confirmedAuthenticated") {
    if (!hasProviderSidebarAccess(viewerAccess)) {
      if (viewerAccess === undefined) {
        return <TemporaryAuthenticatedAppRightSidebarContent profile={authPresentation.profile} />;
      }

      return <AccountOnlyAuthenticatedAppRightSidebarContent profile={authPresentation.profile} />;
    }

    return <AuthenticatedAppRightSidebarContent profile={authPresentation.profile} />;
  }

  if (authPresentation.kind === "temporaryAuthenticated") {
    return <TemporaryAuthenticatedAppRightSidebarContent profile={authPresentation.profile} />;
  }

  return <PublicAppRightSidebarContent accountPending={authPresentation.kind === "unknown"} />;
}
