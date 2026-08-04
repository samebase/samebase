import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME } from "@/components/appSidebarNavigation";
import { PublicLandingAccountSection } from "@/components/PublicLandingAccountSection";
import { buttonVariants } from "@/components/ui/button";
import {
  VaultDashboardSidebarContent,
  VaultDashboardStaticAccountLoadingSection,
  VaultDashboardStaticAccountSection,
  VaultDashboardStaticAccountStatusSection,
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
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { useQuery as useConvexQuery } from "convex/react";
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
      <div className="mt-auto">
        <AppSidebarMetaSection linkAlignment="left" />
      </div>
    </VaultDashboardSidebarContent>
  );
}

function AppRightSidebarSignedInAccountSection({
  authProviders,
  profile,
  user,
}: {
  authProviders?: AppRightSidebarAuthProviders | undefined;
  profile: AppAuthPresentationProfile | null;
  user?: AppRightSidebarViewer | null | undefined;
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
      providerLabel={accountProviderLabel}
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
      <AppRightSidebarSignedInAccountSection profile={profile} />
      <div className="mt-auto">
        <AppSidebarMetaSection linkAlignment="left" />
      </div>
    </VaultDashboardSidebarContent>
  );
}

function AccountOnlyAuthenticatedAppRightSidebarContent({
  profile,
  deleting,
}: {
  profile: AppAuthPresentationProfile | null;
  deleting: boolean;
}) {
  const user = useConvexQuery(api.users.viewer);
  const authProviders = useConvexQuery(api.users.getViewerAuthProviders, deleting ? "skip" : {});
  const accountPresentation = user?.accountPresentation ?? profile?.accountPresentation;

  return (
    <VaultDashboardSidebarContent>
      {deleting && accountPresentation !== undefined ? (
        <VaultDashboardStaticAccountStatusSection
          accountPresentation={accountPresentation}
          dataTestId={APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID}
          statusLabel="Deleting account"
        />
      ) : (
        <AppRightSidebarSignedInAccountSection
          authProviders={authProviders}
          profile={profile}
          user={user}
        />
      )}
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
        className="vault-dashboard-sidebar-inset flex flex-col items-start gap-3 border-b border-border/50 py-3"
      >
        <Link className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME} to={DASHBOARD_ROUTE}>
          /vault
        </Link>
        <Link className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME} to={PROVIDERS_ROUTE}>
          /providers
        </Link>
      </nav>
      <div className="vault-dashboard-sidebar-inset flex w-full flex-col items-stretch gap-2 py-3">
        <Link
          className={cn(buttonVariants(), "w-full justify-start text-left text-base")}
          to={NEW_APP_ROUTE}
        >
          /new-app
        </Link>
        <Link
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-auto min-h-8 w-full justify-start py-2 text-left text-base whitespace-normal",
          )}
          to={CONNECT_REPO_ROUTE}
        >
          <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">/connect-repo</span>
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

  return (
    <VaultDashboardSidebarContent>
      <AppRightSidebarSignedInAccountSection
        authProviders={user ? authProviders : undefined}
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

      return (
        <AccountOnlyAuthenticatedAppRightSidebarContent
          deleting={viewerAccess.role === "role_deleting"}
          profile={authPresentation.profile}
        />
      );
    }

    return <AuthenticatedAppRightSidebarContent profile={authPresentation.profile} />;
  }

  if (authPresentation.kind === "temporaryAuthenticated") {
    return <TemporaryAuthenticatedAppRightSidebarContent profile={authPresentation.profile} />;
  }

  return <PublicAppRightSidebarContent accountPending={authPresentation.kind === "unknown"} />;
}
