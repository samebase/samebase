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
  return (
    viewerAccess?.termsAccepted !== false &&
    (viewerAccess?.accessKeys.includes("access_provider_connections") ?? false)
  );
}

function AppRightSidebarAccountLoadingSection() {
  return (
    <VaultDashboardStaticAccountLoadingSection
      dataTestId={APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID}
      label="checking login"
    />
  );
}

function AppRightSidebarOnboardingVideo() {
  return (
    <section className="vault-dashboard-sidebar-inset pb-3 pt-6">
      <h2 className="text-2xl font-medium">First time using Samebase?</h2>
      <a
        href="https://youtu.be/8-ZEGPpqi9Y"
        rel="noreferrer"
        target="_blank"
        className="mt-2 block text-lg underline"
      >
        Watch the complete onboarding on <span className="text-red-600">YouTube</span>
      </a>
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="mt-2 aspect-[48/31] w-full border-0"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        src="https://www.youtube-nocookie.com/embed/8-ZEGPpqi9Y"
        title="Samebase onboarding: Complete setup from scratch"
      />
    </section>
  );
}

function AppRightSidebarFooter({ showOnboardingVideo }: { showOnboardingVideo: boolean }) {
  return (
    <div className="mt-auto">
      {showOnboardingVideo ? <AppRightSidebarOnboardingVideo /> : null}
      <AppSidebarMetaSection linkAlignment="left" />
    </div>
  );
}

function PublicAppRightSidebarContent({ accountPending }: { accountPending: boolean }) {
  return (
    <VaultDashboardSidebarContent>
      {accountPending ? <AppRightSidebarAccountLoadingSection /> : <PublicLandingAccountSection />}
      <AppRightSidebarFooter showOnboardingVideo={false} />
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
      <GlobalAppRightSidebarLinks />
      <AppRightSidebarFooter showOnboardingVideo={false} />
    </VaultDashboardSidebarContent>
  );
}

function AccountOnlyAuthenticatedAppRightSidebarContent({
  deleting,
  pending,
  profile,
}: {
  deleting: boolean;
  pending: boolean;
  profile: AppAuthPresentationProfile | null;
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
      <GlobalAppRightSidebarLinks />
      {pending && accountPresentation !== undefined ? (
        <section
          aria-labelledby="pending-access-sidebar-heading"
          className="vault-dashboard-sidebar-inset flex flex-1 flex-col justify-center py-8"
          role="status"
        >
          <h2 id="pending-access-sidebar-heading" className="text-base font-semibold leading-6">
            Beta access pending
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Samebase is currently in private beta, so access is approved manually. You’re signed in
            as <span className="[overflow-wrap:anywhere]">{accountPresentation.label}</span>
            {". This page will update automatically when your account is approved."}
          </p>
        </section>
      ) : null}
      <AppRightSidebarFooter showOnboardingVideo />
    </VaultDashboardSidebarContent>
  );
}

function GlobalAppRightSidebarLinks() {
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

function AdminAppRightSidebarLinks() {
  return (
    <nav
      aria-label="Admin"
      className="vault-dashboard-sidebar-inset flex flex-col items-start gap-3 border-b border-border/50 py-3"
    >
      <Link className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME} to="/admin/users">
        Users
      </Link>
      <Link className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME} to="/admin/account-deletions">
        Account deletions
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
  showAdminNavigation,
}: {
  profile: AppAuthPresentationProfile | null;
  showAdminNavigation: boolean;
}) {
  const user = useConvexQuery(api.users.viewer);
  const vaults = useConvexQuery(api.vault.dashboard.getUserVaults);
  const { organizations, surface } = useOrganizationContext();
  const routedOrganization =
    surface.kind === "organization" && organizations
      ? findViewerOrganization(organizations, surface.owner)
      : null;
  const organizationContextPending = surface.kind === "organization" && organizations === undefined;
  const showOnboardingVideo =
    vaults !== undefined &&
    !vaults.some((vault) => vault.hasConvexProvision && vault.hasCloudflareProvision);

  return (
    <VaultDashboardSidebarContent>
      <AppRightSidebarSignedInAccountSection profile={profile} user={user} />
      <GlobalAppRightSidebarLinks />
      <OrganizationContextControl />
      {showAdminNavigation ? <AdminAppRightSidebarLinks /> : null}
      {organizationContextPending || routedOrganization === null ? null : (
        <OrganizationAppRightSidebarLinks organization={routedOrganization} />
      )}
      <AppRightSidebarFooter showOnboardingVideo={showOnboardingVideo} />
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
          pending={viewerAccess.role === "role_pending_access"}
          profile={authPresentation.profile}
        />
      );
    }

    return (
      <AuthenticatedAppRightSidebarContent
        profile={authPresentation.profile}
        showAdminNavigation={viewerAccess?.accessKeys.includes("access_admin") ?? false}
      />
    );
  }

  if (authPresentation.kind === "temporaryAuthenticated") {
    return <TemporaryAuthenticatedAppRightSidebarContent profile={authPresentation.profile} />;
  }

  return <PublicAppRightSidebarContent accountPending={authPresentation.kind === "unknown"} />;
}
