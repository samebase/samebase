import { useSamebaseAuthActions } from "@/authClient";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import {
  PublicLandingAccountLoadingSection,
  PublicLandingAccountSection,
} from "@/components/PublicLandingAccountSection";
import { PublicLandingPasswordAuthControls } from "@/components/PublicLandingAuthControls";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import {
  VaultDashboardAccountSection,
  VaultDashboardSidebarContent,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import { CONNECT_REPO_ROUTE } from "@/lib/connectRepoRoute";
import {
  useAppAuthPresentation,
  type AppAuthPresentationProfile,
} from "@/lib/appAuthPresentationState";
import { formatAuthProviderLabel } from "@/lib/authProviderLabel";
import { NEW_APP_ROUTE } from "@/lib/newAppRoute";
import { PROVIDERS_ROUTE } from "@/lib/providersRoute";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { useMutation, useQuery as useConvexQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

type AppRightSidebarAuthProviders = (typeof api.users.getViewerAuthProviders)["_returnType"];
type AppRightSidebarViewerAccess = (typeof api.users.currentViewerAccess)["_returnType"];
type AppRightSidebarViewer = NonNullable<(typeof api.users.viewer)["_returnType"]>;

function hasProviderSidebarAccess(viewerAccess: AppRightSidebarViewerAccess | undefined) {
  return viewerAccess?.accessKeys.includes("access_provider_connections") ?? false;
}

function PublicAppRightSidebarContent() {
  return (
    <VaultDashboardSidebarContent>
      <PublicLandingAccountSection />
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
  onOpenChange,
  onSignOut,
  open,
  profile,
  user,
}: {
  authProviders: AppRightSidebarAuthProviders | undefined;
  isSignOutPending: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSignOut: () => void;
  open: boolean;
  profile: AppAuthPresentationProfile | null;
  user: AppRightSidebarViewer | null | undefined;
}) {
  const accountEmail = user?.email ?? user?.githubUsername ?? profile?.email ?? profile?.name;
  const accountDisplayName =
    user?.name ?? user?.email ?? user?.githubUsername ?? profile?.name ?? profile?.email;
  const accountProviderLabel = authProviders?.primaryProvider
    ? formatAuthProviderLabel(authProviders.primaryProvider)
    : null;

  if (accountDisplayName === undefined || accountEmail === undefined) {
    return <PublicLandingAccountLoadingSection />;
  }

  return (
    <VaultDashboardAccountSection
      displayName={accountDisplayName}
      email={accountEmail}
      isSignOutPending={isSignOutPending}
      onOpenChange={onOpenChange}
      onSignOut={onSignOut}
      open={open}
      providerLabel={accountProviderLabel}
      signOutDisabled={false}
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
  const { signOut } = useSamebaseAuthActions();
  const [accountOpen, setAccountOpen] = useState(false);
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
      onOpenChange={setAccountOpen}
      onSignOut={handleSignOut}
      open={accountOpen}
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
  const dashboardSettings = useConvexQuery(api.dashboardSettings.getDashboardSettings);
  const persistAccountPanelOpen = useMutation(
    api.dashboardSettings.setAccountPanelOpen,
  ).withOptimisticUpdate((localStore, args) => {
    const currentSettings = localStore.getQuery(api.dashboardSettings.getDashboardSettings, {});
    if (!currentSettings) {
      return;
    }
    localStore.setQuery(
      api.dashboardSettings.getDashboardSettings,
      {},
      {
        ...currentSettings,
        accountPanelOpen: args.isOpen,
      },
    );
  });
  const { signOut } = useSamebaseAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const resolvedAccountPanelOpen = dashboardSettings?.accountPanelOpen ?? false;

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
        onOpenChange={(isOpen) => {
          if (!user) {
            return;
          }

          void persistAccountPanelOpen({ isOpen }).catch((error: unknown) => {
            console.error("Failed to persist account panel state:", error);
          });
        }}
        onSignOut={handleSignOut}
        open={user ? resolvedAccountPanelOpen : false}
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

  return <PublicAppRightSidebarContent />;
}
