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
import { SignedIn } from "@samebase/convex-auth-tanstack-start";
import { NotSignedIn } from "@/components/NotSignedIn";
import { useQuery } from "@tanstack/react-query";
import { rootQueries } from "@/routes/root.queries";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import {
  ORGANIZATION_CONNECT_REPO_ROUTE,
  ORGANIZATION_HUB_CLIENTS_ROUTE,
  ORGANIZATION_MEMBERS_ROUTE,
  ORGANIZATION_NEW_APP_ROUTE,
  ORGANIZATION_PROVIDERS_ROUTE,
  ORGANIZATION_SETTINGS_ROUTE,
  ORGANIZATION_REPOSITORIES_ROUTE,
  ORGANIZATION_STACKS_ROUTE,
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
}: {
  consentPrompt: "product_update_email" | "session_recording" | null;
}) {
  return (
    <div className="mt-auto">
      {consentPrompt === "product_update_email" ? (
        <AppRightSidebarProductUpdateEmailConsent />
      ) : null}
      {consentPrompt === "session_recording" ? <AppRightSidebarSessionRecordingConsent /> : null}
      <AppSidebarMetaSection linkAlignment="left" />
    </div>
  );
}

function PublicAppRightSidebarContent() {
  return (
    <RepositoryDashboardSidebarContent>
      <PublicLandingAccountSection />
      <AppRightSidebarFooter consentPrompt={null} />
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
      <AppRightSidebarFooter consentPrompt={null} />
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
      <AppRightSidebarFooter consentPrompt={null} />
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
      <Link
        {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
        className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
        to="/admin/hub-clients"
      >
        Hub clients
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
        to={ORGANIZATION_STACKS_ROUTE}
      >
        Stacks
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
        to={ORGANIZATION_HUB_CLIENTS_ROUTE}
      >
        Sign-in clients
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
  // The root loader fetched these for a server render with this access, so the links and the
  // consent prompt are in the first HTML; the subscriptions keep them live.
  const { data: user } = useQuery(rootQueries.viewer);
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
      <AppRightSidebarFooter consentPrompt={consentPrompt} />
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
      <NotSignedIn>
        <PublicAppRightSidebarContent />
      </NotSignedIn>
    </>
  );
}
