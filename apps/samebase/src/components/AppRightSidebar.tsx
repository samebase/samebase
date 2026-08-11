import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME } from "@/components/appSidebarNavigation";
import { OrganizationContextControl } from "@/components/OrganizationContextControl";
import {
  findViewerOrganization,
  useOrganizationContext,
  type ViewerOrganization,
} from "@/lib/organizationContext";
import { PublicLandingAccountSection } from "@/components/PublicLandingAccountSection";
import {
  VaultDashboardSidebarContent,
  VaultDashboardStaticAccountLoadingSection,
  VaultDashboardStaticAccountSection,
  VaultDashboardStaticAccountStatusSection,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import {
  useAppAuthPresentation,
  type AppAuthPresentationProfile,
} from "@/lib/appAuthPresentationState";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import {
  ORGANIZATION_CONNECT_REPO_ROUTE,
  ORGANIZATION_MEMBERS_ROUTE,
  ORGANIZATION_NEW_APP_ROUTE,
  ORGANIZATION_PROVIDERS_ROUTE,
  ORGANIZATION_SETTINGS_ROUTE,
  ORGANIZATION_VAULTS_ROUTE,
} from "@/lib/organizationRoutes";
import { APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID } from "@/lib/publicLanding";
import { Link } from "@tanstack/react-router";
import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

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
  profile,
  user,
}: {
  profile: AppAuthPresentationProfile | null;
  user?: AppRightSidebarViewer | null;
}) {
  const accountPresentation = user?.accountPresentation ?? profile?.accountPresentation;

  if (accountPresentation === undefined) {
    return <AppRightSidebarAccountLoadingSection />;
  }

  return (
    <VaultDashboardStaticAccountSection
      accountPresentation={accountPresentation}
      dataTestId={APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID}
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
        <AppRightSidebarSignedInAccountSection profile={profile} user={user} />
      )}
      <div className="mt-auto">
        <AppSidebarMetaSection linkAlignment="left" />
      </div>
    </VaultDashboardSidebarContent>
  );
}

function GlobalAppRightSidebarLinks({ showAllVaults }: { showAllVaults: boolean }) {
  if (!showAllVaults) {
    return null;
  }

  return (
    <nav
      aria-label="Account"
      className="vault-dashboard-sidebar-inset flex flex-col items-start gap-3 border-b border-border/50 py-3"
    >
      <Link className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME} to={DASHBOARD_ROUTE}>
        All vaults
      </Link>
    </nav>
  );
}

function OrganizationAppRightSidebarLinks({ organization }: { organization: ViewerOrganization }) {
  const params = { owner: organization.githubOwnerLogin };
  return (
    <nav
      aria-label="Organization"
      className="vault-dashboard-sidebar-inset flex flex-col items-start gap-3 border-b border-border/50 py-3"
    >
      <Link
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        params={params}
        to={ORGANIZATION_VAULTS_ROUTE}
      >
        Vaults
      </Link>
      <Link
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        params={params}
        to={ORGANIZATION_PROVIDERS_ROUTE}
      >
        Providers
      </Link>
      <Link
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        params={params}
        to={ORGANIZATION_NEW_APP_ROUTE}
      >
        New app
      </Link>
      <Link
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        params={params}
        to={ORGANIZATION_CONNECT_REPO_ROUTE}
      >
        Connect repository
      </Link>
      <Link
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        params={params}
        to={ORGANIZATION_MEMBERS_ROUTE}
      >
        Members
      </Link>
      <Link
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        params={params}
        to={ORGANIZATION_SETTINGS_ROUTE}
      >
        Organization settings
      </Link>
    </nav>
  );
}

function AuthenticatedAppRightSidebarContent({
  profile,
}: {
  profile: AppAuthPresentationProfile | null;
}) {
  const user = useConvexQuery(api.users.viewer);
  const { organizations, surface } = useOrganizationContext();
  const routedOrganization =
    surface.kind === "organization" && organizations
      ? findViewerOrganization(organizations, surface.owner)
      : null;
  const organizationContextPending = surface.kind === "organization" && organizations === undefined;

  return (
    <VaultDashboardSidebarContent>
      <AppRightSidebarSignedInAccountSection profile={profile} user={user} />
      <OrganizationContextControl />
      {organizationContextPending || routedOrganization === null ? null : (
        <OrganizationAppRightSidebarLinks organization={routedOrganization} />
      )}
      {organizationContextPending ? null : (
        <GlobalAppRightSidebarLinks showAllVaults={surface.kind !== "allVaults"} />
      )}
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
