import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import {
  APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME,
  APP_SIDEBAR_NAVIGATION_LINK_PROPS,
} from "@/components/appSidebarNavigation";
import { OrganizationContextControl } from "@/organization/OrganizationContextControl";
import {
  findViewerOrganization,
  useOrganizationContext,
  type ViewerOrganization,
} from "@/organization/context";
import { PublicLandingAccountSection } from "@/components/PublicLandingAccountSection";
import {
  RepositoryDashboardSidebarContent,
  RepositoryDashboardStaticAccountLoadingSection,
  RepositoryDashboardStaticAccountSection,
  RepositoryDashboardStaticAccountStatusSection,
} from "@/components/repository-dashboard/RepositoryDashboardChrome";
import { SignedIn, SignedOut } from "@samebase/convex-auth-tanstack-start";
import { SessionPending } from "@/components/SessionPending";
import { useQuery } from "@tanstack/react-query";
import { rootQueries } from "@/routes/root.queries";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import {
  ORGANIZATION_CONNECT_REPO_ROUTE,
  ORGANIZATION_MEMBERS_ROUTE,
  ORGANIZATION_NEW_APP_ROUTE,
  ORGANIZATION_PROVIDERS_ROUTE,
  ORGANIZATION_SETTINGS_ROUTE,
  ORGANIZATION_REPOSITORIES_ROUTE,
  ORGANIZATIONS_ROUTE,
} from "@/organization/organizationRoutes";
import { APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID } from "@/lib/publicLanding";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";

type AppRightSidebarViewerAccess = (typeof api.users.currentViewerAccess)["_returnType"];
type AppRightSidebarViewer = NonNullable<(typeof api.users.viewer)["_returnType"]>;

function hasProviderSidebarAccess(viewerAccess: AppRightSidebarViewerAccess | undefined) {
  return viewerAccess?.accessKeys.includes("access_provider_connections") ?? false;
}

function AppRightSidebarAccountLoadingSection() {
  return (
    <RepositoryDashboardStaticAccountLoadingSection
      dataTestId={APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID}
      label="checking login"
    />
  );
}

function AppRightSidebarOnboardingVideo() {
  return (
    <section className="repository-dashboard-sidebar-inset pb-3 pt-6">
      <h2 className="text-2xl font-medium">First time using Samebase?</h2>
      <a
        className="mt-2 block"
        href="https://youtu.be/8-ZEGPpqi9Y"
        rel="noreferrer"
        target="_blank"
      >
        <span className="text-lg underline">
          Watch the complete onboarding on <span className="text-red-600">YouTube</span>
        </span>
        <img
          alt=""
          className="mt-2 aspect-[48/31] w-full object-cover"
          src="/onboarding/complete-onboarding-poster.webp"
        />
      </a>
    </section>
  );
}

function AppRightSidebarSessionRecordingConsent() {
  const setSessionRecordingConsent = useMutation(api.users.setSessionRecordingConsent);
  const [pendingDecision, setPendingDecision] = useState<"granted" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveDecision = async (decision: "granted" | "denied") => {
    if (pendingDecision !== null) {
      return;
    }

    setPendingDecision(decision);
    setError(null);
    try {
      await setSessionRecordingConsent({ decision });
    } catch {
      setError("Could not save this choice.");
    } finally {
      setPendingDecision(null);
    }
  };

  return (
    <section
      aria-labelledby="session-recording-consent-heading"
      className="repository-dashboard-sidebar-inset pb-3 pt-6"
    >
      <h2 id="session-recording-consent-heading" className="text-base font-semibold">
        Help improve Samebase
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Share recordings of how you use Samebase. Inputs and code stay hidden.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={pendingDecision !== null}
          onClick={() => void saveDecision("granted")}
          size="sm"
          type="button"
        >
          {pendingDecision === "granted" ? "Saving..." : "Allow"}
        </Button>
        <Button
          disabled={pendingDecision !== null}
          onClick={() => void saveDecision("denied")}
          size="sm"
          type="button"
          variant="outline"
        >
          {pendingDecision === "denied" ? "Saving..." : "No thanks"}
        </Button>
      </div>
      {error === null ? null : (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function AppRightSidebarProductUpdateEmailConsent() {
  const setProductUpdateEmailConsent = useMutation(api.users.setProductUpdateEmailConsent);
  const [pendingDecision, setPendingDecision] = useState<"granted" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveDecision = async (decision: "granted" | "denied") => {
    if (pendingDecision !== null) {
      return;
    }

    setPendingDecision(decision);
    setError(null);
    try {
      await setProductUpdateEmailConsent({ decision, source: "right_sidebar" });
    } catch {
      setError("Could not save this choice.");
    } finally {
      setPendingDecision(null);
    }
  };

  return (
    <section
      aria-labelledby="product-update-email-consent-heading"
      className="repository-dashboard-sidebar-inset pb-3 pt-6"
    >
      <h2 id="product-update-email-consent-heading" className="text-base font-semibold">
        Product updates
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Hear about new Samebase features by email.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={pendingDecision !== null}
          onClick={() => void saveDecision("granted")}
          size="sm"
          type="button"
        >
          {pendingDecision === "granted" ? "Saving..." : "Email me"}
        </Button>
        <Button
          disabled={pendingDecision !== null}
          onClick={() => void saveDecision("denied")}
          size="sm"
          type="button"
          variant="outline"
        >
          {pendingDecision === "denied" ? "Saving..." : "No thanks"}
        </Button>
      </div>
      {error === null ? null : (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function AppRightSidebarFooter({
  consentPrompt,
  showOnboardingVideo,
}: {
  consentPrompt: "product_update_email" | "session_recording" | null;
  showOnboardingVideo: boolean;
}) {
  return (
    <div className="mt-auto">
      {consentPrompt === "product_update_email" ? (
        <AppRightSidebarProductUpdateEmailConsent />
      ) : null}
      {consentPrompt === "session_recording" ? <AppRightSidebarSessionRecordingConsent /> : null}
      {showOnboardingVideo ? <AppRightSidebarOnboardingVideo /> : null}
      <AppSidebarMetaSection linkAlignment="left" />
    </div>
  );
}

function PublicAppRightSidebarContent({ accountPending }: { accountPending: boolean }) {
  return (
    <RepositoryDashboardSidebarContent>
      {accountPending ? <AppRightSidebarAccountLoadingSection /> : <PublicLandingAccountSection />}
      <AppRightSidebarFooter consentPrompt={null} showOnboardingVideo={false} />
    </RepositoryDashboardSidebarContent>
  );
}

function AppRightSidebarSignedInAccountSection({
  user,
}: {
  user: AppRightSidebarViewer | null | undefined;
}) {
  if (!user) {
    return <AppRightSidebarAccountLoadingSection />;
  }

  return (
    <RepositoryDashboardStaticAccountSection
      accountPresentation={user.accountPresentation}
      dataTestId={APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID}
    />
  );
}

function LoadingAuthenticatedAppRightSidebarContent() {
  return (
    <RepositoryDashboardSidebarContent>
      <AppRightSidebarSignedInAccountSection user={undefined} />
      <GlobalAppRightSidebarLinks />
      <AppRightSidebarFooter consentPrompt={null} showOnboardingVideo={false} />
    </RepositoryDashboardSidebarContent>
  );
}

function AccountOnlyAuthenticatedAppRightSidebarContent({
  deleting,
  pending,
}: {
  deleting: boolean;
  pending: boolean;
}) {
  const { data: user } = useQuery(rootQueries.viewer);
  const accountPresentation = user?.accountPresentation;

  return (
    <RepositoryDashboardSidebarContent>
      {deleting && accountPresentation !== undefined ? (
        <RepositoryDashboardStaticAccountStatusSection
          accountPresentation={accountPresentation}
          dataTestId={APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID}
          statusLabel="Deleting account"
        />
      ) : (
        <AppRightSidebarSignedInAccountSection user={user} />
      )}
      <GlobalAppRightSidebarLinks />
      {pending && accountPresentation !== undefined ? (
        <section
          aria-labelledby="pending-access-sidebar-heading"
          className="repository-dashboard-sidebar-inset flex flex-1 flex-col justify-center py-8"
          role="status"
        >
          <h2 id="pending-access-sidebar-heading" className="text-base font-semibold leading-6">
            Account access unavailable
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            You are signed in as{" "}
            <span className="[overflow-wrap:anywhere]">{accountPresentation.label}</span>
            {", but this account does not have access to Samebase."}
          </p>
        </section>
      ) : null}
      <AppRightSidebarFooter consentPrompt={null} showOnboardingVideo />
    </RepositoryDashboardSidebarContent>
  );
}

function GlobalAppRightSidebarLinks({
  showOrganizations = false,
}: {
  showOrganizations?: boolean;
}) {
  return (
    <nav
      aria-label="Account"
      className="repository-dashboard-sidebar-inset flex flex-col items-start gap-3 border-b border-border/50 py-3"
    >
      <Link
        {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        to={DASHBOARD_ROUTE}
      >
        All repositories
      </Link>
      {showOrganizations ? (
        <Link
          {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
          className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
          to={ORGANIZATIONS_ROUTE}
        >
          Organizations
        </Link>
      ) : null}
    </nav>
  );
}

function AdminAppRightSidebarLinks() {
  return (
    <nav
      aria-label="Admin"
      className="repository-dashboard-sidebar-inset flex flex-col items-start gap-3 border-b border-border/50 py-3"
    >
      <Link
        {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        to="/admin/users"
      >
        Users
      </Link>
      <Link
        {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        to="/admin/account-deletions"
      >
        Account deletions
      </Link>
      <Link
        {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        to="/admin/emails"
      >
        Emails
      </Link>
    </nav>
  );
}

function OrganizationAppRightSidebarLinks({ organization }: { organization: ViewerOrganization }) {
  const params = { owner: organization.githubOwnerLogin };
  return (
    <nav
      aria-label="Organization"
      className="repository-dashboard-sidebar-inset flex flex-col items-start gap-3 border-b border-border/50 py-3"
    >
      <Link
        {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        params={params}
        to={ORGANIZATION_REPOSITORIES_ROUTE}
      >
        Repositories
      </Link>
      <Link
        {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        params={params}
        to={ORGANIZATION_PROVIDERS_ROUTE}
      >
        Providers
      </Link>
      <Link
        {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        params={params}
        to={ORGANIZATION_NEW_APP_ROUTE}
      >
        New app
      </Link>
      <Link
        {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        params={params}
        to={ORGANIZATION_CONNECT_REPO_ROUTE}
      >
        Connect repository
      </Link>
      <Link
        {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        params={params}
        to={ORGANIZATION_MEMBERS_ROUTE}
      >
        Members
      </Link>
      <Link
        {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
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
  showAdminNavigation,
}: {
  showAdminNavigation: boolean;
}) {
  // The root loader fetched these for a server render with this access, so the links, the consent
  // prompt, and the onboarding video are in the first HTML; the subscriptions keep them live.
  const { data: user } = useQuery(rootQueries.viewer);
  const { data: repositories } = useQuery(rootQueries.repositories);
  const { data: productUpdateEmailConsent } = useQuery(rootQueries.productUpdateEmailConsent);
  const { data: sessionRecordingConsent } = useQuery(rootQueries.sessionRecordingConsent);
  const { organizations, surface } = useOrganizationContext();
  const navigationOrganization =
    surface.kind === "organization" && organizations
      ? findViewerOrganization(organizations, surface.owner)
      : (surface.kind === "allRepositories" || surface.kind === "organizations") &&
          organizations?.length === 1
        ? organizations[0]
        : null;
  const showOnboardingVideo =
    repositories !== undefined &&
    !repositories.some(
      (repository) => repository.hasConvexProvision && repository.hasCloudflareProvision,
    );
  const consentPrompt =
    productUpdateEmailConsent?.state === "not_decided"
      ? "product_update_email"
      : productUpdateEmailConsent !== undefined && sessionRecordingConsent?.state === "not_decided"
        ? "session_recording"
        : null;

  return (
    <RepositoryDashboardSidebarContent>
      <AppRightSidebarSignedInAccountSection user={user} />
      <GlobalAppRightSidebarLinks showOrganizations />
      <OrganizationContextControl />
      {showAdminNavigation ? <AdminAppRightSidebarLinks /> : null}
      {navigationOrganization === null ? null : (
        <OrganizationAppRightSidebarLinks organization={navigationOrganization} />
      )}
      <AppRightSidebarFooter
        consentPrompt={consentPrompt}
        showOnboardingVideo={showOnboardingVideo}
      />
    </RepositoryDashboardSidebarContent>
  );
}

// The root loader fetched the viewer for a server render with a session, so the signed-in sidebar
// is in the first HTML; after a sign-in in this tab, the queries load in the browser.
function SignedInAppRightSidebarContent() {
  const { data: viewerAccess } = useQuery(rootQueries.viewerAccess);

  if (!hasProviderSidebarAccess(viewerAccess)) {
    if (viewerAccess === undefined) {
      return <LoadingAuthenticatedAppRightSidebarContent />;
    }

    return (
      <AccountOnlyAuthenticatedAppRightSidebarContent
        deleting={viewerAccess.role === "role_deleting"}
        pending={viewerAccess.role === "role_pending_access"}
      />
    );
  }

  return (
    <AuthenticatedAppRightSidebarContent
      showAdminNavigation={viewerAccess?.accessKeys.includes("access_admin") ?? false}
    />
  );
}

export function AppRightSidebarContent() {
  return (
    <>
      <SignedIn>
        <SignedInAppRightSidebarContent />
      </SignedIn>
      <SignedOut>
        <PublicAppRightSidebarContent accountPending={false} />
      </SignedOut>
      <SessionPending>
        <PublicAppRightSidebarContent accountPending />
      </SessionPending>
    </>
  );
}
